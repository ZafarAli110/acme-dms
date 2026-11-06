import { Body, Controller, Get, Module, Put } from "@nestjs/common";
import { APP_FILTER, NestFactory } from "@nestjs/core";
import { I18nModule } from "@nestjs/i18n";
import { NodeAdapter, type NestNodeApplication } from "@nestjs/platform-node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { i18nOptions } from "#i18n/messages";
import { fixedClock } from "#test-setup/time/fixed-clock";
import { IfMatchVersion } from "../concurrency/record-version";
import { ProblemDetailsFilter } from "../filters/problem-details.filter";
import { ETagged } from "../interceptors/etag.interceptor";

@Controller("record")
class RecordController {
  @Get()
  @ETagged()
  public read(): { id: string; version: number } {
    return { id: "r-1", version: 3 };
  }

  @Put()
  @ETagged()
  public save(
    @Body() _body: unknown,
    @IfMatchVersion() expectedVersion: number | null,
  ): { saw: number | null; version: number } {
    return { saw: expectedVersion, version: 4 };
  }
}

@Module({
  imports: [I18nModule.forRoot(i18nOptions())],
  controllers: [RecordController],
  providers: [{ provide: APP_FILTER, useValue: new ProblemDetailsFilter(fixedClock()) }],
})
class RecordModule {}

/** ETag, If-None-Match and If-Match on Node's HTTP adapter, as the service runs them. */
describe("a versioned record over HTTP", () => {
  let app: NestNodeApplication;
  let baseUrl = "";

  beforeAll(async () => {
    app = await NestFactory.create<NestNodeApplication>(RecordModule, new NodeAdapter(), { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const send = (method: "GET" | "PUT", headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}/record`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      ...(method === "PUT" ? { body: "{}" } : {}),
    });

  it("sends the version as a strong ETag, and 304 with no body when the client already has it", async () => {
    const fresh = await send("GET");
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get("etag")).toBe('"3"');

    const same = await send("GET", { "if-none-match": '"3"' });
    expect(same.status).toBe(304);
    expect(same.headers.get("etag")).toBe('"3"');
    expect(await same.text()).toBe("");

    expect((await send("GET", { "if-none-match": '"2"' })).status).toBe(200);
  });

  it("requires If-Match on a save: 428 without it, 412 when it is not one version, the version when it is", async () => {
    const missing = await send("PUT");
    expect(missing.status).toBe(428);
    expect(((await missing.json()) as { type: string }).type).toBe("urn:acme:error:precondition-required");

    expect((await send("PUT", { "if-match": "three" })).status).toBe(412);

    const saved = await send("PUT", { "if-match": '"3"' });
    expect(saved.status).toBe(200);
    expect(saved.headers.get("etag")).toBe('"4"');
    expect(await saved.json()).toEqual({ saw: 3, version: 4 });

    expect(await (await send("PUT", { "if-match": "*" })).json()).toEqual({ saw: null, version: 4 });
  });
});
