// Temporal: not built into Node 26.8 (`typeof Temporal` is undefined, checked 10 Nov 2026), so this polyfill is in use,
// and it is slow under Node (about 2 µs a timestamp). It leaves a native Temporal alone, so it goes once Node has one.
import "temporal-polyfill/global";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NodeAdapter, type NestNodeApplication } from "@nestjs/platform-node";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { setupSwagger } from "./swagger/swagger.setup";
import { settings } from "#settings/settings";

/** Longer than the gateway's pool keeps an idle connection (60 s). */
const KEEP_ALIVE_MS = 65_000;

// The HTTP adapter is chosen here and nowhere else.
async function bootstrapAsync(): Promise<void> {
  // return503OnClosing: once shutting down (SIGTERM), new requests get 503 at once, so a load balancer moves them, while
  // those in flight finish (the NestJS production checklist, 3; ACME-121).
  const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
    bufferLogs: true,
    return503OnClosing: true,
  });
  app.useLogger(app.get(Logger));
  // An idle connection is kept longer than the gateway keeps one in its pool (YARP's .NET handler: 60 s), so the gateway
  // never sends a request on a connection Node has just closed (a reset, seen as a rare 502). Node 26 closes after 5 s;
  // Node 27 makes 65 s the default for this reason. The headers' timeout must be longer still.
  const server = app.getHttpServer();
  server.keepAliveTimeout = KEEP_ALIVE_MS;
  server.headersTimeout = KEEP_ALIVE_MS + 1_000;
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
