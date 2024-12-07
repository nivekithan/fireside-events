import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	driver: 'durable-sqlite',
	out: 'migrations/signalingDb',
	schema: './src/features/broadcast/signalingDb/schema.ts',
});
