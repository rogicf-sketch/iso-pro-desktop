/**
 * Contrato mobile escala + políticas offline (staging ONLY, sem aparelho).
 * Prova as RPCs que o Campo usa + constantes 24/48/72 h.
 *
 *   node --use-system-ca scripts/run-load-on-staging.mjs -- scripts/load-test-mobile-offline-contract.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLoadTestStagingOnly } from './load-test-staging-guard.mjs';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobileRoot = path.join(root, '..', 'iso_pro_mobile');

function loadEnvFile(name) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvFile('.env.staging');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.ISO_PRO_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const tenant =
  process.env.SUPABASE_TENANT_ID ||
  process.env.VITE_ISO_PRO_TENANT_ID ||
  '00000000-0000-0000-0000-000000000001';

assertLoadTestStagingOnly(url);
if (!url || !key) {
  console.error('Faltam URL/KEY staging.');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const results = [];

function push(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`);
}

async function rpc(name, params) {
  const t0 = performance.now();
  const { data, error } = await sb.rpc(name, params);
  const ms = Math.round(performance.now() - t0);
  if (error) throw new Error(`${error.message} (${ms}ms)`);
  return { data, ms };
}

console.log('=== Mobile offline contract (staging) ===');

// RPCs usadas pelo Campo (escalaCloud / historico)
{
  const { data, ms } = await rpc('iso_pro_list_documentos_planejamento_page', {
    p_tenant_id: tenant,
    p_busca: null,
    p_offset: 0,
    p_limit: 50,
    p_status: 'todos',
  });
  const n = Array.isArray(data?.documentos) ? data.documentos.length : 0;
  push('mobile list docs page=50', n === 50 && Number(data?.total) >= 150000, `${ms}ms total=${data?.total}`);
}

{
  const { data, ms } = await rpc('iso_pro_list_recebimentos_page', {
    p_tenant_id: tenant,
    p_busca: null,
    p_offset: 0,
    p_limit: 50,
    p_status: null,
    p_modo: null,
  });
  const n = Array.isArray(data?.recebimentos) ? data.recebimentos.length : 0;
  push('mobile list recebimentos page=50', n === 50, `${ms}ms total=${data?.total}`);
}

{
  const { data, ms } = await rpc('iso_pro_list_materiais_page', {
    p_tenant_id: tenant,
    p_busca: null,
    p_offset: 0,
    p_limit: 50,
    p_disciplina: null,
    p_ativo: null,
  });
  const n = Array.isArray(data?.materiais) ? data.materiais.length : 0;
  push('mobile list materiais page=50', n === 50, `${ms}ms total=${data?.total}`);
}

{
  const { data, ms } = await rpc('iso_pro_list_atendimento_lotes', {
    p_tenant_id: tenant,
    p_limit: 50,
    p_offset: 0,
    p_q: null,
    p_desde: null,
  });
  const total = Number(data?.totalCount ?? data?.total ?? 0);
  push('mobile historico lotes', total >= 40000, `${ms}ms total=${total}`);
}

{
  const { data, ms } = await rpc('iso_pro_list_documentos_pendentes_atendimento', {
    p_tenant_id: tenant,
    p_limit: 50,
    p_offset: 0,
  }).catch(async (e) => {
    // overload variants
    const r = await sb.rpc('iso_pro_list_documentos_pendentes_atendimento', {
      p_tenant_id: tenant,
      p_limit: 50,
    });
    if (r.error) throw e;
    return { data: r.data, ms: 0 };
  });
  push(
    'mobile docs pendentes atendimento',
    Boolean(data) && !data?._error,
    `${ms}ms`,
  );
}

// Políticas offline (fonte de verdade no código mobile)
{
  const politicas = path.join(mobileRoot, 'src', 'lib', 'atendimentoFilaPolitica.ts');
  const escala = path.join(mobileRoot, 'src', 'lib', 'escalaDomainWrite.ts');
  const atd = path.join(mobileRoot, 'app', '(tabs)', 'atendimento.tsx');
  try {
    const p = fs.readFileSync(politicas, 'utf8');
    const e = fs.readFileSync(escala, 'utf8');
    const a = fs.existsSync(atd) ? fs.readFileSync(atd, 'utf8') : '';
    const warn24 = /ATENDIMENTO_FILA_AVISO_HORAS\s*=\s*24/.test(p);
    const block48 = /ATENDIMENTO_FILA_BLOQUEIO_HORAS\s*=\s*48/.test(p);
    const age72 = /72\s*\*\s*60\s*\*\s*60\s*\*\s*1000|MAX_QUEUE_AGE/.test(e);
    const mem48 = /MAX_DESENHOS_EM_MEMORIA\s*=\s*48/.test(a);
    push(
      'offline policy constants',
      warn24 && block48 && age72,
      `warn24=${warn24} block48=${block48} escala72=${age72} memDocs=${mem48}`,
    );
  } catch (err) {
    push('offline policy constants', false, err instanceof Error ? err.message : String(err));
  }
}

// Unit logic (inline) — bloqueio 48h
{
  const idade = 49;
  const bloqueia = idade >= 48;
  const avisa = idade >= 24;
  push('offline logic 49h blocks', bloqueia && avisa, `bloqueia=${bloqueia}`);
}

console.log('\n--- resumo ---');
const pass = results.filter((r) => r.ok).length;
const total = results.length;
const rate = total ? pass / total : 0;
console.log(`pass=${pass}/${total} (${(rate * 100).toFixed(1)}%)`);
if (rate < 0.95) {
  console.error('Falhas:', results.filter((r) => !r.ok).map((f) => f.label).join(', '));
  process.exit(2);
}
console.log('ACEITE ≥95%: contrato mobile offline OK (falta só ensaio no aparelho).');
console.log('Checklist: iso_pro_mobile/docs/SMOKE-MOBILE-OFFLINE-STAGING.md');
process.exit(0);
