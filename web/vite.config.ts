import { reactRouter } from "@react-router/dev/vite";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Aspire injects the gateway address as services__gateway-api__http__0. The gateway routes /api/<service>/... onward.
const gatewayUrl = process.env["services__gateway-api__http__0"] ?? "http://localhost:8080";

// Aspire passes the ASP.NET Core development certificate (ACME-130). With it Vite serves HTTPS and HTTP/2, its /api proxy
// included (8.3.5 always builds an HTTP/2 server for https, whatever its option's comment says); without it (Vite run on
// its own) plain HTTP, as before.
const certificatePath = process.env["TLS_CERT_PATH"];
const keyPath = process.env["TLS_KEY_PATH"];
const https =
  certificatePath && keyPath ? { cert: readFileSync(certificatePath), key: readFileSync(keyPath) } : undefined;

export default defineConfig({
  plugins: [reactRouter()],
  // Route modules load on demand, so Vite's startup scan never saw packages only a page imports (the data grid): it
  // found them on first visit, re-bundled mid-session, and the page hung on "outdated optimize dep" until a reload.
  // Scanning every app file at startup bundles them all up front.
  optimizeDeps: {
    entries: ["app/**/*.{ts,tsx}"],
  },
  server: {
    port: Number(process.env["PORT"] ?? 5173),
    https,
    proxy: {
      // `xfwd`: the gateway is told the browser's connection was HTTPS (X-Forwarded-Proto), as a load balancer tells it.
      "/api": { target: gatewayUrl, changeOrigin: true, xfwd: true },
    },
  },
});
