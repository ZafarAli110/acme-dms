import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { bins } from "#persistence/schema/bins";
import { runWithDataScope, setDataScope } from "#request-scope/data-scope";
import { CENTRAL, NORTHSIDE, RIVERSIDE, TEST_USER_ID } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { TEST_NOW } from "#test-setup/time/fixed-clock";
import { AT_NORTHSIDE } from "#test-setup/users/test-users";
import { softDeleteAsync } from "../soft-delete";

describe("softDeleteAsync", () => {
  const database = useTestDatabase();

  const deletedCodesAsync = async (): Promise<string[]> =>
    (
      await database.db
        .select({ code: bins.code, locationId: bins.locationId })
        .from(bins)
        .where(eq(bins.isDeleted, true))
    )
      .map((row) => `${row.code}@${row.locationId}`)
      .toSorted();

  it("deletes only the request's own dealer's and location's rows, whatever the condition says", async () => {
    await database.seed.addBinAsync({ locationId: NORTHSIDE, code: "SD-1" });
    await database.seed.addBinAsync({ locationId: RIVERSIDE, code: "SD-1" });
    await database.seed.addBinAsync({ locationId: CENTRAL, code: "SD-1" });

    await runWithDataScope(async () => {
      setDataScope({ dealerId: AT_NORTHSIDE.dealerId, locationId: NORTHSIDE, userId: TEST_USER_ID });
      await using work = await database.unitOfWorkFactory.beginAsync();
      // The condition names the code only: another location's and another dealer's bins have it too.
      await softDeleteAsync(work.db, bins, eq(bins.code, "SD-1"), TEST_USER_ID, TEST_NOW);
      await work.commitAsync();
    });

    expect(await deletedCodesAsync()).toEqual([`SD-1@${NORTHSIDE}`]);
  });

  it("writes who deleted the row and when, and keeps the request's role for the rest of the transaction", async () => {
    await database.seed.addBinAsync({ locationId: NORTHSIDE, code: "SD-2" });

    const roleAfter = await runWithDataScope(async () => {
      setDataScope({ dealerId: AT_NORTHSIDE.dealerId, locationId: NORTHSIDE, userId: TEST_USER_ID });
      await using work = await database.unitOfWorkFactory.beginAsync();
      await softDeleteAsync(work.db, bins, eq(bins.code, "SD-2"), TEST_USER_ID, TEST_NOW);
      const role = (await work.db.execute<{ role: string }>(sql`select current_setting('role') as role`)).rows[0]?.role;
      // Still the request's: the policies hide the row it just deleted.
      const visible = await work.db
        .select()
        .from(bins)
        .where(and(eq(bins.code, "SD-2")));
      await work.commitAsync();
      return { role, visible: visible.length };
    });

    expect(roleAfter).toEqual({ role: "dealership_api_user", visible: 0 });
    const [row] = await database.db.select().from(bins).where(eq(bins.code, "SD-2"));
    expect(row).toMatchObject({ isDeleted: true, deletedBy: TEST_USER_ID, updatedBy: TEST_USER_ID });
    expect(row?.deletedAt?.toString()).toBe(TEST_NOW.toString());
  });

  it("needs a request's scope: without one it refuses instead of deleting across dealers", async () => {
    await database.seed.addBinAsync({ locationId: NORTHSIDE, code: "SD-3" });

    await using work = await database.unitOfWorkFactory.beginAsync();
    await expect(softDeleteAsync(work.db, bins, eq(bins.code, "SD-3"), TEST_USER_ID, TEST_NOW)).rejects.toThrow(
      /data scope/,
    );
  });
});
