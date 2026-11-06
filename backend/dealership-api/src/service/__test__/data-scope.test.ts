import {
  type CanActivate,
  Controller,
  Get,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  UseGuards,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NodeAdapter, type NestNodeApplication } from "@nestjs/platform-node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { customers } from "#persistence/schema/customers";
import { setDataScope } from "#request-scope/data-scope";
import { NORTHSIDE, NORTHWIND, RIVERSIDE, TEST_USER_ID } from "#test-setup/postgres/seed-kit";
import { useTestDatabase } from "#test-setup/postgres/use-test-database";
import { DataScopeMiddleware } from "../middleware/data-scope.middleware";

/** Stands in for AuthorizationGuard: a signed-in user at Northside. */
class NorthsideUserGuard implements CanActivate {
  public canActivate(): boolean {
    setDataScope({ dealerId: NORTHWIND, locationId: NORTHSIDE, userId: TEST_USER_ID });
    return true;
  }
}

/** The data scope travels from the middleware through the guard to the unit of work a handler opens. */
describe("a request's data scope", () => {
  const database = useTestDatabase();
  let app: NestNodeApplication;
  let baseUrl = "";

  beforeAll(async () => {
    await database.seed.addCustomerAsync({ locationId: NORTHSIDE, surname: "Mine" });
    await database.seed.addCustomerAsync({ locationId: RIVERSIDE, surname: "NotMine" });

    @Controller("customers")
    class CustomersController {
      @Get()
      @UseGuards(NorthsideUserGuard)
      public async listAsync(): Promise<string[]> {
        // No filter at all: only the database's policies decide what comes back.
        await using work = await database.unitOfWorkFactory.beginAsync({ readOnly: true });
        return (await work.db.select({ surname: customers.surname }).from(customers)).map((row) => row.surname);
      }
    }

    @Module({ controllers: [CustomersController] })
    class ScopeModule implements NestModule {
      public configure(consumer: MiddlewareConsumer): void {
        consumer.apply(DataScopeMiddleware).forRoutes("*");
      }
    }

    app = await NestFactory.create<NestNodeApplication>(ScopeModule, new NodeAdapter(), { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it("filters a request's queries by the dealer and location its guard recorded", async () => {
    const response = await fetch(`${baseUrl}/customers`);

    expect(await response.json()).toEqual(["Mine"]);
  });
});
