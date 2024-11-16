import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./src/features/db/schema.ts",
	dbCredentials: {
		url: process.env.DB_URL!,
		ssl: { rejectUnauthorized: false },
	},
});
