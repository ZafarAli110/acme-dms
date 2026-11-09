import { eq, sql } from "drizzle-orm";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWithDataScope, runWithOwnConnectionWait } from "#request-scope/data-scope";
import { createTestDatabaseAsync, type TestDatabase } from "#test-setup/postgres/test-database";
import { NORTHSIDE, NORTHWIND, SEEDED_AT, TEST_USER_ID } from "#test-setup/postgres/seed-kit";
import { bins } from "#persistence/schema/bins";
import { DatabaseBusyError } from "../database-busy.error";
import { createDatabasePool, createDatabasePools, type DatabasePools } from "../database-pool";
import { UnitOfWorkFactory } from "../unit-of-work.factory";

const AUDIT = { createdAt: SEEDED_AT, createdBy: TEST_USER_ID, updatedAt: SEEDED_AT, updatedBy: TEST_USER_ID };

function newBin(code: string) {
  return { dealerId: NORTHWIND, locationId: NORTHSIDE, code, description: `Bin ${code}`, ...AUDIT };
}

describe("UnitOfWork", () => {
  let database: TestDatabase;
  let pool: Pool;
  let factory: UnitOfWorkFactory;

  beforeAll(async () => {
    database = await createTestDatabaseAsync();
    pool = createDatabasePool(database.connectionString);
    factory = new UnitOfWorkFactory(pool);
  });

  afterAll(async () => {
    await pool.end();
    await database[Symbol.asyncDispose]();
  });

  async function binExistsAsync(code: string): Promise<boolean> {
    const rows = await database.db.select({ id: bins.id }).from(bins).where(eq(bins.code, code));
    return rows.length > 0;
  }

  it("commits what was written", async () => {
    {
      await using work = await factory.beginAsync();
      await work.db.insert(bins).values(newBin("C-01"));
      await work.commitAsync();
    }

    expect(await binExistsAsync("C-01")).toBe(true);
  });

  it("rolls back when disposed without a commit", async () => {
    {
      await using work = await factory.beginAsync();
      await work.db.insert(bins).values(newBin("R-01"));
    }

    expect(await binExistsAsync("R-01")).toBe(false);
  });

  /** A use case that writes, then fails before it ends. */
  async function insertThenFailAsync(): Promise<void> {
    await using work = await factory.beginAsync();
    await work.db.insert(bins).values(newBin("T-01"));
    throw new Error("the use case failed");
  }

  it("rolls back when the block throws", async () => {
    await expect(insertThenFailAsync()).rejects.toThrow("the use case failed");
    expect(await binExistsAsync("T-01")).toBe(false);
  });

  it("gives the connection back after failures", { timeout: 5_000 }, async () => {
    async function failingAsync(): Promise<void> {
      await using work = await factory.beginAsync();
      await work.db.select().from(bins);
      throw new Error("boom");
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      await expect(failingAsync()).rejects.toThrow("boom");
    }

    await using work = await factory.beginAsync();
    await work.db.insert(bins).values(newBin("P-01"));
    await work.commitAsync();
    expect(await binExistsAsync("P-01")).toBe(true);
  });

  it("refuses writes in a read-only unit of work", async () => {
    await using work = await factory.beginAsync({ readOnly: true });

    await expect(work.db.insert(bins).values(newBin("RO-01"))).rejects.toMatchObject({ cause: { code: "25006" } });
  });

  it("refuses a second commit", async () => {
    await using work = await factory.beginAsync();
    await work.commitAsync();

    await expect(work.commitAsync()).rejects.toThrow("The unit of work is already committed.");
  });

  it("survives an idle connection being dropped by the server", async () => {
    {
      await using work = await factory.beginAsync();
      await work.commitAsync();
    }
    // The connection is idle in the pool now; the server ends it, as a restart or a network reset would.
    await database.db.execute(
      sql`select pg_terminate_backend(pid) from pg_stat_activity
          where datname = current_database() and pid <> pg_backend_pid() and state = 'idle'`,
    );
    await new Promise((settle) => setTimeout(settle, 200));

    await using work = await factory.beginAsync();
    await work.db.insert(bins).values(newBin("I-01"));
    await work.commitAsync();
    expect(await binExistsAsync("I-01")).toBe(true);
  });
});

const asRequest = <T>(saves: boolean, run: () => Promise<T>, signal = new AbortController().signal): Promise<T> =>
  runWithDataScope(run, { saves, signal, connectBy: null, committed: false });

