/// <reference types="vite/client" />
/// <reference types="svelte" />

declare const __BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_OWNER_LOGIN_ID: string;
}
