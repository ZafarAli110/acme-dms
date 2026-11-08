// Temporal is built into Node 26; on an older Node (or Bun) the polyfill fills in. It leaves a native one alone.
import "temporal-polyfill/global";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NodeAdapter, type NestNodeApplication } from "@nestjs/platform-node";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { setupSwagger } from "./swagger/swagger.setup";
import { settings } from "#settings/settings";

// The HTTP adapter is chosen here and nowhere else.
async function bootstrapAsync(): Promise<void> {
  // return503OnClosing: once shutting down (SIGTERM), new requests get 503 at once, so a load balancer moves them, while
  // those in flight finish (the NestJS production checklist, 3; ACME-121).
  const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
    bufferLogs: true,
    return503OnClosing: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  if (settings.serveSwagger) {
    setupSwagger(app);
  }

  const port = settings.port;
  await app.listen(port);
  app
    .get(Logger)
    .log(
      `dealership-api listening on http://localhost:${port}${settings.serveSwagger ? " (Swagger at /swagger)" : ""}`,
    );
}

await bootstrapAsync();
