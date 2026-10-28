import {reactRouter} from '@react-router/dev/vite';
import {defineConfig} from 'vite';

// Aspire injects the gateway address as services__gateway__http__0. The gateway routes /api/<service>/... onward.
const gatewayUrl = process.env['services__gateway__http__0'] ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [reactRouter()],
  server: {
    port: Number(process.env['PORT'] ?? 5173),
    proxy: {
      '/api': {target: gatewayUrl, changeOrigin: true},
    },
  },
});
