export type WithEnv<T> = {
	env: Env;
} & T;
