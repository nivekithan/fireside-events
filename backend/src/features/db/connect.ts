import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export function connectDb(env: Env) {
	const client = postgres(
		env.IS_LOCAL ? env.DB_URL : env.fireside_event.connectionString,
	);

	return drizzle(client);
}
