/// <reference types="vite/client" />

/** Injetação em tempo de build — ver `vite.config.ts` (`define`). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Se "true", URL/chave do localStorage (Configuracoes) prevalecem sobre VITE_SUPABASE_* embutido. */
  readonly VITE_SUPABASE_PREFER_SAVED_CONFIG?: string;
  /** DSN Sentry (opcional). Em builds públicos use taxa de amostragem baixa no projecto Sentry. */
  readonly VITE_SENTRY_DSN?: string;
}
