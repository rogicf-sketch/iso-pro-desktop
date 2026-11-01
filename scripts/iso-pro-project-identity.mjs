/**
 * Identidade operacional ISO PRO (pos cutover sa-east-1, 2026-08-02).
 *
 * LIVE (site publico + gateway + pdf-worker): ofeogtjydjdjrmrekebh
 * ROLLBACK US (nao escrever / nao load-test): huvktaxsosxrfpvdigxq
 * Staging legado US (removido): vghbcwkvmmihakunvwqw
 * Staging load (ensaio / write stress): sacaiokhqhegvtpzlpkf
 */
export const ISO_PRO_LIVE_PROJECT_REF = 'ofeogtjydjdjrmrekebh';
export const ISO_PRO_ROLLBACK_US_PROJECT_REF = 'huvktaxsosxrfpvdigxq';
export const ISO_PRO_STAGING_LEGACY_US_REF = 'vghbcwkvmmihakunvwqw';
export const ISO_PRO_STAGING_LOAD_REF = 'sacaiokhqhegvtpzlpkf';

export function projectRefFromSupabaseUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname.split('.')[0] ?? '';
  } catch {
    return '';
  }
}

export function assertDeployTargetsLiveProd(supabaseUrl) {
  const ref = projectRefFromSupabaseUrl(supabaseUrl);
  if (!ref) {
    console.error('Deploy/build: VITE_SUPABASE_URL vazia.');
    process.exit(1);
  }
  if (ref === ISO_PRO_ROLLBACK_US_PROJECT_REF) {
    console.error(
      `Deploy RECUSADO: URL aponta para rollback US (${ref}). Live e ${ISO_PRO_LIVE_PROJECT_REF} (SP).`,
    );
    process.exit(1);
  }
  if (ref !== ISO_PRO_LIVE_PROJECT_REF && process.env.ISO_PRO_ALLOW_NON_LIVE_DEPLOY !== '1') {
    console.error(
      `Deploy RECUSADO: ref "${ref}" != live ${ISO_PRO_LIVE_PROJECT_REF}. ` +
        `Override so emergencia: ISO_PRO_ALLOW_NON_LIVE_DEPLOY=1`,
    );
    process.exit(1);
  }
}
