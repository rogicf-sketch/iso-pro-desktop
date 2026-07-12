/**
 * Auditoria total de integridade de atendimento (snapshot na nuvem).
 *
 * Uso:
 *   npm run audit:atendimento:integridade
 *   npx tsx scripts/audit-atendimento-integridade.mjs
 *
 * Requer .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
 * Opcional: ISO_PRO_PILOTO_EMAIL + ISO_PRO_PILOTO_SENHA para JWT (recomendado).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  auditarIntegridadeAtendimentoSnapshot,
  relatorioIntegridadeParaCsv,
} from '../src/modules/atendimento/utils/atendimentoIntegridadeAudit.utils.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tenant = '00000000-0000-0000-0000-000000000001';

function loadEnv() {
  const out = {};
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const senha = String(process.env.ISO_PRO_PILOTO_SENHA ?? '').trim();
const email = String(process.env.ISO_PRO_PILOTO_EMAIL ?? 'admin@isopro.local').trim();

if (!url || !anon) {
  console.error('Falta VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env');
  process.exit(1);
}

const supabase = createClient(url, anon);

if (senha) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) {
    console.error('Login piloto falhou:', error.message);
    process.exit(1);
  }
}

const { data, error } = await supabase.rpc('iso_pro_read_snapshot_slices', {
  p_tenant_id: tenant,
  p_keys: ['documentos', 'atendimentos', 'atendimentoHistorico'],
});

if (error) {
  console.error('RPC iso_pro_read_snapshot_slices:', error.message);
  process.exit(1);
}

const payload = data ?? {};
const updatedAt = payload._updatedAt != null ? String(payload._updatedAt) : null;

const relatorio = auditarIntegridadeAtendimentoSnapshot(
  {
    documentos: payload.documentos,
    atendimentos: payload.atendimentos,
    atendimentoHistorico: payload.atendimentoHistorico,
  },
  { snapshotUpdatedAt: updatedAt, source: 'supabase' },
);

console.log('\n=== AUDITORIA INTEGRIDADE ATENDIMENTO ===');
console.log('Nuvem gravada:', updatedAt ?? '—');
console.log('Desenhos:', relatorio.resumo.documentosAuditados);
console.log('Lotes concluidos:', relatorio.resumo.lotesConcluidos);
console.log('Criticos:', relatorio.resumo.criticos);
console.log('Alertas:', relatorio.resumo.alertas);

if (!relatorio.achados.length) {
  console.log('\nNenhum achado — snapshot consistente nesta verificacao.');
} else {
  console.log('\n--- Achados ---');
  for (const a of relatorio.achados) {
    console.log(`\n[${a.severidade.toUpperCase()}] ${a.codigo}`);
    console.log(`  ${a.detalhe}`);
    if (a.loteNumeros?.length) console.log(`  Lotes: ${a.loteNumeros.join(' | ')}`);
  }
}

const outDir = path.join(root, 'dist', 'auditoria');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const csvPath = path.join(outDir, `atendimento-integridade-${stamp}.csv`);
fs.writeFileSync(csvPath, '\uFEFF' + relatorioIntegridadeParaCsv(relatorio), 'utf8');
console.log(`\nCSV: ${csvPath}`);

process.exit(relatorio.resumo.criticos > 0 ? 2 : 0);
