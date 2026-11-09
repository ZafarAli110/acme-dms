// The web app as production serves it: built once (`react-router build`), then plain files. The production-like run
// (`bun run start:prod`) starts this instead of Vite's dev server, which compiles each module on request and is no
// measure of anything.
//
//   bun scripts/serve-web.ts            builds web/, then serves web/build/client on PORT (4173 by default)
//   bun scripts/serve-web.ts --no-build serves the build already there
//
// What it does, and nothing more: a file of the build is sent as it is (the hashed files under /assets/ cached for a
// year, everything else revalidated); /api/... goes to the gateway, as Vite's proxy does in development, saying the
// browser's connection was HTTPS (X-Forwarded-Proto, as a load balancer does); any other path gets index.html, since the
// app is a single-page app and its router reads the URL. With TLS_CERT_PATH and TLS_KEY_PATH (Aspire passes the .NET
// development certificate, ACME-130) it serves HTTPS, HTTP/2 to a browser that offers it and HTTP/1.1 to anything else.
import { join, normalize, sep } from "node:path";

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";

/** The request handler, apart from the server so a test can call it. `root` is the build's client folder. */
export function createWebHandler(root: string, gatewayUrl: string): (request: Request) => Promise<Response> {
  const resolvedRoot = normalize(root);
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const headers = new Headers(request.headers);
      headers.set("x-forwarded-proto", url.protocol === "https:" ? "https" : "http");
      return fetch(`${gatewayUrl}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? null : await request.arrayBuffer(),
        redirect: "manual",
        // Bun would unzip the gateway's answer and keep its Content-Encoding: the browser would unzip it again.
        decompress: false,
      });
    }

    // A path outside the build (`/../package.json`) is never a file: it gets the app, like any unknown path.
    const path = normalize(join(resolvedRoot, decodeURIComponent(url.pathname)));
    const inside = path.startsWith(resolvedRoot + sep);
    const file = Bun.file(path);
    if (inside && (await file.exists())) {
      const cache = url.pathname.startsWith("/assets/") ? IMMUTABLE : REVALIDATE;
      return new Response(file, { headers: { "cache-control": cache } });
    }
    return new Response(Bun.file(join(resolvedRoot, "index.html")), {
      headers: { "cache-control": REVALIDATE, "content-type": "text/html; charset=utf-8" },
    });
  };
}

if (import.meta.main) {
  const web = join(import.meta.dir, "..", "web");
  if (!process.argv.includes("--no-build")) {
    const build = Bun.spawnSync(["bun", "run", "build"], { cwd: web, stdout: "inherit", stderr: "inherit" });
    if (build.exitCode !== 0) {
      console.error("web: the build failed, not serving. Fix the error above and restart the resource.");
      process.exit(1);
    }
  }
  // Aspire passes the gateway's address, as it does to Vite in development.
  const gatewayUrl = process.env["services__gateway-api__http__0"] ?? "http://localhost:8080";
  const certificatePath = process.env["TLS_CERT_PATH"];
  const keyPath = process.env["TLS_KEY_PATH"];
  // HTTP/2 to a browser that offers it over TLS (ALPN), HTTP/1.1 to anything else. Experimental in Bun 1.4.4; the
  // end-to-end suite runs over it.
  const secure =
    certificatePath && keyPath ? { tls: { cert: Bun.file(certificatePath), key: Bun.file(keyPath) }, http2: true } : {};
  const server = Bun.serve({
    port: Number(process.env["PORT"] ?? 4173),
    ...secure,
    fetch: createWebHandler(join(web, "build", "client"), gatewayUrl),
  });
  console.log(`web (production build) on ${server.url}, /api → ${gatewayUrl}`);
}