// ACME-121: which connections a unit of work may use, how long it waits, and stopping the work of a caller who left.
describe("UnitOfWorkFactory on a busy system", () => {
  let database: TestDatabase;
  let pools: DatabasePools;
  let factory: UnitOfWorkFactory;
  // A request waits 300 ms; work outside a request (and a request after its commit) waits 1 s.
  const waits = { listMs: 300, saveMs: 300, backgroundMs: 1_000 };

  beforeAll(async () => {
    database = await createTestDatabaseAsync();
    // One connection for lists, one kept for saves.
    pools = createDatabasePools(database.connectionString, {
      maxConnections: 2,
      saveConnections: 1,
      connectionTimeoutMs: 10_000,
      statementTimeoutMs: null,
    });
    factory = new UnitOfWorkFactory(pools, waits);
  });

  afterAll(async () => {
    await Promise.all(Object.values(pools).map((pool) => pool.end()));
    await database[Symbol.asyncDispose]();
  });

  it("answers a list busy when no list connection comes free within its wait", async () => {
    const held = await pools.lists.connect();
    try {
      const started = performance.now();
      await expect(asRequest(false, () => factory.beginAsync({ readOnly: true }))).rejects.toBeInstanceOf(
        DatabaseBusyError,
      );
      expect(performance.now() - started).toBeLessThan(1_000);
    } finally {
      held.release();
    }
  });

  it("gives a request one wait for all its units of work, so busy comes within one wait, not one per unit", async () => {
    const started = performance.now();
    const held = await pools.lists.connect();
    setTimeout(() => held.release(), 250);
    const failure = await asRequest(false, async () => {
      {
        // Waits about 250 ms of its 300, until the held connection comes back.
        await using first = await factory.beginAsync({ readOnly: true });
        await first.db.execute(sql`select pg_sleep(0.1)`);
      }
      const second = await pools.lists.connect();
      try {
        // The connection is taken again: the second unit of work has only what is left of the wait.
        await factory.beginAsync({ readOnly: true });
        return null;
      } finally {
        second.release();
      }
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DatabaseBusyError);
    expect(performance.now() - started).toBeLessThan(800);
  });

  // The state sweep's F12: an export's progress stream reads every second for minutes in one request; its first read
  // spent the request's one wait, so every later read was told busy after 100 ms.
  it("gives a read run with its own connection wait the full wait again, late in a long request", async () => {
    const outcome = await asRequest(false, async () => {
      {
        await using first = await factory.beginAsync({ readOnly: true });
        // Past the request's 300 ms wait.
        await first.db.execute(sql`select pg_sleep(0.4)`);
      }
      const held = await pools.lists.connect();
      setTimeout(() => held.release(), 200);
      return await runWithOwnConnectionWait(async () => {
        await using later = await factory.beginAsync({ readOnly: true });
        await later.db.execute(sql`select 1`);
        return "answered";
      });
    });

    expect(outcome).toBe("answered");
  });

  // The verifier's finding: a save's read after its commit shared the request's one wait, and could be answered busy,
  // "Nothing was changed", after the change was saved. After a commit, a request waits as background work does.
  it("never answers busy after the request has committed: its next unit of work waits", async () => {
    const outcome = await asRequest(true, async () => {
      {
        await using first = await factory.beginAsync();
        await first.db.execute(sql`select 1`);
        await first.commitAsync();
      }
      const held = await pools.saves.connect();
      setTimeout(() => held.release(), 600);
      // Past the request's wait (300 ms), with the only save connection held for 600 ms.
      await using after = await factory.beginAsync({ readOnly: true });
      await after.db.execute(sql`select 1`);
      return "answered";
    });

    expect(outcome).toBe("answered");
  });

  it("lets a save, its reads included, through on the connections kept for saves while every list one is busy", async () => {
    const held = await pools.lists.connect();
    try {
      const read = await asRequest(true, async () => {
        // A save handler reads before and after it writes (update-part does): a read-only unit of work in a save.
        await using work = await factory.beginAsync({ readOnly: true });
        const result = await work.db.execute<{ one: number }>(sql`select 1 as one`);
        return result.rows[0];
      });

      expect(read).toEqual({ one: 1 });
    } finally {
      held.release();
    }
  });

  it("never answers work outside a request busy: it waits, and fails plainly when nothing comes free", async () => {
    const held = await pools.saves.connect();
    try {
      const failure = await factory.beginAsync().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(DatabaseBusyError);
    } finally {
      held.release();
    }
  });

  it("opens the health check within 2 s while every list and save connection is held and cancels are running", async () => {
    const held = await Promise.all([pools.lists.connect(), pools.saves.connect()]);
    const cancels = Array.from({ length: 20 }, () =>
      pools.cancels.query("SELECT pg_sleep(0.05), pg_cancel_backend(0)"),
    );
    try {
      const started = performance.now();
      {
        await using work = await factory.beginHealthCheckAsync();
        await work.db.execute(sql`select 1`);
      }
      expect(performance.now() - started).toBeLessThan(2_000);
    } finally {
      for (const client of held) {
        client.release();
      }
      await Promise.all(cancels);
    }
  });

  it("cancels the running statement when the caller goes away", async () => {
    const callerGone = new AbortController();
    const started = performance.now();
    const sleeping = asRequest(
      false,
      async () => {
        await using work = await factory.beginAsync({ readOnly: true });
        await work.db.execute(sql`select pg_sleep(30)`);
      },
      callerGone.signal,
    );
    setTimeout(() => callerGone.abort(), 200);

    await expect(sleeping).rejects.toThrow();
    expect(performance.now() - started).toBeLessThan(3_000);
  });

  it("cancels nothing once the unit of work has ended, though the next request now uses its connection", async () => {
    const firstCaller = new AbortController();
    await asRequest(
      false,
      async () => {
        await using work = await factory.beginAsync({ readOnly: true });
        await work.db.execute(sql`select 1`);
      },
      firstCaller.signal,
    );

    const next = asRequest(false, async () => {
      await using work = await factory.beginAsync({ readOnly: true });
      await work.db.execute(sql`select pg_sleep(0.5)`);
      return "finished";
    });
    setTimeout(() => firstCaller.abort(), 100);

    await expect(next).resolves.toBe("finished");
  });
});
