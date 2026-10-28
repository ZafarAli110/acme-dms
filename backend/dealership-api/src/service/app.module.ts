import {type MiddlewareConsumer, Module, type NestModule, ValidationPipe} from '@nestjs/common';
import {APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE} from '@nestjs/core';
import {LoggerModule} from 'nestjs-pino';
import {BusinessLogicModule} from '#business-logic/business-logic.module';
import {RestClientsModule} from '#rest-clients/rest-clients.module';
import {AccessTokenVerifier} from './authentication/access-token.verifier';
import {AuthenticationGuard} from './guards/authentication.guard';
import {AuthorizationGuard} from './guards/authorization.guard';
import {DocumentEventsConsumer} from './consumers/document-events.consumer';
import {BinCommandController} from './controllers/bins/bin-command.controller';
import {BinController} from './controllers/bins/bin.controller';
import {CustomerCommandController} from './controllers/customers/customer-command.controller';
import {CustomerController} from './controllers/customers/customer.controller';
import {PartCommandController} from './controllers/parts/part-command.controller';
import {PartController} from './controllers/parts/part.controller';
import {StockCommandController} from './controllers/stock/stock-command.controller';
import {StockController} from './controllers/stock/stock.controller';
import {SystemController} from './controllers/system/system.controller';
import {CorrelationIdMiddleware} from './middleware/correlation-id.middleware';
import {loggerOptions} from './logging/logger-options';
import {TraceRouteInterceptor} from './interceptors/trace-route.interceptor';
import {ProblemDetailsFilter} from './filters/problem-details.filter';

@Module({
  // The composition root: the only place that wires implementations (REST clients) to abstractions.
  imports: [LoggerModule.forRoot(loggerOptions), RestClientsModule, BusinessLogicModule],
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
    DocumentEventsConsumer,
    // Guards run in this order: who is calling, then what they may do.
    {provide: APP_GUARD, useClass: AuthenticationGuard},
    {provide: APP_GUARD, useClass: AuthorizationGuard},
    {provide: APP_INTERCEPTOR, useClass: TraceRouteInterceptor},
    {provide: APP_FILTER, useClass: ProblemDetailsFilter},
    // Request DTOs are validated (class-validator); unknown properties are rejected.
    {provide: APP_PIPE, useValue: new ValidationPipe({whitelist: true, forbidNonWhitelisted: true, transform: true})},
  ],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
