/**
 * Restauro 2026-07-18: a Conferência mobile gravou patch com recebimentos=[1] e apagou os
 * restantes 124 do snapshot (+ tabelas de escala re-projetadas). Restaura a lista completa a
 * partir do cache localStorage do Electron (dump), preservando a conferência de hoje (NF-102345).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';
const DUMP = path.join(os.tmpdir(), 'iso-recovery', 'recebimentos-dump-1.json');

const locais = JSON.parse(fs.readFileSync(DUMP, 'utf8'));
if (!Array.isArray(locais) || locais.length < 100) {
  throw new Error(`Dump inesperado: ${Array.isArray(locais) ? locais.length : typeof locais}`);
}

const { data: snap, error: e1 } = await sb
  .from('iso_pro_snapshot')
  .select('payload, updated_at')
  .eq('id', 'default')
  .eq('tenant_id', T)
  .maybeSingle();
if (e1) throw new Error('ler snapshot: ' + e1.message);
const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;
const atuais = pl.recebimentos ?? [];
console.log('nuvem antes:', atuais.length, 'recebimento(s) | updated_at:', snap.updated_at);

// Funde: lista local completa + versões da nuvem por cima (preserva conferência de hoje).
const porId = new Map();
for (const r of locais) porId.set(String(r.id), r);
for (const r of atuais) porId.set(String(r.id), r);
const restaurados = Array.from(porId.values());
console.log('lista restaurada:', restaurados.length, 'recebimento(s)');

const { data: patched, error: e2 } = await sb.rpc('iso_pro_patch_snapshot', {
  p_tenant_id: T,
  p_baseline: snap.updated_at,
  p_patch: { recebimentos: restaurados, dataAtualizacao: new Date().toISOString() },
});
if (e2) throw new Error('patch snapshot: ' + e2.message);
console.log('snapshot atualizado. novo updated_at:', patched);

const { data: sync, error: e3 } = await sb.rpc('iso_pro_sync_recebimentos_from_snapshot', {
  p_tenant_id: T,
});
if (e3) console.log('sync tabelas: ERR', e3.message);
else console.log('sync tabelas de escala:', JSON.stringify(sync));

const { data: page, error: e4 } = await sb.rpc('iso_pro_list_recebimentos_page', {
  p_tenant_id: T, p_busca: null, p_offset: 0, p_limit: 3, p_status: null, p_modo: null,
});
console.log('verificação lista paginada: total =', e4 ? 'ERR ' + e4.message : page?.total);
