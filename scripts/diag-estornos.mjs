import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';

// 1. Snapshot: estorno log e campos relacionados
const { data: snap } = await sb.from('iso_pro_snapshot').select('payload').eq('id','default').eq('tenant_id',T).maybeSingle();
const pl = typeof snap.payload==='string'?JSON.parse(snap.payload):snap.payload;
console.log('[snapshot] atendimentoEstornoLog:', (pl.atendimentoEstornoLog??[]).length);
console.log('[snapshot] keys com estorno:', Object.keys(pl).filter(k=>k.toLowerCase().includes('estorno')));

// lotes com quantidade estornada/retirada alterada?
const lotesComEstorno = (pl.atendimentoLotes??[]).filter(l=>JSON.stringify(l).toLowerCase().includes('estorn'));
console.log('[snapshot] lotes que mencionam estorno:', lotesComEstorno.length);

// 2. Comandos 08-12/07: algum contem estorno?
const { data: cmds } = await sb.from('iso_pro_atendimento_comandos').select('id, created_at, payload').eq('tenant_id',T).limit(1000);
let cmdEstorno = 0;
for (const c of cmds??[]) {
  const s = JSON.stringify(c.payload??{}).toLowerCase();
  if (s.includes('estorno')) { cmdEstorno++; console.log('[comando estorno]', c.created_at, s.slice(0,300)); }
}
console.log('[comandos] com estorno:', cmdEstorno, 'de', (cmds??[]).length);

// 3. Backup de junho tinha estorno log?
const bkPath = path.resolve('backups', 'iso-pro-snapshot-export-2026-06-12T02-14-00.json');
if (fs.existsSync(bkPath)) {
  const bk = JSON.parse(fs.readFileSync(bkPath,'utf8'));
  const p = bk.payload ?? bk;
  console.log('[backup 12/06] keys:', Object.keys(p).filter(k=>k.toLowerCase().includes('estorno')||k.toLowerCase().includes('atendimento')));
  console.log('[backup 12/06] estornoLog:', (p.atendimentoEstornoLog??[]).length, '| historico:', (p.atendimentoHistorico??[]).length, '| lotes:', (p.atendimentoLotes??[]).length);
} else console.log('[backup 12/06] nao encontrado');
