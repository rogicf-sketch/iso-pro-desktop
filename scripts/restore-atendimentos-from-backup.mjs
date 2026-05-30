/**
 * Restaura atendimentos/historico na nuvem a partir de um export local (backup).
 * Uso: node --use-system-ca scripts/restore-atendimentos-from-backup.mjs backups/iso-pro-snapshot-export-2026-05-28T23-34-25.json
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnvFile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
loadEnvFile(path.join(projectRoot, '.env'));

const backupPath = process.argv[2];
if (!backupPath || !fs.existsSync(backupPath)) {
  console.error('Uso: node scripts/restore-atendimentos-from-backup.mjs <caminho-backup.json>');
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const tenantId = String(process.env.SUPABASE_TENANT_ID ?? '00000000-0000-0000-0000-000000000001').trim();

if (!url || !key) {
  console.error('Defina SUPABASE_URL e chave API no .env');
  process.exit(1);
}

function rowKey(row) {
  return String(row.id ?? `${row.numero ?? row.loteNumero}-${row.documentoId ?? row.documento}`);
}

function historicoKey(h) {
  return String(h.id ?? `${h.loteNumero}-${h.codigo}-${h.quantidade}-${h.data}`);
}

const backupRaw = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
const backupRow = backupRaw.linhas?.[0];
const backupPayload = backupRow?.payload ?? {};

const supabase = createClient(url, key, { auth: { persistSession: false } });
const { data: currentRow, error: readErr } = await supabase
  .from('iso_pro_snapshot')
  .select('payload, updated_at')
  .eq('id', 'default')
  .eq('tenant_id', tenantId)
  .maybeSingle();

if (readErr) {
  console.error('Erro ao ler snapshot:', readErr.message);
  process.exit(1);
}

const currentPayload = currentRow?.payload ?? {};

const atendMap = new Map();
for (const a of [...(backupPayload.atendimentos ?? []), ...(currentPayload.atendimentos ?? [])]) {
  atendMap.set(rowKey(a), a);
}

const histMap = new Map();
for (const h of [...(backupPayload.atendimentoHistorico ?? []), ...(currentPayload.atendimentoHistorico ?? [])]) {
  histMap.set(historicoKey(h), h);
}

const nextPayload = {
  ...currentPayload,
  atendimentos: Array.from(atendMap.values()),
  atendimentoHistorico: Array.from(histMap.values()),
  dataAtualizacao: new Date().toISOString(),
};

console.log('[restore-atendimentos] Backup:', path.basename(backupPath));
console.log('[restore-atendimentos] Antes  — atendimentos:', (currentPayload.atendimentos ?? []).length, 'historico:', (currentPayload.atendimentoHistorico ?? []).length);
console.log('[restore-atendimentos] Backup — atendimentos:', (backupPayload.atendimentos ?? []).length, 'historico:', (backupPayload.atendimentoHistorico ?? []).length);
console.log('[restore-atendimentos] Depois — atendimentos:', nextPayload.atendimentos.length, 'historico:', nextPayload.atendimentoHistorico.length);

const { error: writeErr } = await supabase
  .from('iso_pro_snapshot')
  .update({ payload: nextPayload, updated_at: new Date().toISOString() })
  .eq('id', 'default')
  .eq('tenant_id', tenantId);

if (writeErr) {
  console.error('[restore-atendimentos] Falha ao gravar:', writeErr.message);
  process.exit(1);
}

console.log('[restore-atendimentos] OK — recarregue o I.S.O PRO (F5) para ver os lotes restaurados.');
