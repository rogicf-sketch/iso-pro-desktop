/**
 * Exporta linhas de `iso_pro_snapshot` para JSON (backup manual do payload I.S.O PRO).
 *
 * Uso (PowerShell), na pasta do projeto iso-pro-desktop:
 *   $env:SUPABASE_URL="https://SEU_REF.supabase.co"
 *   $env:SUPABASE_SECRET_KEY="..."          # preferido: chave secret (novo formato ou service_role JWT)
 *   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..." # alternativa: JWT service_role (painel API)
 *   $env:SUPABASE_PUBLISHABLE_KEY="sb_publishable_..." # ou anon JWT: so se RLS permitir SELECT
 *   npm run snapshot:export
 *
 * Ordem de preferencia da chave: SUPABASE_SECRET_KEY > SUPABASE_SERVICE_ROLE_KEY > SUPABASE_PUBLISHABLE_KEY > SUPABASE_ANON_KEY
 *
 * Opcional: pasta de saida
 *   $env:SNAPSHOT_EXPORT_DIR="C:\\Backups\\ISO-PRO"
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/** Ignora valores de exemplo (tutorial) ou `...` que quebram o createClient. */
function chaveSupabasePlausivel(valor) {
  const t = String(valor ?? '').trim();
  if (t.length < 32) return false;
  if (/^\.{1,20}$/.test(t)) return false;
  if (/COLA_AQUI|a_tua_chave|teu_ref|apos_regenerar/i.test(t)) return false;
  return (
    t.startsWith('eyJ') ||
    t.startsWith('sb_publishable_') ||
    t.startsWith('sb_secret_') ||
    t.startsWith('sbp_')
  );
}

function escolherChaveApi() {
  const candidatos = [
    { nome: 'SUPABASE_SECRET_KEY', valor: process.env.SUPABASE_SECRET_KEY },
    { nome: 'SUPABASE_SERVICE_ROLE_KEY', valor: process.env.SUPABASE_SERVICE_ROLE_KEY },
    { nome: 'SUPABASE_PUBLISHABLE_KEY', valor: process.env.SUPABASE_PUBLISHABLE_KEY },
    { nome: 'SUPABASE_ANON_KEY', valor: process.env.SUPABASE_ANON_KEY },
  ];
  for (const c of candidatos) {
    if (chaveSupabasePlausivel(c.valor)) {
      return { chave: String(c.valor).trim(), origem: c.nome };
    }
  }
  return { chave: '', origem: '' };
}

const url = String(process.env.SUPABASE_URL ?? '').trim();
const { chave: key, origem: chaveOrigem } = escolherChaveApi();

const outDir = String(process.env.SNAPSHOT_EXPORT_DIR ?? path.join(projectRoot, 'backups')).trim();

if (!url || !/^https:\/\//i.test(url)) {
  console.error('[export-iso-pro-snapshot] SUPABASE_URL invalida ou em falta (deve comecar por https://).');
  process.exit(1);
}

if (!key) {
  console.error(
    '[export-iso-pro-snapshot] Nenhuma chave valida encontrada. Copie do Supabase (Settings > API) para UMA destas variaveis — valor completo, sem reticencias de exemplo:',
  );
  console.error(
    '  SUPABASE_SECRET_KEY (recomendado) | SUPABASE_SERVICE_ROLE_KEY (JWT eyJ...) | SUPABASE_PUBLISHABLE_KEY (sb_publishable_...) | SUPABASE_ANON_KEY (eyJ...)',
  );
  console.error(
    'Se definiu SUPABASE_SECRET_KEY="..." ou texto do tutorial na PUBLISHABLE_KEY, apague: Remove-Item Env:SUPABASE_SECRET_KEY -ErrorAction SilentlyContinue',
  );
  process.exit(1);
}

console.log(`[export-iso-pro-snapshot] A usar chave de: ${chaveOrigem}`);

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Tenant UUID (defina para exportar o snapshot dessa organização). */
const tenantId = String(process.env.SUPABASE_TENANT_ID ?? '00000000-0000-0000-0000-000000000001').trim();

const { data, error } = await supabase
  .from('iso_pro_snapshot')
  .select('id, tenant_id, updated_at, payload')
  .eq('id', 'default')
  .eq('tenant_id', tenantId);

if (error) {
  console.error('[export-iso-pro-snapshot] Erro Supabase:', error.message);
  process.exit(1);
}

if (!data?.length) {
  console.error('[export-iso-pro-snapshot] Nenhuma linha para id=default e tenant_id=', tenantId);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const filePath = path.join(outDir, `iso-pro-snapshot-export-${stamp}.json`);

const payload = {
  exportadoEm: new Date().toISOString(),
  origem: 'scripts/export-iso-pro-snapshot.mjs',
  linhas: data,
};

fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');

console.log(`[export-iso-pro-snapshot] OK — ${data.length} linha(s) gravada(s) em:\n${filePath}`);
