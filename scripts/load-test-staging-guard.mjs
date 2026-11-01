/**
 * Bloqueia load-test contra a base LIVE (site publico) e rollback US.
 * So permite staging legado US, ou override explicito.
 *
 * LIVE SP (nunca load-test): ofeogtjydjdjrmrekebh
 * Override emergencia: LOAD_TEST_ALLOW_LIVE=1 (nao usar em dia-a-dia)
 */
import {
  ISO_PRO_LIVE_PROJECT_REF,
  ISO_PRO_ROLLBACK_US_PROJECT_REF,
  ISO_PRO_STAGING_LEGACY_US_REF,
  ISO_PRO_STAGING_LOAD_REF,
  projectRefFromSupabaseUrl,
} from './iso-pro-project-identity.mjs';

const ALLOWED_LOAD_TEST_REFS = new Set([
  ISO_PRO_STAGING_LEGACY_US_REF,
  ISO_PRO_STAGING_LOAD_REF,
]);

export function assertLoadTestStagingOnly(supabaseUrl) {
  const raw = String(supabaseUrl ?? '').trim();
  if (!raw) {
    console.error('Load-test: SUPABASE_URL vazia.');
    process.exit(1);
  }
  const ref = projectRefFromSupabaseUrl(raw);
  if (!ref) {
    console.error(`Load-test: URL invalida: ${raw}`);
    process.exit(1);
  }
  if (ref === ISO_PRO_LIVE_PROJECT_REF) {
    if (process.env.LOAD_TEST_ALLOW_LIVE === '1') {
      console.warn(`Load-test PERIGOSO: ALLOW_LIVE na base publica ${ref}`);
      return;
    }
    console.error(
      `Load-test RECUSADO: ${ref} e a base LIVE do site publico. ` +
        `Nao poluir historico (ATD-LOAD). Usa staging legado ou projecto descartavel.`,
    );
    process.exit(1);
  }
  if (ref === ISO_PRO_ROLLBACK_US_PROJECT_REF) {
    console.error(`Load-test RECUSADO: rollback US (${ref}).`);
    process.exit(1);
  }
  if (process.env.LOAD_TEST_ALLOW_NON_STAGING === '1') {
    console.warn(`Load-test: ALLOW_NON_STAGING activo — alvo ${ref}`);
    return;
  }
  if (!ALLOWED_LOAD_TEST_REFS.has(ref)) {
    console.error(
      `Load-test RECUSADO: ref "${ref}" nao e staging de ensaio. ` +
        `Permitidos: ${[...ALLOWED_LOAD_TEST_REFS].join(', ')}`,
    );
    process.exit(1);
  }
}
