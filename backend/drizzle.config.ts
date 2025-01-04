import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	driver: 'durable-sqlite',
	out: 'migrations/roomManager',
	schema: './src/features/broadcast/roomManager/schema.ts',
	casing: 'snake_case',
});
