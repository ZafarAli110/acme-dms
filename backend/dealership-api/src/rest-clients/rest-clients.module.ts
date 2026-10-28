import {Global, Module} from '@nestjs/common';
import {DOCUMENT_API_CLIENT} from '#business-logic-abstractions/rest-clients/document-api.client.interface';
import {DocumentApiClient} from './document-api/document-api.client';

/**
 * Typed clients for other Acme services, registered against their abstraction tokens. Global and imported once by
 * the composition root (app.module.ts), so business logic depends on the abstractions only.
 */
const CLIENTS = [{provide: DOCUMENT_API_CLIENT, useClass: DocumentApiClient}];

@Global()
@Module({
  providers: CLIENTS,
  exports: CLIENTS.map((client) => client.provide),
})
export class RestClientsModule {}
