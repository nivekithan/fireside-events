import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	driver: 'durable-sqlite',
	out: 'migrations/callsSessionManager',
	schema: './src/features/broadcast/callsSessionManager/schema.ts',
	casing: 'snake_case',
});
