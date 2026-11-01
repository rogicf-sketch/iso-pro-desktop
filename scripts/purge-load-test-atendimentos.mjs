#!/usr/bin/env node
/**
 * Purge de lotes sinteticos de load-test (ATD-LOAD / load-at- / LOAD-*) na base live.
 *
 * Uso:
 *   node scripts/purge-load-test-atendimentos.mjs --dry-run
 *   node scripts/purge-load-test-atendimentos.mjs --execute
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ISO_PRO_LIVE_PROJECT_REF,
  projectRefFromSupabaseUrl,
} from './iso-pro-project-identity.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const execute = process.argv.includes('--execute');
const dryRun = !execute;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
  }
}

loadEnvFile(path.join(root, '.env'));

if (process.env.ISO_PRO_JWT_SKIP_TLS_VERIFY === '1' || process.env.NODE_TLS_REJECT_UNAUTHORIZED === undefined) {
  // Ambientes Windows locais com cadeia TLS corporativa / antivirus.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.ISO_PRO_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  '';
const tenantId =
  process.env.SUPABASE_TENANT_ID ||
  process.env.VITE_ISO_PRO_TENANT_ID ||
  '00000000-0000-0000-0000-000000000001';

if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL e SERVICE_ROLE no .env');
  process.exit(1);
}

const ref = projectRefFromSupabaseUrl(url);
if (ref !== ISO_PRO_LIVE_PROJECT_REF && process.env.ISO_PRO_ALLOW_PURGE_NON_LIVE !== '1') {
  console.error(`Purge RECUSADO: URL ref=${ref} (esperado live ${ISO_PRO_LIVE_PROJECT_REF})`);
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function listSyntheticLotes() {
  const { data, error } = await supabase
    .from('iso_pro_atendimento_lotes')
    .select('id,numero,status,created_at')
    .eq('tenant_id', tenantId)
    .or('numero.like.ATD-LOAD-%,id.like.load-at-%')
    .limit(5000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function main() {
  console.log(dryRun ? 'DRY-RUN purge load-test' : 'EXECUTE purge load-test');
  console.log('URL', url, 'tenant', tenantId);

  const lotes = await listSyntheticLotes();
  console.log(`Lotes sinteticos encontrados: ${lotes.length}`);
  for (const row of lotes.slice(0, 15)) {
    console.log(' -', row.numero, row.id);
  }
  if (lotes.length > 15) console.log(` ... +${lotes.length - 15} mais`);

  if (dryRun) {
    console.log('Sem alteracoes. Corre com --execute para apagar.');
    return;
  }

  const ids = lotes.map((r) => r.id).filter(Boolean);
  if (!ids.length) {
    console.log('Nada a apagar.');
    return;
  }

  // Itens primeiro (FK)
  const { error: errItens } = await supabase
    .from('iso_pro_atendimento_lote_itens')
    .delete()
    .eq('tenant_id', tenantId)
    .in('lote_id', ids);
  if (errItens) throw new Error(`itens: ${errItens.message}`);

  const { error: errLotes } = await supabase
    .from('iso_pro_atendimento_lotes')
    .delete()
    .eq('tenant_id', tenantId)
    .in('id', ids);
  if (errLotes) throw new Error(`lotes: ${errLotes.message}`);

  // Snapshot: remover entradas ATD-LOAD do array atendimentos (best-effort)
  const { data: snap, error: errSnap } = await supabase
    .from('iso_pro_snapshot')
    .select('payload, updated_at')
    .eq('id', 'default')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (errSnap) throw new Error(`snapshot read: ${errSnap.message}`);
  if (snap?.payload && typeof snap.payload === 'object') {
    const payload = structuredClone(snap.payload);
    const beforeA = Array.isArray(payload.atendimentos) ? payload.atendimentos.length : 0;
    const beforeH = Array.isArray(payload.atendimentoHistorico) ? payload.atendimentoHistorico.length : 0;
    if (Array.isArray(payload.atendimentos)) {
      payload.atendimentos = payload.atendimentos.filter((a) => {
        const n = String(a?.numero ?? '');
        const id = String(a?.id ?? '');
        return !(n.startsWith('ATD-LOAD-') || id.startsWith('load-at-'));
      });
    }
    if (Array.isArray(payload.atendimentoHistorico)) {
      payload.atendimentoHistorico = payload.atendimentoHistorico.filter((h) => {
        const lote = String(h?.loteNumero ?? h?.numero ?? '');
        const id = String(h?.id ?? '');
        const doc = String(h?.documento ?? '');
        return !(
          lote.startsWith('LOAD-') ||
          lote.startsWith('ATD-LOAD-') ||
          id.startsWith('load-') ||
          doc === 'LOAD-DOC' ||
          String(h?.codigo ?? '') === 'LOAD-TEST'
        );
      });
    }
    const afterA = Array.isArray(payload.atendimentos) ? payload.atendimentos.length : 0;
    const afterH = Array.isArray(payload.atendimentoHistorico) ? payload.atendimentoHistorico.length : 0;
    console.log(`Snapshot atendimentos ${beforeA}→${afterA}; historico ${beforeH}→${afterH}`);
    const { error: errUp } = await supabase
      .from('iso_pro_snapshot')
      .update({ payload, updated_at: new Date().toISOString() })
      .eq('id', 'default')
      .eq('tenant_id', tenantId)
      .eq('updated_at', snap.updated_at);
    if (errUp) throw new Error(`snapshot update: ${errUp.message}`);
  }

  // Comandos loadtest (best-effort)
  const { error: errCmd } = await supabase
    .from('iso_pro_atendimento_comandos')
    .delete()
    .eq('tenant_id', tenantId)
    .like('idempotency_key', 'loadtest-%');
  if (errCmd) {
    console.warn('comandos loadtest (aviso):', errCmd.message);
  }

  const left = await listSyntheticLotes();
  console.log(`Restantes sinteticos: ${left.length}`);
  console.log('Purge concluido.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
