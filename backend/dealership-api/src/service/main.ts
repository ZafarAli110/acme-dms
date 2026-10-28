// Temporal is built into Node 26; on an older Node (or Bun) the polyfill fills in. It leaves a native one alone.
import 'temporal-polyfill/global';
import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {NodeAdapter, type NestNodeApplication} from '@nestjs/platform-node';
import {Logger} from 'nestjs-pino';
import {AppModule} from './app.module';
import {setupSwagger} from './swagger/swagger.setup';

// The HTTP adapter is chosen here and nowhere else.
async function bootstrapAsync(): Promise<void> {
  const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {bufferLogs: true});
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  setupSwagger(app);

  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port);
  app.get(Logger).log(`dealership-api listening on http://localhost:${port} (Swagger at /swagger)`);
}

await bootstrapAsync();
