/**
 * Feed generico electron-updater (pasta com latest.yml + artefactos).
 * Runtime: ISO_PRO_UPDATE_FEED_URL sobrescreve o default (staging/canary).
 * Publicar builds: upload release/ para este path no host web (nginx).
 */
export const DEFAULT_ISO_PRO_UPDATE_FEED_URL =
  'https://isoprogestaodemateriais.com.br/updates/iso-pro-desktop/';

export function resolveUpdateFeedUrl(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = String(env.ISO_PRO_UPDATE_FEED_URL ?? '').trim();
  if (fromEnv) return fromEnv.replace(/\/?$/, '/');
  return DEFAULT_ISO_PRO_UPDATE_FEED_URL;
}
