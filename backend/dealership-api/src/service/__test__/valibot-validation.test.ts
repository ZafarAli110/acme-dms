import { Body, Controller, Module, Post } from "@nestjs/common";
import { APP_FILTER, APP_PIPE, NestFactory } from "@nestjs/core";
import { I18nModule } from "@nestjs/i18n";
import { NodeAdapter, type NestNodeApplication } from "@nestjs/platform-node";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CustomerRequest, CustomerRequestSchema } from "#dto/customers/customer-request.schema";
import { i18nOptions } from "#i18n/messages";
import { fixedClock } from "#test-setup/time/fixed-clock";
import { ProblemDetailsFilter } from "../filters/problem-details.filter";
import { valibotToOpenApi } from "../swagger/valibot-openapi";
import { ValibotValidationPipe } from "../validation/valibot-pipe";

@Controller()
class CustomersController {
  @Post("customers")
  public save(@Body({ schema: CustomerRequestSchema }) request: CustomerRequest): CustomerRequest {
    return request;
  }
}

@Module({
  imports: [I18nModule.forRoot(i18nOptions())],
  controllers: [CustomersController],
  providers: [
    { provide: APP_FILTER, useValue: new ProblemDetailsFilter(fixedClock()) },
    // The service's one global pipe (app.module.ts).
    { provide: APP_PIPE, useValue: new ValibotValidationPipe() },
  ],
})
class CustomersModule {}

const VALID: CustomerRequest = {
  firstName: "Grace",
  surname: "Hopper",
  companyName: null,
  email: null,
  phone: null,
  city: null,
  status: "active",
  lastContactDate: null,
};

interface BodySchema {
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: unknown;
}

/** A customer save validated by its Valibot schema, over the service's real path: HTTP, the locale, the filter. */
describe("Valibot request validation", () => {
  let app: NestNodeApplication;
  let baseUrl = "";

  beforeAll(async () => {
    app = await NestFactory.create<NestNodeApplication>(CustomersModule, new NodeAdapter(), { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const postAsync = async (body: unknown, language = "en") => {
    const response = await fetch(`${baseUrl}/customers`, {
      method: "POST",
      headers: { "content-type": "application/json", "accept-language": language },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as { detail?: string } & CustomerRequest };
  };

  it("accepts a customer whose absent values are null", async () => {
    const result = await postAsync(VALID);

    expect(result.status).toBe(201);
    expect(result.body).toEqual(VALID);
  });

  it("refuses with the service's own messages, in the language asked for", async () => {
    expect((await postAsync({ ...VALID, surname: "" })).body.detail).toBe("Surname is required.");
    expect((await postAsync({ ...VALID, surname: "" }, "fr")).body.detail).toBe("Nom est obligatoire.");
    expect((await postAsync({ ...VALID, companyName: "x".repeat(201) })).body.detail).toBe(
      "Company must be at most 200 characters.",
    );
    expect((await postAsync({ ...VALID, email: "not-an-email" }, "fr")).body.detail).toBe(
      "E-mail doit être une adresse e-mail.",
    );
    expect((await postAsync({ ...VALID, status: "gone" })).body.detail).toBe(
      "Status must be one of: active, prospect, inactive.",
    );
    expect((await postAsync({ ...VALID, lastContactDate: "2026-13-45" })).body.detail).toBe(
      "Last contact must be a date (YYYY-MM-DD).",
    );
  });

  it("refuses a field the request does not have, and a field that was left out", async () => {
    expect((await postAsync({ ...VALID, age: 3 })).body.detail).toBe("age is not a field of this request.");
    const { city: _city, ...withoutCity } = VALID;
    const missing = await postAsync(withoutCity);
    expect(missing.status).toBe(400);
    expect(missing.body.detail).toBe("City is required.");
  });

  it("reports every problem at once", async () => {
    const result = await postAsync({ ...VALID, surname: "", email: "nope" });

    expect(result.body.detail).toBe("Surname is required.; Email must be an email address.");
  });

  it("describes the request in OpenAPI from the same schema", () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build(), {
      standardSchemaConverter: valibotToOpenApi,
    });
    const body = document.paths["/customers"]?.post?.requestBody as
      { content: Record<string, { schema: BodySchema }> } | undefined;
    const schema = body?.content["application/json"]?.schema;

    expect(schema).toBeDefined();
    expect(schema!.properties["firstName"]).toMatchObject({ type: "string", maxLength: 100, minLength: 1 });
    expect(schema!.properties["status"]).toMatchObject({ enum: ["active", "prospect", "inactive"] });
    expect(schema!.required).toContain("surname");
    expect(schema!.additionalProperties).toBe(false);
  });
});
