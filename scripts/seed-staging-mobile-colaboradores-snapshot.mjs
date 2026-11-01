/**
 * Seed mínimo para smoke mobile no staging-load:
 * colaboradores (+ stub recebimentos se vazio) em iso_pro_snapshot.
 *
 *   node --use-system-ca scripts/run-load-on-staging.mjs -- scripts/seed-staging-mobile-colaboradores-snapshot.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { assertLoadTestStagingOnly } from './load-test-staging-guard.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TENANT = '00000000-0000-0000-0000-000000000001';

function loadEnv(name) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const staging = loadEnv('.env.staging');
for (const [k, v] of Object.entries(staging)) {
  if (!process.env[k]) process.env[k] = v;
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ISO_PRO_SERVICE_ROLE_KEY;
assertLoadTestStagingOnly(url);
if (!url || !serviceKey) {
  console.error('Falta URL / SERVICE_ROLE em .env.staging');
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const seed = [
  {
    id: 'load-col-e2e-1',
    nome: 'Operador E2E',
    tipo: 'interno',
    matricula: 'E2E001',
    funcao: 'Operador',
    empresa: 'ISO PRO',
    documento: '',
    telefone: '',
    observacao: 'smoke staging',
    ativo: true,
  },
  {
    id: 'load-col-e2e-2',
    nome: 'Conferente E2E',
    tipo: 'interno',
    matricula: 'E2E002',
    funcao: 'Conferente',
    empresa: 'ISO PRO',
    documento: '',
    telefone: '',
    observacao: 'smoke staging',
    ativo: true,
  },
];

const { data: row, error } = await sb
  .from('iso_pro_snapshot')
  .select('payload,updated_at')
  .eq('id', 'default')
  .eq('tenant_id', TENANT)
  .maybeSingle();
if (error) {
  console.error(error.message);
  process.exit(1);
}

const p = row?.payload && typeof row.payload === 'object' ? { ...row.payload } : {};
const cols = Array.isArray(p.colaboradores) ? p.colaboradores : [];
const recs = Array.isArray(p.recebimentos) ? p.recebimentos : [];
console.log('before cols=%d recs=%d', cols.length, recs.length);

const byId = new Map(cols.map((c) => [String(c?.id ?? ''), c]));
for (const c of seed) byId.set(c.id, c);
p.colaboradores = [...byId.values()];

if (recs.length === 0) {
  p.recebimentos = [
    {
      id: 'load-rec-smoke-1',
      numero: 'NF-SMOKE-1',
      fornecedor: 'Seed Smoke',
      status: 'conferido',
      itens: [],
    },
  ];
}

const now = new Date().toISOString();
const { error: uerr } = await sb.from('iso_pro_snapshot').upsert(
  { id: 'default', tenant_id: TENANT, payload: p, updated_at: now },
  { onConflict: 'tenant_id,id' },
);
if (uerr) {
  console.error('snapshot:', uerr.message);
  process.exit(1);
}

for (const c of seed) {
  const { error: cerr } = await sb.from('iso_pro_colaboradores').upsert(
    {
      tenant_id: TENANT,
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      matricula: c.matricula,
      funcao: c.funcao,
      empresa: c.empresa,
      documento: c.documento,
      telefone: c.telefone,
      observacao: c.observacao,
      ativo: c.ativo,
    },
    { onConflict: 'tenant_id,id' },
  );
  if (cerr) console.log('iso_pro_colaboradores skip:', cerr.message);
}

console.log(
  'OK snapshot colaboradores=%d recebimentos=%d updated_at=%s',
  p.colaboradores.length,
  Array.isArray(p.recebimentos) ? p.recebimentos.length : 0,
  now,
);
console.log('No telemovel: toque Actualizar em Atendimento e escolha E2E001 / Operador E2E.');
