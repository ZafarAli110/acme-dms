import { Global, Module } from "@nestjs/common";
import { HttpClientModule } from "@nestjs/http-client";
import type { ResiliencePreset } from "@nestjs/resilience";
import { DOCUMENT_API_CLIENT } from "#business-logic-abstractions/rest-clients/document-api.client.interface";
import { DOCUMENT_API, DocumentApiClient } from "./document-api/document-api.client";
import { requireSetting, SETTINGS, type Settings } from "#settings/settings";

/**
 * Typed clients for other Acme services, registered against their abstraction tokens. Global and imported once by
 * the composition root (app.module.ts), so business logic depends on the abstractions only.
 *
 * Each service gets a named HTTP client (@nestjs/http-client: native fetch, a timeout per attempt, and retries of the
 * idempotent methods only) and a resilience preset of the same name (@nestjs/resilience: a circuit breaker, so a
 * service that keeps failing is not called again for a while and requests fail fast instead of waiting). Retries
 * happen in one layer only, the HTTP client; the preset has none, or attempts would multiply.
 */
const CLIENTS = [{ provide: DOCUMENT_API_CLIENT, useClass: DocumentApiClient }];

@Global()
@Module({
  imports: [
    HttpClientModule.registerAsync({
      name: DOCUMENT_API,
      inject: [SETTINGS],
      useFactory: (settings: Settings) => ({
        baseUrl: requireSetting(settings.documentApiUrl, "services__document-api__http__0"),
        timeout: "15s",
      }),
    }),
  ],
  providers: CLIENTS,
  exports: CLIENTS.map((client) => client.provide),
})
export class RestClientsModule {}

/** The resilience presets of the services these clients call; app.module.ts registers them with ResilienceModule. */
export const REST_CLIENT_RESILIENCE_PRESETS: Record<string, ResiliencePreset> = {
  [DOCUMENT_API]: { circuitBreaker: { failureRateThreshold: 50, minimumCalls: 5, openDuration: "30s" } },
};
