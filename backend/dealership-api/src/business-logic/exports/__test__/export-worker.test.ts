import { mkdir, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { type ExportJobRow, exportJobs } from "#persistence/schema/export-jobs";
import { readSettings, type Settings } from "#settings/settings";
import { CENTRAL, NORTHSIDE, SEEDED_AT } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { fixedClock, TEST_NOW } from "#test-setup/time/fixed-clock";
import { ExportWorker } from "../export-worker";

describe("ExportWorker", () => {
  const database = useTestDatabase();
  let worker: ExportWorker | null = null;

  const workerWith = (changes: Partial<Settings> = {}): ExportWorker => {
    worker = new ExportWorker(database.unitOfWorkFactory, fixedClock(), { ...readSettings({}), ...changes });
    return worker;
  };

  // Each test leaves nothing waiting or running for the next one to claim.
  afterEach(async () => {
    await worker?.runUntilIdleAsync();
    await database.db.delete(exportJobs);
  });

  const statusOfAsync = async (jobId: string) =>
    (await database.db.select().from(exportJobs).where(eq(exportJobs.id, jobId)))[0];

  it("lets dealers take turns: one dealer's line does not keep another's single export waiting", async () => {
    const seed = database.seed;
    const northwind = [];
    for (const minute of [0, 1, 2]) {
      northwind.push(
        await seed.addExportJobAsync({ locationId: NORTHSIDE, createdAt: SEEDED_AT.add({ minutes: minute }) }),
      );
    }
    const cityMotors = await seed.addExportJobAsync({ locationId: CENTRAL, createdAt: SEEDED_AT.add({ minutes: 3 }) });

    const claimed = await workerWith({ exportMaxRunning: 2 }).claimAsync();

    expect(claimed.toSorted()).toEqual([northwind[0]!.id, cityMotors.id].toSorted());
  });

  it("runs no more of one dealer's exports at once than EXPORT_MAX_RUNNING_PER_DEALER", async () => {
    const jobs = [];
    for (const minute of [0, 1, 2, 3]) {
      jobs.push(
        await database.seed.addExportJobAsync({ locationId: NORTHSIDE, createdAt: SEEDED_AT.add({ minutes: minute }) }),
      );
    }

    const claimed = await workerWith({ exportMaxRunning: 5, exportMaxRunningPerDealer: 3 }).claimAsync();

    expect(claimed.toSorted()).toEqual(
      jobs
        .slice(0, 3)
        .map((job) => job.id)
        .toSorted(),
    );
  });

  it("gives an export whose worker went quiet back to the line once, then fails it", async () => {
    const quietSince = TEST_NOW.subtract({ seconds: 120 });
    const job = await database.seed.addExportJobAsync({
      locationId: NORTHSIDE,
      status: "writing",
      workerId: "a-worker-that-died",
      attempts: 1,
      rows: 500,
      totalRows: 1000,
      heartbeatAt: quietSince,
    });
    const sweeper = workerWith();

    await sweeper.sweepAsync();
    expect(await statusOfAsync(job.id)).toMatchObject({ status: "queued", rows: 0, totalRows: null, workerId: null });

    // Claimed again, and abandoned again.
    await database.db
      .update(exportJobs)
      .set({ status: "writing", workerId: "another-that-died", attempts: 2, heartbeatAt: quietSince })
      .where(eq(exportJobs.id, job.id));
    await sweeper.sweepAsync();

    expect(await statusOfAsync(job.id)).toMatchObject({
      status: "failed",
      // The catalog key; the API sends its text in the reader's language.
      error: "exports.failure.stoppedResponding",
    });
  });

  it("leaves a running export with a recent heartbeat alone", async () => {
    const job = await database.seed.addExportJobAsync({
      locationId: NORTHSIDE,
      status: "writing",
      workerId: "a-busy-worker",
      attempts: 1,
      heartbeatAt: TEST_NOW.subtract({ seconds: 5 }),
    });

    await workerWith().sweepAsync();

    expect(await statusOfAsync(job.id)).toMatchObject({ status: "writing", workerId: "a-busy-worker" });
  });

  it("expires a finished export past its time and deletes its file", async () => {
    const settings = readSettings({});
    await mkdir(settings.exportDirectory, { recursive: true });
    const done = await database.seed.addExportJobAsync({
      locationId: NORTHSIDE,
      status: "completed",
      finishedAt: TEST_NOW.subtract({ minutes: 20 }),
      expiresAt: TEST_NOW.subtract({ minutes: 5 }),
    });
    const filePath = join(settings.exportDirectory, `${done.id}.xlsx`);
    await writeFile(filePath, "not really a workbook");
    await database.db.update(exportJobs).set({ filePath }).where(eq(exportJobs.id, done.id));

    await workerWith().sweepAsync();

    expect(await statusOfAsync(done.id)).toMatchObject({ status: "expired", filePath: null });
    await expect(stat(filePath)).rejects.toThrow();
  });

  it("runs a claimed export to completed, with its file", async () => {
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, firstName: "Ann", surname: "Ash" });
    const job = await database.seed.addExportJobAsync({ locationId: NORTHSIDE });

    await workerWith().runUntilIdleAsync();

    const row = await statusOfAsync(job.id);
    expect(row).toMatchObject({ status: "completed", rows: 1, totalRows: 1, attempts: 1 });
    expect(row?.expiresAt?.toString()).toBe(TEST_NOW.add({ seconds: 900 }).toString());
    // One file per attempt: an attempt that lost the job can only ever remove its own.
    expect(row?.filePath).toBe(join(readSettings({}).exportDirectory, `${job.id}-1.xlsx`));
    await expect(stat(row!.filePath!)).resolves.toBeTruthy();
  });

  it("ignores the writes of an attempt this worker lost, once it claimed the job again", async () => {
    // This worker's id, as a job it ran records it.
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, firstName: "Ann", surname: "Ash" });
    const ran = await database.seed.addExportJobAsync({ locationId: NORTHSIDE });
    const sameWorker = workerWith();
    await sameWorker.runUntilIdleAsync();
    const workerId = (await statusOfAsync(ran.id))!.workerId!;
    // Its first attempt went quiet, was swept, and this worker claimed the job again: attempt 2 is the live one.
    const job = await database.seed.addExportJobAsync({
      locationId: NORTHSIDE,
      status: "writing",
      workerId,
      attempts: 2,
      rows: 10,
      heartbeatAt: TEST_NOW,
    });
    const internals = sameWorker as unknown as {
      updateHeldAsync(jobId: string, attempt: number, changes: Partial<ExportJobRow>): Promise<unknown[]>;
    };

    const late = await internals.updateHeldAsync(job.id, 1, { rows: 999, status: "failed" });

    expect(late).toHaveLength(0);
    expect(await statusOfAsync(job.id)).toMatchObject({ status: "writing", rows: 10, attempts: 2 });
  });

  it("removes old export files no job points at, and keeps a completed attempt's file", async () => {
    const directory = readSettings({}).exportDirectory;
    await mkdir(directory, { recursive: true });
    const done = await database.seed.addExportJobAsync({
      locationId: NORTHSIDE,
      status: "completed",
      attempts: 2,
      finishedAt: TEST_NOW,
      expiresAt: TEST_NOW.add({ minutes: 10 }),
    });
    const completedFile = join(directory, `${done.id}-2.xlsx`);
    const strayFile = join(directory, `${done.id}-1.xlsx`);
    await database.db.update(exportJobs).set({ filePath: completedFile }).where(eq(exportJobs.id, done.id));
    // Both written long ago: the stray one by an attempt that stopped between writing it and completing the job.
    const longAgo = TEST_NOW.subtract({ minutes: 10 }).epochMilliseconds / 1000;
    for (const file of [completedFile, strayFile]) {
      await writeFile(file, "not really a workbook");
      await utimes(file, longAgo, longAgo);
    }

    await workerWith().sweepAsync();

    await expect(stat(completedFile)).resolves.toBeTruthy();
    await expect(stat(strayFile)).rejects.toThrow();
  });
});
