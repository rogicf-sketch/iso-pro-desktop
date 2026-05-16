/**
 * Shallow types até `npm install` trazer `@sentry/react` (evita TS2307 em máquinas sem node_modules actualizado).
 * Após instalar o pacote, estas declarações ficam subordinadas ao pacote real.
 */
declare module '@sentry/react' {
  export function browserTracingIntegration(): unknown;
  export function init(config: Record<string, unknown>): void;
  export function captureException(
    exception: unknown,
    captureContext?: { extra?: Record<string, unknown> },
  ): string;
}
