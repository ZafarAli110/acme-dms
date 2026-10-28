import type {Config} from '@react-router/dev/config';

// A single-page app (no server rendering), like the IDS cloud DMS web client. Route modules use clientLoader,
// clientAction and clientMiddleware.
export default {
  ssr: false,
} satisfies Config;
