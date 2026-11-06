import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { I18nModule, I18nValidationPipe } from "@nestjs/i18n";
import { LoggerModule } from "nestjs-pino";
import { i18nOptions } from "#i18n/messages";
import { BusinessLogicModule } from "#business-logic/business-logic.module";
import { REST_CLIENT_RESILIENCE_PRESETS, RestClientsModule } from "#rest-clients/rest-clients.module";
import { SETTINGS, type Settings } from "#settings/settings";
import { SettingsModule } from "#settings/settings.module";
import { ResilienceModule } from "@nestjs/resilience";
import { AccessTokenVerifier } from "./authentication/access-token.verifier";
import { SessionStatusChecker } from "./authentication/session-status.checker";
import { AuthenticationGuard } from "./guards/authentication.guard";
import { AuthorizationGuard } from "./guards/authorization.guard";
import { DocumentEventsConsumer } from "./consumers/document-events.consumer";
import { BinCommandController } from "./controllers/bins/bin-command.controller";
import { BinController } from "./controllers/bins/bin.controller";
import { CustomerCommandController } from "./controllers/customers/customer-command.controller";
import { CustomerController } from "./controllers/customers/customer.controller";
import { PartCommandController } from "./controllers/parts/part-command.controller";
import { PartController } from "./controllers/parts/part.controller";
import { StockCommandController } from "./controllers/stock/stock-command.controller";
import { StockController } from "./controllers/stock/stock.controller";
import { SystemController } from "./controllers/system/system.controller";
import { CacheControlMiddleware } from "./middleware/cache-control.middleware";
import { CorrelationIdMiddleware } from "./middleware/correlation-id.middleware";
import { RequestCancellationMiddleware } from "./middleware/request-cancellation.middleware";
import { loggerOptions } from "./logging/logger-options";
import { TraceRouteInterceptor } from "./interceptors/trace-route.interceptor";
import { ProblemDetailsFilter } from "./filters/problem-details.filter";

@Module({
  // The composition root: the only place that wires implementations (REST clients) to abstractions.
  imports: [
    I18nModule.forRoot(i18nOptions()),
    SettingsModule,
    LoggerModule.forRoot(loggerOptions),
    // Every controller's @Timeout() takes defaults.timeout (REQUEST_TIMEOUT); the presets are the REST clients'.
    ResilienceModule.forRootAsync({
      inject: [SETTINGS],
      useFactory: (settings: Settings) => ({
        defaults: { timeout: settings.requestTimeoutMs },
        presets: REST_CLIENT_RESILIENCE_PRESETS,
      }),
    }),
    RestClientsModule,
    BusinessLogicModule,
  ],
  // Every controller is registered here: one per resource, reads and writes (XxxCommandController) apart.
  controllers: [
    SystemController,
    PartController,
    PartCommandController,
    StockController,
    StockCommandController,
    BinController,
    BinCommandController,
    CustomerController,
    CustomerCommandController,
  ],
  providers: [
    AccessTokenVerifier,
    SessionStatusChecker,
    DocumentEventsConsumer,
    // Guards run in this order: who is calling, then what they may do.
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
    { provide: APP_INTERCEPTOR, useClass: TraceRouteInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    // Request DTOs are validated (class-validator); unknown properties are rejected.
    {
      provide: APP_PIPE,
      // ValidationPipe whose messages come from the catalogs (`validation.*`), in the request's language.
      useValue: new I18nValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
  ],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    // Cancellation last: everything after it, the guards, the controller and its calls, runs inside the request's signal.
    consumer.apply(CorrelationIdMiddleware, CacheControlMiddleware, RequestCancellationMiddleware).forRoutes("*");
  }
}
