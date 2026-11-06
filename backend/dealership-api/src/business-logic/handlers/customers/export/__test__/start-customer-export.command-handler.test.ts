import { runWithDataScope } from "#request-scope/data-scope";
import { BadRequestException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { ExportJobResponseDto } from "#dto/exports/export-job-response.dto";
import type { ExportRequestDto } from "#dto/exports/export-request.dto";
import { exportJobs } from "#persistence/schema/export-jobs";
import { readSettings } from "#settings/settings";
import { NORTHSIDE, RIVERSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { fixedClock } from "#test-setup/time/fixed-clock";
import { AT_NORTHSIDE, AT_RIVERSIDE, userAt } from "#test-setup/users/test-users";
import { readXlsxAsync } from "#test-setup/xlsx/read-xlsx";
import { ExportQueue } from "../../../../exports/export-queue";
import { ExportWorker } from "../../../../exports/export-worker";
import { StartCustomerExportCommandHandler } from "../start-customer-export.command-handler";

const date = (iso: string) => Temporal.PlainDate.from(iso);

function request(changes: Partial<ExportRequestDto> = {}): ExportRequestDto {
  return {
    columns: [
      { field: "name", header: "Name" },
      { field: "city", header: "City" },
      { field: "lastContactDate", header: "Last contact" },
    ],
    ...changes,
  } as ExportRequestDto;
}

describe("StartCustomerExportCommandHandler", () => {
  const database = useTestDatabase();
  let queue: ExportQueue;
  let worker: ExportWorker;
  let handler: StartCustomerExportCommandHandler;

  beforeAll(() => {
    const settings = readSettings({});
    queue = new ExportQueue(database.unitOfWorkFactory, fixedClock(), settings);
    worker = new ExportWorker(database.unitOfWorkFactory, fixedClock(), settings);
    handler = new StartCustomerExportCommandHandler(queue, fixedClock());
  });

  /** Lets the worker run everything waiting (as its own process would), then reads the export as its owner. */
  const finishedAsync = async (job: ExportJobResponseDto): Promise<ExportJobResponseDto> => {
    await worker.runUntilIdleAsync();
    return queue.getAsync(AT_NORTHSIDE, job.id);
  };

  const fileOfAsync = async (job: ExportJobResponseDto) => {
    const link = new URL(job.downloadPath!, "http://service/");
    // As the public download route runs it: inside a request that has no scope (no token).
    const file = await runWithDataScope(() =>
      queue.fileForLinkAsync(job.id, link.searchParams.get("expires")!, link.searchParams.get("signature")!),
    );
    return readXlsxAsync(file.path);
  };

  it("queues the export, and the worker writes every row the list shows: this location's, filtered and sorted as asked, with the chosen columns", async () => {
    const seed = database.seed;
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      firstName: "Ann",
      surname: "Ash",
      city: "Leeds",
      lastContactDate: date("2026-09-01"),
    });
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      firstName: "Bo",
      surname: "Birch",
      city: "York",
      lastContactDate: date("2026-10-01"),
    });
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      firstName: "Cy",
      surname: "Cedar",
      city: "Leeds",
      status: "inactive",
    });
    await seed.addCustomerAsync({
      locationId: NORTHSIDE,
      firstName: "Di",
      surname: "Deleted",
      city: "Leeds",
      deleted: true,
    });
    await seed.addCustomerAsync({ locationId: RIVERSIDE, firstName: "Ed", surname: "Elm", city: "Leeds" });

    const started = await handler.executeAsync(
      AT_NORTHSIDE,
      request({
        filterField: "status",
        filterOperator: "is",
        filterValue: "active",
        sort: "lastContactDate",
        direction: "desc",
      }),
      null,
    );
    const finished = await finishedAsync(started);
    const [sheet] = await fileOfAsync(finished);

    expect(started).toMatchObject({ kind: "customers", status: "queued", queuePosition: 1, rows: 0 });
    expect(finished).toMatchObject({ status: "completed", rows: 2, totalRows: 2 });
    expect(sheet?.rows).toEqual([
      ["Name", "City", "Last contact"],
      ["Bo Birch", "York", String(Temporal.PlainDate.from("2026-10-01").since("1899-12-30").days)],
      ["Ann Ash", "Leeds", String(Temporal.PlainDate.from("2026-09-01").since("1899-12-30").days)],
    ]);
    expect(sheet?.dateCells[1]).toEqual([false, false, true]);
  });

  it("heads each column with the header the request gives, or with the column's own heading when it gives none", async () => {
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, firstName: "Cy", surname: "Cole", city: "Hull" });

    const started = await handler.executeAsync(
      AT_NORTHSIDE,
      request({ columns: [{ field: "lastContactDate", header: "Date" }, { field: "city" }, { field: "companyName" }] }),
      null,
    );
    const [sheet] = await fileOfAsync(await finishedAsync(started));

    expect(sheet?.rows[0]).toEqual(["Date", "City", "Company"]);
  });

  it("gives a retry with the same idempotency key the same export, and refuses the key for another request", async () => {
    const first = await handler.executeAsync(AT_NORTHSIDE, request(), "key-1");
    const retry = await handler.executeAsync(AT_NORTHSIDE, request(), "key-1");

    expect(retry.id).toBe(first.id);
    await expect(handler.executeAsync(AT_NORTHSIDE, request({ sort: "city" }), "key-1")).rejects.toThrow(
      UnprocessableEntityException,
    );
    await finishedAsync(first);
  });

  it("refuses a column the list can't export, and a sort it doesn't have, before queueing anything", async () => {
    const before = await database.db.select().from(exportJobs);

    await expect(
      handler.executeAsync(AT_NORTHSIDE, request({ columns: [{ field: "password", header: "P" }] }), null),
    ).rejects.toThrow(BadRequestException);
    await expect(handler.executeAsync(AT_NORTHSIDE, request({ sort: "password" }), null)).rejects.toThrow(
      BadRequestException,
    );
    expect(await database.db.select().from(exportJobs)).toHaveLength(before.length);
  });

  it("keeps someone else's export to them: another user's lookup is not found", async () => {
    const job = await handler.executeAsync(AT_RIVERSIDE, request(), null);

    await expect(queue.getAsync(userAt(NORTHSIDE), job.id)).resolves.toMatchObject({ id: job.id });
    await expect(
      queue.getAsync({ ...AT_RIVERSIDE, userId: "30000000-0000-0000-0000-0000000000bb" }, job.id),
    ).rejects.toThrow(NotFoundException);
    await finishedAsync(job);
  });

  it("cancels a waiting export: the worker never writes it", async () => {
    const job = await handler.executeAsync(AT_NORTHSIDE, request(), null);
    await queue.cancelAsync(AT_NORTHSIDE, job.id);

    const finished = await finishedAsync(job);
    const [row] = await database.db.select().from(exportJobs).where(eq(exportJobs.id, job.id));

    expect(finished.status).toBe("cancelled");
    expect(finished.downloadPath).toBeNull();
    expect(row?.attempts).toBe(0);
  });
});
