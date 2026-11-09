import { readSettings } from "#settings/settings";
import { describe, expect, it } from "vitest";
import type { ListQueryDto } from "#dto/paging/list-query.dto";
import { AT_NORTHSIDE, AT_RIVERSIDE } from "#test-setup/users/test-users";
import { CENTRAL, NORTHSIDE, RIVERSIDE } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { CountPartsQueryHandler } from "../../count/count-parts.query-handler";
import { GetPartListQueryHandler } from "../get-part-list.query-handler";

const numbers = (list: { items: { partNumber: string }[] }) => list.items.map((item) => item.partNumber);

describe("GetPartListQueryHandler", () => {
  const database = useTestDatabase();
  const searchAsync = (search: string, more: { sort?: string; direction?: "asc" | "desc" } = {}, user = AT_NORTHSIDE) =>
    database
      .asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory, readSettings({})))
      .executeAsync(user, { page: 1, pageSize: 25, search, ...more });
  const listAsync = (query: ListQueryDto) =>
    database
      .asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory, readSettings({})))
      .executeAsync(AT_NORTHSIDE, query);
  const sorted = async (sort: string, direction: "asc" | "desc") =>
    numbers(
      await listAsync({
        page: 1,
        pageSize: 25,
        sort,
        direction,
        filterField: "partNumber",
        filterOperator: "startsWith",
        filterValue: "SRT-",
      }),
    );
  const countAsync = (query: ListQueryDto) =>
    database.asRequest(new CountPartsQueryHandler(database.unitOfWorkFactory)).executeAsync(AT_NORTHSIDE, query);

  it("lists only parts stocked at the selected location, without deleted ones, with their default thumbnail", async () => {
    const { part } = await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "AIR-001" });
    await database.seed.addPhotoAsync({ partId: part.id, isDefault: false });
    const thumbnail = await database.seed.addPhotoAsync({ partId: part.id, isDefault: true });
    await database.seed.addStockedPartAsync({ locationId: RIVERSIDE, partNumber: "RIV-001" });
    await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "OLD-001", deleted: true });

    const list = await database
      .asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory, readSettings({})))
      .executeAsync(AT_NORTHSIDE, {
        page: 1,
        pageSize: 25,
        search: undefined,
      });

    expect(list.items.map((item) => item.partNumber)).toEqual(["AIR-001"]);
    expect(list.items[0]?.thumbnailDocumentId).toBe(thumbnail.documentId);
    expect(list.hasMore).toBe(false);
  });

  // "Equals" on text is exact with the case ignored, and % and _ are the characters (ACME-117 rewrites it from ILIKE to
  // lower() = lower(), for the city's index: the same parts before and after).
  it("filters by an exact part number, case ignored, with % as the character", async () => {
    await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "PCT-50%" });
    await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "PCT-500" });
    const handler = database.asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory, readSettings({})));

    const list = await handler.executeAsync(AT_NORTHSIDE, {
      page: 1,
      pageSize: 25,
      filterField: "partNumber",
      filterOperator: "equals",
      filterValue: "pct-50%",
    });

    expect(list.items.map((item) => item.partNumber)).toEqual(["PCT-50%"]);
  });

  it("searches part number and description", async () => {
    await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "BRK-777" });

    const list = await database
      .asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory, readSettings({})))
      .executeAsync(AT_NORTHSIDE, {
        page: 1,
        pageSize: 25,
        search: "brk-7",
      });

    expect(list.items.map((item) => item.partNumber)).toEqual(["BRK-777"]);
  });

  it("sorts by quantity and filters by the bin, counting the same rows it shows", async () => {
    await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "QTY-1", quantityOnHand: 3 });
    await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "QTY-2", quantityOnHand: 9 });
    await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "QTY-3", quantityOnHand: 6 });
    const handler = database.asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory, readSettings({})));

    const list = await handler.executeAsync(AT_NORTHSIDE, {
      page: 1,
      pageSize: 2,
      sort: "onHand",
      direction: "desc",
      filterField: "bin",
      filterOperator: "startsWith",
      filterValue: "B-QTY",
    });

    expect(list.items.map((item) => item.partNumber)).toEqual(["QTY-2", "QTY-3"]);
    expect(list.hasMore).toBe(true);
    await expect(
      countAsync({ page: 1, pageSize: 2, filterField: "bin", filterOperator: "startsWith", filterValue: "B-QTY" }),
    ).resolves.toEqual({ kind: "exact", value: 3 });
  });

  // ACME-124: the page's ids come without the bins join; a part in a deleted bin is left out by a condition, so the page
  // stays full, and its next page and `hasMore` agree with the count.
  it("keeps a page full when a part inside it is in a deleted bin, the next page and hasMore agreeing with the count", async () => {
    for (const n of [1, 2, 3, 4, 5]) {
      await database.seed.addStockedPartAsync({ locationId: NORTHSIDE, partNumber: `DBN-${n}`, binDeleted: n === 2 });
    }
    const only = { filterField: "partNumber", filterOperator: "startsWith", filterValue: "DBN-" } as const;

    const first = await listAsync({ page: 1, pageSize: 2, ...only });
    const second = await listAsync({ page: 2, pageSize: 2, ...only });
    const last = await listAsync({ page: 3, pageSize: 2, ...only });

    expect([numbers(first), first.hasMore]).toEqual([["DBN-1", "DBN-3"], true]);
    expect([numbers(second), second.hasMore]).toEqual([["DBN-4", "DBN-5"], false]);
    expect([numbers(last), last.hasMore]).toEqual([[], false]);
    await expect(countAsync({ page: 1, pageSize: 2, ...only })).resolves.toEqual({ kind: "exact", value: 4 });
  });

  it("sorts by every column it shows, each way, ties by the part", async () => {
    const seed = database.seed;
    await seed.addStockedPartAsync({
      locationId: NORTHSIDE,
      partNumber: "SRT-A",
      description: "Caliper",
      quantityOnHand: 7,
      reorderLevel: 1,
      unitPriceCents: 300,
    });
    await seed.addStockedPartAsync({
      locationId: NORTHSIDE,
      partNumber: "SRT-B",
      description: "Axle",
      quantityOnHand: 2,
      reorderLevel: 3,
      unitPriceCents: 100,
    });
    await seed.addStockedPartAsync({
      locationId: NORTHSIDE,
      partNumber: "SRT-C",
      description: "Bearing",
      quantityOnHand: 4,
      reorderLevel: 2,
      unitPriceCents: 200,
    });

    expect(await sorted("partNumber", "desc")).toEqual(["SRT-C", "SRT-B", "SRT-A"]);
    expect(await sorted("description", "asc")).toEqual(["SRT-B", "SRT-C", "SRT-A"]);
    expect(await sorted("bin", "desc")).toEqual(["SRT-C", "SRT-B", "SRT-A"]);
    expect(await sorted("onHand", "asc")).toEqual(["SRT-B", "SRT-C", "SRT-A"]);
    expect(await sorted("reorderLevel", "desc")).toEqual(["SRT-B", "SRT-C", "SRT-A"]);
    expect(await sorted("unitPriceCents", "asc")).toEqual(["SRT-B", "SRT-C", "SRT-A"]);
  });

  it("says whether another page follows, false on the last page and past it", async () => {
    const only = { filterField: "partNumber", filterOperator: "startsWith", filterValue: "SRT-" } as const;

    const full = await listAsync({ page: 1, pageSize: 3, ...only });
    const split = await listAsync({ page: 1, pageSize: 2, ...only });
    const past = await listAsync({ page: 4, pageSize: 2, ...only });

    expect([full.items.length, full.hasMore]).toEqual([3, false]);
    expect([split.items.length, split.hasMore]).toEqual([2, true]);
    expect([past.items.length, past.hasMore]).toEqual([0, false]);
  });

  describe("the search by words and part number (ACME-123)", () => {
    it("finds every word in any order, in its other forms, each as the beginning of a word", async () => {
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "BRK-PAD-100",
        description: "Brake pad set, front",
      });
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "BRK-DSC-200",
        description: "Brake disc, front",
      });
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "FLT-OIL-300",
        description: "Oil filter, spin-on",
      });

      expect((await searchAsync("pads brake front")).items.map((item) => item.partNumber)).toEqual(["BRK-PAD-100"]);
      expect((await searchAsync("brak pads")).items.map((item) => item.partNumber)).toEqual(["BRK-PAD-100"]);
      expect((await searchAsync("brake pa")).items.map((item) => item.partNumber)).toEqual(["BRK-PAD-100"]);
      expect((await searchAsync("filters")).items.map((item) => item.partNumber)).toEqual(["FLT-OIL-300"]);
      expect((await searchAsync("pads for the front")).items.map((item) => item.partNumber)).toEqual(["BRK-PAD-100"]);
      // A fragment from the middle of a word is not a word's beginning (D2).
      expect((await searchAsync("rake")).items).toEqual([]);
    });

    it("puts the part number itself first, then numbers starting with it, then numbers holding it, then words", async () => {
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "ACLT-KIT-1",
        description: "Adapter",
      });
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "CLT-KIT-1",
        description: "Clutch kit",
      });
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "CLT-KIT-12",
        description: "Clutch kit",
      });
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "SHM-9",
        description: "Clt kit shim",
      });

      expect((await searchAsync("clt-kit-1")).items.map((item) => item.partNumber)).toEqual([
        "CLT-KIT-1",
        "CLT-KIT-12",
        "ACLT-KIT-1",
      ]);
      // "CLT-KIT" as words also finds the shim, after every part-number match.
      expect((await searchAsync("CLT-KIT")).items.map((item) => item.partNumber)).toEqual([
        "CLT-KIT-1",
        "CLT-KIT-12",
        "ACLT-KIT-1",
        "SHM-9",
      ]);
      expect((await searchAsync("KIT-12")).items.map((item) => item.partNumber)).toEqual(["CLT-KIT-12"]);
    });

    it("ranks the description that matches the words most closely first, and a column sort wins", async () => {
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "A-1",
        description: "Wiper blade arm cover, rear, for estate models with a tailgate",
      });
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "Z-9",
        description: "Wiper blade, rear",
      });

      expect((await searchAsync("rear wiper blade")).items.map((item) => item.partNumber)).toEqual(["Z-9", "A-1"]);
      expect(
        (await searchAsync("rear wiper blade", { sort: "partNumber", direction: "asc" })).items.map(
          (item) => item.partNumber,
        ),
      ).toEqual(["A-1", "Z-9"]);
    });

    it("never shows or counts another location's, another dealer's, a deleted part or one in a deleted bin", async () => {
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "CAB-1",
        description: "Cabin filter",
      });
      await database.seed.addStockedPartAsync({
        locationId: RIVERSIDE,
        partNumber: "CAB-2",
        description: "Cabin filter",
      });
      await database.seed.addStockedPartAsync({
        locationId: CENTRAL,
        partNumber: "CAB-3",
        description: "Cabin filter",
      });
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "CAB-4",
        description: "Cabin filter",
        deleted: true,
      });
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "CAB-5",
        description: "Cabin filter",
        binDeleted: true,
      });

      const atNorthside = await searchAsync("cabin filter");
      expect(atNorthside.items.map((item) => item.partNumber)).toEqual(["CAB-1"]);
      expect(atNorthside.hasMore).toBe(false);
      const byNumber = await searchAsync("CAB-");
      expect(byNumber.items.map((item) => item.partNumber)).toEqual(["CAB-1"]);
      expect(byNumber.hasMore).toBe(false);
      const atRiverside = await searchAsync("cabin filter", {}, AT_RIVERSIDE);
      expect(atRiverside.items.map((item) => item.partNumber)).toEqual(["CAB-2"]);
      expect(atRiverside.hasMore).toBe(false);
    });

    it("treats quotes, operators and wildcards as text, and finds nothing for words nobody has", async () => {
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "TAG-75%",
        description: "Discount tag",
      });
      await database.seed.addStockedPartAsync({
        locationId: NORTHSIDE,
        partNumber: "TAG-750",
        description: "Price tag",
      });

      expect((await searchAsync("75%")).items.map((item) => item.partNumber)).toEqual(["TAG-75%"]);
      expect((await searchAsync("TAG_7")).items).toEqual([]);
      for (const search of ["tag' | !price", "a & b", "(x):* <->", "--", "the"]) {
        await expect(searchAsync(search)).resolves.toBeDefined();
      }
      // A page past the last is empty, and says nothing follows.
      const pastTheEnd = await database
        .asRequest(new GetPartListQueryHandler(database.unitOfWorkFactory, readSettings({})))
        .executeAsync(AT_NORTHSIDE, { page: 5, pageSize: 25, search: "tag" });
      expect(pastTheEnd.items).toEqual([]);
      expect(pastTheEnd.hasMore).toBe(false);
      const nothing = await searchAsync("hovercraft skirt");
      expect(nothing.items).toEqual([]);
      expect(nothing.hasMore).toBe(false);
    });
  });
});
