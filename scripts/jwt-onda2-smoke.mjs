/**
 * Smoke JWT onda 2 — prova que anon NÃO executa writes; peek ainda pode.
 *
 *   npm run jwt:onda2-smoke
 *
 * Env (usa .env / .env.staging):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *   ISO_PRO_SMOKE_TENANT_ID (opcional)
 *
 * Exit 0 = revoke OK · 1 = falha · 2 = config
 *
 * Preferir apontar URL para staging (`ofeogtjydjdjrmrekebh`) enquanto a janela 7d corre.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function loadEnv() {
  const out = { ...process.env };
  for (const name of ['.env', '.env.staging']) {
    const envPath = path.join(root, name);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      if (out[k] !== undefined && String(out[k]).length > 0) continue;
      out[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return out;
}

function resolveTenantId(env) {
  const raw = String(env.ISO_PRO_SMOKE_TENANT_ID || env.ISO_PRO_E2E_TENANT_ID || '')
    .trim()
    .replace(/^["']|["']$/g, '');
  if (!raw || !UUID_RE.test(raw)) return DEFAULT_TENANT;
  return raw;
}

function isDenied(error) {
  if (!error) return false;
  const msg = String(error.message || error.code || error).toLowerCase();
  // PostgREST esconde funções sem EXECUTE → "Could not find the function" / PGRST202
  return (
    /permission denied|not authorized|42501|forbidden|401|403|pgrst301|pgrst202|could not find the function/i.test(
      msg,
    ) ||
    error.code === '42501' ||
    error.code === 'PGRST301' ||
    error.code === 'PGRST202'
  );
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const tenant = resolveTenantId(env);

console.log('=== jwt:onda2-smoke ===');

if (!url || !anonKey) {
  console.error('Falta VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY.');
  process.exitCode = 2;
} else {
  let host = '(invalid)';
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  console.log(`url_host: ${host}`);
  console.log(`tenant: ${tenant}`);
  if (!/ofeogtjydjdjrmrekebh|huvktaxsosxrfpvdigxq/.test(host)) {
    console.warn('aviso: host não é staging SP nem prod conhecido — confirma .env');
  }

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /** RPCs de escrita: anon DEVE falhar (42501 ou PGRST202 — PostgREST esconde sem EXECUTE). */
  const writeProbes = [
    {
      name: 'iso_pro_patch_snapshot',
      args: {
        p_tenant_id: tenant,
        p_baseline: '1970-01-01T00:00:00.000Z',
        p_patch: { dataAtualizacao: '1970-01-01T00:00:00.000Z' },
        p_merge_keys: null,
      },
    },
    {
      name: 'iso_pro_submit_atendimento_comando',
      args: {
        p_tenant_id: tenant,
        p_idempotency_key: `smoke-onda2-${Date.now()}`,
        p_baseline: '1970-01-01T00:00:00.000Z',
        p_documentos: null,
      },
    },
    {
      name: 'iso_pro_submit_escala_domain_patch',
      args: {
        p_tenant_id: tenant,
        p_baseline: '1970-01-01T00:00:00.000Z',
        p_patch: { recebimentos: [] },
        p_merge_keys: null,
        p_domain: 'recebimentos',
      },
    },
    {
      name: 'iso_pro_write_documentos_sot',
      args: {
        p_tenant_id: tenant,
        p_documentos: [],
        p_baseline: null,
        p_atendimento_historico: null,
        p_atendimentos: null,
      },
    },
  ];

  let failed = 0;

  for (const probe of writeProbes) {
    const { data, error } = await anon.rpc(probe.name, probe.args);
    if (isDenied(error)) {
      console.log(`ok: anon BLOQUEADO em ${probe.name} (${error.code || 'denied'})`);
    } else if (error) {
      console.warn(`aviso: ${probe.name} erro inesperado (não permission): ${error.message}`);
      console.warn('  → espera-se permission denied / PGRST202 após onda 2');
      failed += 1;
    } else {
      console.error(`FALHA: anon EXECUTOU ${probe.name} (revoke em falta?) data=`, data);
      failed += 1;
    }
  }

  // Confirma que as funções existem (service role) — evita falso positivo PGRST202 por typo
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.ISO_PRO_SERVICE_ROLE_KEY;
  if (serviceKey) {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: existErr } = await admin.rpc('iso_pro_peek_atendimento_comando', {
      p_tenant_id: tenant,
      p_idempotency_key: `smoke-onda2-svc-${Date.now()}`,
    });
    if (existErr && /could not find the function/i.test(String(existErr.message || ''))) {
      console.error('FALHA: service_role também não vê peek — URL/project errado?');
      failed += 1;
    } else {
      console.log('ok: service_role alcança RPCs no project (funções existem)');
    }
  } else {
    console.log('info: sem SERVICE_ROLE — skip confirmação existência (ok para CI leve)');
  }

  /** Peek: anon DEVE ainda poder executar (resposta null/ok, não permission denied). */
  const peekKey = `smoke-onda2-peek-${Date.now()}`;
  const { error: peekErr } = await anon.rpc('iso_pro_peek_atendimento_comando', {
    p_tenant_id: tenant,
    p_idempotency_key: peekKey,
  });
  if (isDenied(peekErr)) {
    console.error('FALHA: anon BLOQUEADO em peek (ainda precisa de EXECUTE anon até JWT-only)');
    failed += 1;
  } else if (peekErr) {
    console.warn(`aviso: peek erro não-permission: ${peekErr.message}`);
  } else {
    console.log('ok: anon ainda pode peek (esperado na onda 2)');
  }

  if (failed > 0) {
    console.error(`\nresultado: FALHOU (${failed} checks)`);
    process.exitCode = 1;
  } else {
    console.log('\nresultado: OK — writes anon revogados · peek anon ok');
  }
}
