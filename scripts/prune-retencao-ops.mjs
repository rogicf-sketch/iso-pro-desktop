/**
 * Chama iso_pro_prune_retencao_ops via service role (ou imprime SQL se faltar key).
 * Uso: npm run ops:prune-retencao
 * Env: SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEY + VITE_SUPABASE_URL
 */
if (process.env.ISO_PRO_JWT_SKIP_TLS_VERIFY === '1') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const days = Math.max(7, Number(process.env.ISO_PRO_PRUNE_DAYS || 30) || 30);

function loadEnv() {
  const out = { ...process.env };
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (out[k] === undefined || out[k] === '') out[k] = v;
  }
  return out;
}

const env = loadEnv();
const url = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim();
const service = String(
  env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '',
).trim();

console.log('=== Prune retencao ops ===');
console.log(`retain_days: ${days}`);

if (!url) {
  console.error('Falta VITE_SUPABASE_URL');
  process.exit(1);
}

if (!service) {
  console.log('Sem SUPABASE_SERVICE_ROLE_KEY — execute no SQL Editor:');
  console.log(`  SELECT public.iso_pro_prune_retencao_ops(${days});`);
  process.exit(0);
}

const supabase = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.rpc('iso_pro_prune_retencao_ops', {
  p_retain_days: days,
});

if (error) {
  console.error('Falha:', error.message);
  if (/does not exist|PGRST202/i.test(error.message)) {
    console.error('Aplique a migration 20260711160000_iso_pro_retencao_outbox_comandos.sql');
  }
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
console.log('=== OK ===');
