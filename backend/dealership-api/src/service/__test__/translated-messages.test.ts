import { Body, Controller, Get, Module, NotFoundException, Post } from "@nestjs/common";
import { APP_FILTER, NestFactory } from "@nestjs/core";
import { I18nModule, I18nValidationPipe } from "@nestjs/i18n";
import { NodeAdapter, type NestNodeApplication } from "@nestjs/platform-node";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { i18nOptions, localized } from "#i18n/messages";
import { fixedClock } from "#test-setup/time/fixed-clock";
import { ProblemDetailsFilter } from "../filters/problem-details.filter";

class NameRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5)
  public surname!: string;
}

@Controller()
class MessagesController {
  @Get("customer")
  public findCustomer(): never {
    throw new NotFoundException(localized("errors.customerNotFound", { customerId: "c-1" }));
  }

  @Post("name")
  public saveName(
    @Body(new I18nValidationPipe({ whitelist: true, forbidNonWhitelisted: true, expectedType: NameRequestDto }))
    body: NameRequestDto,
  ): NameRequestDto {
    return body;
  }
}

@Module({
  imports: [I18nModule.forRoot(i18nOptions())],
  controllers: [MessagesController],
  providers: [{ provide: APP_FILTER, useValue: new ProblemDetailsFilter(fixedClock()) }],
})
class MessagesModule {}

/** The service's real path: Node's HTTP adapter, the locale from Accept-Language, the problem-details filter. */
describe("messages in the user's language", () => {
  let app: NestNodeApplication;
  let baseUrl = "";

  beforeAll(async () => {
    app = await NestFactory.create<NestNodeApplication>(MessagesModule, new NodeAdapter(), { logger: false });
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const detailAsync = async (path: string, language: string | null, body?: unknown): Promise<string> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (language !== null) {
      headers["accept-language"] = language;
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    return ((await response.json()) as { detail: string }).detail;
  };

  it("answers a handler's error in the language the request asks for, English otherwise", async () => {
    expect(await detailAsync("/customer", "fr")).toBe("Le client c-1 est introuvable sur ce site.");
    expect(await detailAsync("/customer", "fr-FR,fr;q=0.9")).toBe("Le client c-1 est introuvable sur ce site.");
    expect(await detailAsync("/customer", "en")).toBe("Customer c-1 was not found at this location.");
    expect(await detailAsync("/customer", "de")).toBe("Customer c-1 was not found at this location.");
    expect(await detailAsync("/customer", null)).toBe("Customer c-1 was not found at this location.");
  });

  it("names a field in a validation message as the screen does, in the request's language", async () => {
    expect(await detailAsync("/name", "fr", { surname: "" })).toBe("Nom est obligatoire.");
    expect(await detailAsync("/name", "en", { surname: "Okafor-Smith" })).toBe("Surname must be at most 5 characters.");
    expect(await detailAsync("/name", "fr", { surname: "Ash", age: 3 })).toBe(
      "age n'est pas un champ de cette requête.",
    );
  });
});
