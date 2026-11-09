import {
  type CanActivate,
  type ExecutionContext,
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_PIPE, NestFactory } from "@nestjs/core";
import { I18nModule } from "@nestjs/i18n";
import { NodeAdapter, type NestNodeApplication } from "@nestjs/platform-node";
import { ResilienceModule } from "@nestjs/resilience";
import { and, eq, sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CREATE_BIN_COMMAND_HANDLER } from "#business-logic-abstractions/handlers/bins/create/create-bin.command-handler.interface";
import { CREATE_CUSTOMER_COMMAND_HANDLER } from "#business-logic-abstractions/handlers/customers/create/create-customer.command-handler.interface";
import { UPDATE_CUSTOMER_COMMAND_HANDLER } from "#business-logic-abstractions/handlers/customers/update/update-customer.command-handler.interface";
import { CREATE_PART_COMMAND_HANDLER } from "#business-logic-abstractions/handlers/parts/create/create-part.command-handler.interface";
import { UPDATE_PART_COMMAND_HANDLER } from "#business-logic-abstractions/handlers/parts/update/update-part.command-handler.interface";
import { UPLOAD_PART_PHOTO_COMMAND_HANDLER } from "#business-logic-abstractions/handlers/parts/upload-photo/upload-part-photo.command-handler.interface";
import { SET_STOCK_LEVEL_COMMAND_HANDLER } from "#business-logic-abstractions/handlers/stock/set-level/set-stock-level.command-handler.interface";
import { IDEMPOTENCY_RECORDS } from "#business-logic-abstractions/idempotency/idempotency-records.interface";
import { DOCUMENT_API_CLIENT } from "#business-logic-abstractions/rest-clients/document-api.client.interface";
import { CLOCK } from "#business-logic-abstractions/time/clock.interface";
import type { UserContext } from "#business-logic-abstractions/user-context/user-context";
import { CreateBinCommandHandler } from "#business-logic/handlers/bins/create/create-bin.command-handler";
import { CreateCustomerCommandHandler } from "#business-logic/handlers/customers/create/create-customer.command-handler";
import { UpdateCustomerCommandHandler } from "#business-logic/handlers/customers/update/update-customer.command-handler";
import { CreatePartCommandHandler } from "#business-logic/handlers/parts/create/create-part.command-handler";
import { UpdatePartCommandHandler } from "#business-logic/handlers/parts/update/update-part.command-handler";
import { UploadPartPhotoCommandHandler } from "#business-logic/handlers/parts/upload-photo/upload-part-photo.command-handler";
import { SetStockLevelCommandHandler } from "#business-logic/handlers/stock/set-level/set-stock-level.command-handler";
import { IdempotencyRecords } from "#business-logic/idempotency/idempotency-records";
import { i18nOptions } from "#i18n/messages";
import { bins } from "#persistence/schema/bins";
import { customers } from "#persistence/schema/customers";
import { idempotencyRecords } from "#persistence/schema/idempotency-records";
import { partPhotos } from "#persistence/schema/part-photos";
import { parts } from "#persistence/schema/parts";
import { createDatabasePools, type DatabasePools } from "#persistence/unit-of-work/database-pool";
import { UnitOfWorkFactory } from "#persistence/unit-of-work/unit-of-work.factory";
import { UNIT_OF_WORK_FACTORY } from "#persistence/unit-of-work/unit-of-work.factory.interface";
import { currentRequest, runWithDataScope, setDataScope } from "#request-scope/data-scope";
import { readSettings, SETTINGS } from "#settings/settings";
import { fakeDocumentApi } from "#test-setup/document-api/fake-document-api";
import { NORTHSIDE, NORTHWIND, seedKit, TEST_USER_ID } from "#test-setup/postgres/seed-kit";
import { createTestDatabaseAsync, type TestDatabase } from "#test-setup/postgres/test-database";
import { fixedClock } from "#test-setup/time/fixed-clock";
import { TEST_ACCESS_TOKEN } from "#test-setup/users/test-users";
import { BinCommandController } from "../../controllers/bins/bin-command.controller";
import { CustomerCommandController } from "../../controllers/customers/customer-command.controller";
import { PartCommandController } from "../../controllers/parts/part-command.controller";
import { StockCommandController } from "../../controllers/stock/stock-command.controller";
import { ProblemDetailsFilter } from "../../filters/problem-details.filter";
import { DataScopeMiddleware } from "../../middleware/data-scope.middleware";
import { ValibotValidationPipe } from "../../validation/valibot-pipe";

