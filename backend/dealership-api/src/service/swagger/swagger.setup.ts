import type {INestApplication} from '@nestjs/common';
import {DocumentBuilder, SwaggerModule} from '@nestjs/swagger';

/** Swagger UI at /swagger, the OpenAPI document at /swagger/json. Use "Authorize" with a token from identity-api. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Acme DMS - dealership-api')
    .setDescription('Locations, parts catalogue and stock. Send a bearer token and the x-location-id header.')
    .setVersion('v1')
    .addBearerAuth()
    .addGlobalParameters({name: 'x-location-id', in: 'header', required: false, schema: {type: 'string'}})
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document, {jsonDocumentUrl: 'swagger/json'});
}
