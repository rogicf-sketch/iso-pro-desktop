import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';
const { data, error } = await sb.from('iso_pro_atendimento_comandos').select('*').eq('tenant_id', T).order('created_at', { ascending: false }).limit(5);
if (error) { console.error('ERRO:', error.message); process.exit(1); }
for (const c of data) {
  const { payload, resultado, ...rest } = c;
  console.log(JSON.stringify(rest));
}
