/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIGNALING_SERVER_HOST: string;
  readonly VITE_BACKEND_BASE_URL: string;
  readonly VITE_HONEYCOMB_INGEST_API_KEY: string;

  // more env variables...
}
