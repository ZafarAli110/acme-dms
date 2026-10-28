import {defineConfig} from 'drizzle-kit';

// drizzle-kit compares the schema with the migrations it already generated and writes the difference as SQL.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/persistence/schema/index.ts',
  out: './src/persistence/migrations/drizzle',
});
