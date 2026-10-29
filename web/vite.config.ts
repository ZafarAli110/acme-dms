import {reactRouter} from '@react-router/dev/vite';
import {defineConfig} from 'vite';

// Aspire injects the gateway address as services__gateway__http__0. The gateway routes /api/<service>/... onward.
const gatewayUrl = process.env['services__gateway__http__0'] ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [reactRouter()],
  // Route modules load on demand, so Vite's startup scan never saw packages only a page imports (the data grid): it
  // found them on first visit, re-bundled mid-session, and the page hung on "outdated optimize dep" until a reload.
  // Scanning every app file at startup bundles them all up front.
  optimizeDeps: {
    entries: ['app/**/*.{ts,tsx}'],
  },
  server: {
    port: Number(process.env['PORT'] ?? 5173),
    proxy: {
      '/api': {target: gatewayUrl, changeOrigin: true},
    },
  },
});