const OTHER_USER_ID = "30000000-0000-0000-0000-0000000000bb";

/** Stands in for the guards: sam at Northside, or another Northwind user when the test says so (`x-test-user`). */
class TestUserGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; userContext?: UserContext }>();
    const userId = request.headers["x-test-user"] === "other" ? OTHER_USER_ID : TEST_USER_ID;
    const userContext: UserContext = {
      userId,
      dealerId: NORTHWIND,
      locationId: NORTHSIDE,
      permissions: [],
      accessToken: TEST_ACCESS_TOKEN,
    };
    request.userContext = userContext;
    setDataScope({ dealerId: NORTHWIND, locationId: NORTHSIDE, userId });
    return true;
  }
}

const CUSTOMER = {
  firstName: "Grace",
  surname: "Hopper",
  companyName: null,
  email: null,
  phone: "555-0100",
  city: null,
  status: "active",
  lastContactDate: null,
};

/**
 * The seven saves over HTTP, as the service runs them (ACME-125): the real controllers, handlers and unit of work on
 * a real Postgres, with a save pool of one connection so "busy" can be shown.
 */
describe("a save sent with an Idempotency-Key", () => {
  let database: TestDatabase;
  let pools: DatabasePools;
  let app: NestNodeApplication;
  let baseUrl = "";
  const documentApi = fakeDocumentApi();
  /** After the next commit, the request's next read fails: a failure after the save went through. */
  let failReadAfterCommit = false;
  let keyNumber = 0;
  let key = "";

  beforeAll(async () => {
    database = await createTestDatabaseAsync();
    pools = createDatabasePools(database.connectionString, {
      maxConnections: 3,
      saveConnections: 1,
      connectionTimeoutMs: 10_000,
      statementTimeoutMs: 10_000,
    });
    const realFactory = new UnitOfWorkFactory(pools, { listMs: 1_500, saveMs: 500, backgroundMs: 5_000 });
    let armed = false;
    const factory = {
      beginAsync: async (options?: { readOnly: boolean; asOwner?: boolean }) => {
        if (armed && options?.readOnly) {
          armed = false;
          throw new Error("The connection was lost after the commit.");
        }
        const work = await realFactory.beginAsync(options);
        // The save's own commit, not the key's claim (which runs apart from the request, holding no key).
        const holdsKey = Boolean(currentRequest()?.idempotency);
        const commitAsync = work.commitAsync.bind(work);
        work.commitAsync = async () => {
          await commitAsync();
          if (failReadAfterCommit && holdsKey) {
            failReadAfterCommit = false;
            armed = true;
          }
        };
        return work;
      },
      beginHealthCheckAsync: () => realFactory.beginHealthCheckAsync(),
    };
    const settings = readSettings({ REQUEST_TIMEOUT: "30s" });

    @Module({
      imports: [
        I18nModule.forRoot(i18nOptions()),
        ResilienceModule.forRoot({ defaults: { timeout: settings.requestTimeoutMs } }),
      ],
      controllers: [CustomerCommandController, PartCommandController, BinCommandController, StockCommandController],
      providers: [
        { provide: UNIT_OF_WORK_FACTORY, useValue: factory },
        { provide: CLOCK, useValue: fixedClock() },
        { provide: SETTINGS, useValue: settings },
        { provide: DOCUMENT_API_CLIENT, useValue: documentApi.client },
        { provide: CREATE_CUSTOMER_COMMAND_HANDLER, useClass: CreateCustomerCommandHandler },
        { provide: UPDATE_CUSTOMER_COMMAND_HANDLER, useClass: UpdateCustomerCommandHandler },
        { provide: CREATE_PART_COMMAND_HANDLER, useClass: CreatePartCommandHandler },
        { provide: UPDATE_PART_COMMAND_HANDLER, useClass: UpdatePartCommandHandler },
        { provide: UPLOAD_PART_PHOTO_COMMAND_HANDLER, useClass: UploadPartPhotoCommandHandler },
        { provide: CREATE_BIN_COMMAND_HANDLER, useClass: CreateBinCommandHandler },
        { provide: SET_STOCK_LEVEL_COMMAND_HANDLER, useClass: SetStockLevelCommandHandler },
        IdempotencyRecords,
        { provide: IDEMPOTENCY_RECORDS, useExisting: IdempotencyRecords },
        { provide: APP_GUARD, useClass: TestUserGuard },
        { provide: APP_FILTER, useValue: new ProblemDetailsFilter(fixedClock()) },
        { provide: APP_PIPE, useValue: new ValibotValidationPipe() },
      ],
    })
    class SavesModule implements NestModule {
      public configure(consumer: MiddlewareConsumer): void {
        consumer.apply(DataScopeMiddleware).forRoutes("*");
      }
    }

    app = await NestFactory.create<NestNodeApplication>(SavesModule, new NodeAdapter(), { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await pools.lists.end();
    await pools.saves.end();
    await pools.health.end();
    await pools.cancels.end();
    await database[Symbol.asyncDispose]();
  });

  beforeEach(() => {
    keyNumber += 1;
    key = `save-${keyNumber}`;
  });

  const seed = () => seedKit(database.db);

  function sendJson(
    method: "POST" | "PUT",
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-location-id": NORTHSIDE, ...headers },
      body: JSON.stringify(body),
      signal,
    });
  }

  function sendForm(method: "POST" | "PATCH", path: string, form: FormData, headers: Record<string, string>) {
    return fetch(`${baseUrl}${path}`, { method, headers: { "x-location-id": NORTHSIDE, ...headers }, body: form });
  }

  const customersNamed = async (surname: string) =>
    database.db.select().from(customers).where(eq(customers.surname, surname));

  const recordOf = async (forKey: string) => {
    const [row] = await database.db.select().from(idempotencyRecords).where(eq(idempotencyRecords.key, forKey));
    return row ?? null;
  };

  it("adds a customer once, and answers the same save again with the first answer, marked replayed", async () => {
    const body = { ...CUSTOMER, surname: "Once" };

    const first = await sendJson("POST", "/v1/customers", body, { "idempotency-key": key });
    const again = await sendJson("POST", "/v1/customers", body, { "idempotency-key": key });

    expect(first.status).toBe(201);
    expect(first.headers.get("idempotent-replayed")).toBeNull();
    expect(again.status).toBe(201);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    const created = (await first.json()) as { id: string };
    expect(await again.json()).toEqual(created);
    // The replay still passes through @Created: the same Location.
    expect(again.headers.get("location")).toBe(`/v1/customers/${created.id}`);
    expect(await customersNamed("Once")).toHaveLength(1);
    expect(await recordOf(key)).toMatchObject({ state: "done", resource: `/v1/customers/${created.id}` });
  });

  it("adds a customer twice when sent twice without a key: a save without one works as before", async () => {
    const body = { ...CUSTOMER, surname: "NoKey" };

    expect((await sendJson("POST", "/v1/customers", body)).status).toBe(201);
    expect((await sendJson("POST", "/v1/customers", body)).status).toBe(201);

    expect(await customersNamed("NoKey")).toHaveLength(2);
  });

  it("tells a changed form that the first save went through, and where to read it; nothing is saved again", async () => {
    const first = await sendJson(
      "POST",
      "/v1/customers",
      { ...CUSTOMER, surname: "Changed" },
      { "idempotency-key": key },
    );
    const created = (await first.json()) as { id: string };

    const changed = await sendJson(
      "POST",
      "/v1/customers",
      { ...CUSTOMER, surname: "Changed", phone: "555-0199" },
      { "idempotency-key": key },
    );

    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({
      type: "urn:acme:error:save-went-through",
      resource: `/v1/customers/${created.id}`,
    });
    const saved = await customersNamed("Changed");
    expect(saved.map((customer) => customer.phone)).toEqual(["555-0100"]);
  });

  it("changes a customer once: the same save again is answered 200 with the first answer, never 412", async () => {
    const customer = await seed().addCustomerAsync({ locationId: NORTHSIDE, surname: "Edited" });
    const body = { ...CUSTOMER, surname: "Edited", city: "Leeds" };
    const headers = { "idempotency-key": key, "if-match": `"${customer.version}"` };

    const first = await sendJson("PUT", `/v1/customers/${customer.id}`, body, headers);
    const again = await sendJson("PUT", `/v1/customers/${customer.id}`, body, headers);

    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    // @ETagged still sends the version on a replay.
    expect(again.headers.get("etag")).toBe(`"${customer.version + 1}"`);
    const [saved] = await customersNamed("Edited");
    expect(saved).toMatchObject({ city: "Leeds", version: customer.version + 1 });
    expect(await recordOf(key)).toMatchObject({ resource: `/v1/customers/${customer.id}` });
  });

  it("adds a part once: the same save again never says the part number is in use", async () => {
    const { bin } = await seed().addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "IDEM-BIN" });
    const body = {
      partNumber: "IDEM-1",
      description: "Pads",
      unitPriceCents: 4999,
      binId: bin.id,
      quantityOnHand: 2,
      reorderLevel: 1,
    };

    const first = await sendJson("POST", "/v1/parts", body, { "idempotency-key": key });
    const again = await sendJson("POST", "/v1/parts", body, { "idempotency-key": key });

    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(await database.db.select().from(parts).where(eq(parts.partNumber, "IDEM-1"))).toHaveLength(1);
  });

  it("changes a part with a new photo once: one photo, one upload, no 412", async () => {
    const { part } = await seed().addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "IDEM-2" });
    documentApi.uploadDocumentAsync.mockClear();
    const headers = { "idempotency-key": key, "if-match": `"${part.version}"` };

    const first = await sendForm(
      "PATCH",
      `/v1/parts/${part.id}`,
      partForm({ description: "With a photo", newPhotos: [{ isDefault: true }] }, "photos"),
      headers,
    );
    const again = await sendForm(
      "PATCH",
      `/v1/parts/${part.id}`,
      partForm({ description: "With a photo", newPhotos: [{ isDefault: true }] }, "photos"),
      headers,
    );

    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect(documentApi.uploadDocumentAsync).toHaveBeenCalledTimes(1);
    expect(await database.db.select().from(partPhotos).where(eq(partPhotos.partId, part.id))).toHaveLength(1);
  });

  it("uploads a photo on its own once", async () => {
    const { part } = await seed().addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "IDEM-3" });

    const first = await sendForm("POST", `/v1/parts/${part.id}/photos`, partForm(null, "file"), {
      "idempotency-key": key,
    });
    const again = await sendForm("POST", `/v1/parts/${part.id}/photos`, partForm(null, "file"), {
      "idempotency-key": key,
    });

    expect(first.status).toBe(202);
    expect(again.status).toBe(202);
    expect(await again.json()).toEqual(await first.json());
    expect(await database.db.select().from(partPhotos).where(eq(partPhotos.partId, part.id))).toHaveLength(1);
  });

  it("adds a bin once, and sets a stock level once", async () => {
    const bin = { code: "IDEM-B1", description: "Idempotent aisle" };
    const binFirst = await sendJson("POST", "/v1/bins", bin, { "idempotency-key": key });
    const binAgain = await sendJson("POST", "/v1/bins", bin, { "idempotency-key": key });
    expect(binFirst.status).toBe(201);
    expect(binAgain.status).toBe(201);
    expect(binAgain.headers.get("idempotent-replayed")).toBe("true");
    expect(await database.db.select().from(bins).where(eq(bins.code, "IDEM-B1"))).toHaveLength(1);

    const stocked = await seed().addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "IDEM-4" });
    const part = stocked.part;
    const stockKey = `${key}-stock`;
    const level = { binId: stocked.bin.id, quantityOnHand: 9, reorderLevel: 3 };
    const stockFirst = await sendJson("PUT", `/v1/stock/${part.id}`, level, { "idempotency-key": stockKey });
    const stockAgain = await sendJson("PUT", `/v1/stock/${part.id}`, level, { "idempotency-key": stockKey });
    expect(stockFirst.status).toBe(200);
    expect(stockAgain.headers.get("idempotent-replayed")).toBe("true");
    expect(await stockAgain.json()).toEqual(await stockFirst.json());
  });

  it("refuses a key that is not 1 to 255 printable characters, and saves nothing", async () => {
    const tooLong = await sendJson(
      "POST",
      "/v1/customers",
      { ...CUSTOMER, surname: "BadKey" },
      { "idempotency-key": "k".repeat(256) },
    );
    const spaced = await sendJson(
      "POST",
      "/v1/customers",
      { ...CUSTOMER, surname: "BadKey" },
      { "idempotency-key": "a key" },
    );

    expect(tooLong.status).toBe(422);
    expect(spaced.status).toBe(422);
    expect(await tooLong.json()).toMatchObject({ type: "urn:acme:error:idempotency-key" });
    expect(await customersNamed("BadKey")).toEqual([]);
  });

  it("frees the key of a save refused for something the person can fix: the corrected save uses it", async () => {
    const refused = await sendJson("POST", "/v1/customers", { ...CUSTOMER, surname: "" }, { "idempotency-key": key });
    expect(refused.status).toBe(400);
    expect(await recordOf(key)).toBeNull();

    const fixed = await sendJson(
      "POST",
      "/v1/customers",
      { ...CUSTOMER, surname: "Fixed" },
      { "idempotency-key": key },
    );

    expect(fixed.status).toBe(201);
    expect(await customersNamed("Fixed")).toHaveLength(1);
  });

  it("keeps each user's key their own: another user's save with the same key is their own save", async () => {
    const body = { ...CUSTOMER, surname: "TwoUsers" };

    await sendJson("POST", "/v1/customers", body, { "idempotency-key": key });
    const theirs = await sendJson("POST", "/v1/customers", body, { "idempotency-key": key, "x-test-user": "other" });

    expect(theirs.status).toBe(201);
    expect(theirs.headers.get("idempotent-replayed")).toBeNull();
    expect(await customersNamed("TwoUsers")).toHaveLength(2);
  });

  it("answers busy within the save's wait with nothing claimed, and the same save later saves once", async () => {
    const body = { ...CUSTOMER, surname: "Busy" };
    // The one save connection is taken: the claim cannot have one.
    const held: PoolClient = await pools.saves.connect();
    let busy: Response;
    const started = performance.now();
    try {
      busy = await sendJson("POST", "/v1/customers", body, { "idempotency-key": key });
    } finally {
      held.release();
    }

    expect(busy.status).toBe(503);
    expect(await busy.json()).toMatchObject({ type: "urn:acme:error:busy" });
    // One wait of 500 ms for the claim and the save together, not one each.
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(await recordOf(key)).toBeNull();

    const later = await sendJson("POST", "/v1/customers", body, { "idempotency-key": key });
    expect(later.status).toBe(201);
    expect(await customersNamed("Busy")).toHaveLength(1);
  });

  it("never runs a save again that failed after its commit: it went through", async () => {
    const { part } = await seed().addStockedPartAsync({ locationId: NORTHSIDE, partNumber: "IDEM-5" });
    const headers = { "idempotency-key": key, "if-match": `"${part.version}"` };
    failReadAfterCommit = true;

    const failed = await sendForm(
      "PATCH",
      `/v1/parts/${part.id}`,
      partForm({ description: "Failed after commit" }, null),
      headers,
    );
    const again = await sendForm(
      "PATCH",
      `/v1/parts/${part.id}`,
      partForm({ description: "Failed after commit" }, null),
      headers,
    );

    expect(failed.status).toBe(500);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({
      type: "urn:acme:error:save-went-through",
      resource: `/v1/parts/${part.id}`,
    });
    const [saved] = await database.db.select().from(parts).where(eq(parts.id, part.id));
    expect(saved).toMatchObject({ description: "Failed after commit", version: part.version + 1 });
  });

  it("says a save is still going through while the first runs, with Retry-After", async () => {
    await database.db.insert(idempotencyRecords).values({
      dealerId: NORTHWIND,
      userId: TEST_USER_ID,
      key,
      fingerprint: "the first save's",
      state: "running",
      holder: crypto.randomUUID(),
      // The fixed clock's now is 2026-11-03 09:00: this lease runs a minute past it.
      leaseUntil: Temporal.Instant.from("2026-11-03T09:01:00Z"),
      createdAt: Temporal.Instant.from("2026-11-03T09:00:00Z"),
      expiresAt: Temporal.Instant.from("2026-11-04T09:00:00Z"),
    });

    const second = await sendJson(
      "POST",
      "/v1/customers",
      { ...CUSTOMER, surname: "Waiting" },
      { "idempotency-key": key },
    );

    expect(second.status).toBe(409);
    expect(second.headers.get("retry-after")).toBe("2");
    expect(await second.json()).toMatchObject({ type: "urn:acme:error:save-in-progress" });
    expect(await customersNamed("Waiting")).toEqual([]);
  });

  it("lets only one of two saves commit when the second took over the first's key", async () => {
    const firstHolder = crypto.randomUUID();
    await database.db.insert(idempotencyRecords).values({
      dealerId: NORTHWIND,
      userId: TEST_USER_ID,
      key,
      fingerprint: "the first save's",
      state: "running",
      holder: firstHolder,
      // Its lease ran out: the first save has been running too long.
      leaseUntil: Temporal.Instant.from("2026-11-03T08:59:00Z"),
      createdAt: Temporal.Instant.from("2026-11-03T08:58:00Z"),
      expiresAt: Temporal.Instant.from("2026-11-04T08:58:00Z"),
    });

    const second = await sendJson(
      "POST",
      "/v1/customers",
      { ...CUSTOMER, surname: "TakenOver" },
      { "idempotency-key": key },
    );
    expect(second.status).toBe(201);

    // The first save wakes up and tries to commit: its marker finds the key no longer its own, and it rolls back.
    const firstCommit = runWithDataScope(
      async () => {
        setDataScope({ dealerId: NORTHWIND, locationId: NORTHSIDE, userId: TEST_USER_ID });
        await using work = await new UnitOfWorkFactory(pools.saves).beginAsync();
        await work.db.execute(
          sql`insert into customers (dealer_id, location_id, first_name, surname, status, created_at, created_by, updated_at, updated_by)
              values (${NORTHWIND}, ${NORTHSIDE}, 'Grace', 'TakenOver', 'active', now(), ${TEST_USER_ID}, now(), ${TEST_USER_ID})`,
        );
        await work.commitAsync();
      },
      {
        saves: true,
        signal: new AbortController().signal,
        connectBy: null,
        committed: false,
        idempotency: { dealerId: NORTHWIND, userId: TEST_USER_ID, key, holder: firstHolder },
      },
    );

    await expect(firstCommit).rejects.toMatchObject({ name: "IdempotencyClaimLostError" });
    expect(await customersNamed("TakenOver")).toHaveLength(1);
  });

  it("frees the key when the caller goes away before the save commits", async () => {
    const customer = await seed().addCustomerAsync({ locationId: NORTHSIDE, surname: "Abandoned" });
    const body = { ...CUSTOMER, surname: "Abandoned", city: "York" };
    const headers = { "idempotency-key": key, "if-match": `"${customer.version}"` };
    // Another session holds the customer's row: the save waits on it.
    const locker = await pools.lists.connect();
    await locker.query("BEGIN");
    await locker.query("SELECT 1 FROM customers WHERE id = $1 FOR UPDATE", [customer.id]);
    const caller = new AbortController();
    try {
      const abandoned = sendJson("PUT", `/v1/customers/${customer.id}`, body, headers, caller.signal);
      await waitForAsync(async () => (await recordOf(key))?.state === "running");
      caller.abort();
      await expect(abandoned).rejects.toThrow();
      // Its statement is cancelled, the save fails, and its key is freed.
      await waitForAsync(async () => (await recordOf(key)) === null);
    } finally {
      await locker.query("ROLLBACK");
      locker.release();
    }

    const sentAgain = await sendJson("PUT", `/v1/customers/${customer.id}`, body, headers);
    expect(sentAgain.status).toBe(200);
    expect(sentAgain.headers.get("idempotent-replayed")).toBeNull();
    const [saved] = await database.db
      .select()
      .from(customers)
      .where(and(eq(customers.id, customer.id), eq(customers.city, "York")));
    expect(saved?.version).toBe(customer.version + 1);
  });
});

/** A multipart save: the JSON `payload` when given, and one small JPEG in `photoField` when given. */
function partForm(payload: Record<string, unknown> | null, photoField: string | null): FormData {
  const data = new FormData();
  if (payload) {
    data.append("payload", JSON.stringify(payload));
  }
  if (photoField) {
    data.append(photoField, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1])], { type: "image/jpeg" }), "front.jpg");
  }
  return data;
}

async function waitForAsync(condition: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const until = performance.now() + timeoutMs;
  while (!(await condition())) {
    if (performance.now() > until) {
      throw new Error("Timed out waiting.");
    }
    await new Promise((settle) => setTimeout(settle, 25));
  }
}
