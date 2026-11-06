import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NodeAdapter, type NestNodeApplication } from "@nestjs/platform-node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET_HEALTH_QUERY_HANDLER } from "#business-logic-abstractions/handlers/system/get-health/get-health.query-handler.interface";
import { GET_USER_CONTEXT_QUERY_HANDLER } from "#business-logic-abstractions/handlers/system/get-user-context/get-user-context.query-handler.interface";
import { SystemController } from "../controllers/system/system.controller";

@Module({
  controllers: [SystemController],
  providers: [
    { provide: GET_HEALTH_QUERY_HANDLER, useValue: {} },
    { provide: GET_USER_CONTEXT_QUERY_HANDLER, useValue: {} },
  ],
})
class SystemModule {}

/** Sign-out over Node's HTTP adapter: what the browser is told to forget. */
describe("sign-out", () => {
  let app: NestNodeApplication;
  let baseUrl = "";

  beforeAll(async () => {
    app = await NestFactory.create<NestNodeApplication>(SystemModule, new NodeAdapter(), { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it("answers 204 and asks the browser to clear the answers it kept of this site", async () => {
    const response = await fetch(`${baseUrl}/v1/system/sign-out`, { method: "POST" });

    expect(response.status).toBe(204);
    expect(response.headers.get("clear-site-data")).toBe('"cache"');
    expect(await response.text()).toBe("");
  });
});
