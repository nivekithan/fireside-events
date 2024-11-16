import { drizzle } from "drizzle-orm/postgres-js";

export function connectDb(connectionString: string) {
	return drizzle(connectionString);
}
