import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';
for (let i = 0; i < 24; i++) {
  const { data: snap } = await sb.from('iso_pro_snapshot').select('updated_at').eq('id','default').eq('tenant_id',T).maybeSingle();
  const { data: cmds } = await sb.from('iso_pro_atendimento_comandos').select('idempotency_key, created_at').eq('tenant_id',T).gte('created_at','2026-07-18T21:30:00Z').order('created_at',{ascending:false}).limit(3);
  console.log(new Date().toLocaleTimeString(), '| snapshot:', snap?.updated_at, '| comandos novos:', cmds?.length ?? 0, cmds?.[0]?.idempotency_key ?? '');
  if ((cmds?.length ?? 0) > 0) { console.log('>>> ESTORNO CHEGOU'); break; }
  await new Promise((r) => setTimeout(r, 10000));
}
