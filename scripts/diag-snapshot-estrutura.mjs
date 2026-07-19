import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';

// 1) linha completa do snapshot (todas as colunas)
const { data: snap, error: e1 } = await sb
  .from('iso_pro_snapshot')
  .select('*')
  .eq('id', 'default')
  .eq('tenant_id', T)
  .maybeSingle();
if (e1) console.log('snapshot err:', e1.message);
else {
  console.log('colunas da linha snapshot:');
  for (const [k, v] of Object.entries(snap)) {
    if (v == null) { console.log(' ', k, '= null'); continue; }
    if (typeof v === 'object') {
      const keys = Array.isArray(v) ? `array(${v.length})` : Object.keys(v).map((kk) => {
        const vv = v[kk];
        return `${kk}:${Array.isArray(vv) ? vv.length : typeof vv}`;
      }).join(', ');
      console.log(' ', k, '=>', keys);
    } else if (typeof v === 'string' && v.length > 120) {
      console.log(' ', k, `= string(${v.length})`);
    } else {
      console.log(' ', k, '=', v);
    }
  }
}

// 2) tabelas candidatas de histórico/auditoria/outbox
const candidatas = [
  'iso_pro_snapshot_history',
  'iso_pro_snapshot_audit',
  'iso_pro_snapshot_patch_outbox',
  'iso_pro_snapshot_outbox',
  'iso_pro_outbox',
  'iso_pro_audit',
  'iso_pro_comandos',
  'iso_pro_atendimento_comandos',
  'iso_pro_snapshot_backup',
  'iso_pro_backups',
  'iso_pro_recebimento_itens',
];
for (const t of candidatas) {
  const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
  console.log(t, '=>', error ? 'ERR: ' + error.message.slice(0, 60) : count + ' linhas');
}
