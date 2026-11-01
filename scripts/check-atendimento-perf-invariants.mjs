#!/usr/bin/env node
/**
 * Invariantes de performance do atendimento (evita regressão dos ~20s).
 *
 * Protege:
 * 1) BAIXA RAPIDA no registrar (não regravar payload/TOAST)
 * 2) status_derivado alinhado ao detalhe (sem early-return qAt→parcial); lista sem derivado/linha
 * 3) trigger escala_outbox NÃO dispara em UPDATE só de updated_at
 * 4) mobile: timeout submit ≥45s + peek retry + gateway off fora de prod
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const mobileRoot = path.join(root, '..', 'iso_pro_mobile');

function readMigrations() {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({
      file: f,
      src: fs.readFileSync(path.join(migrationsDir, f), 'utf8'),
    }));
}

/** Última migration cujo corpo redefine a função (CREATE OR REPLACE FUNCTION ... nome). */
function lastDef(migrations, fnName) {
  const re = new RegExp(
    String.raw`CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.${fnName}\s*\(`,
    'i',
  );
  for (let i = migrations.length - 1; i >= 0; i--) {
    if (re.test(migrations[i].src)) return migrations[i];
  }
  return null;
}

function lastTriggerEscala(migrations) {
  for (let i = migrations.length - 1; i >= 0; i--) {
    const src = migrations[i].src;
    if (/trg_iso_pro_snapshot_escala_outbox/i.test(src) && /CREATE\s+TRIGGER/i.test(src)) {
      return migrations[i];
    }
  }
  return null;
}

function fail(msg) {
  console.error(`[check-atendimento-perf] FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`[check-atendimento-perf] ok: ${msg}`);
}

const migrations = readMigrations();

const registrar = lastDef(migrations, 'iso_pro_registrar_atendimento_mobile');
if (!registrar) {
  fail('iso_pro_registrar_atendimento_mobile ausente nas migrations');
} else if (!/BAIXA\s+RAPIDA/i.test(registrar.src)) {
  fail(
    `${registrar.file}: registrar sem «BAIXA RAPIDA» — não reintroduzir SELECT/UPDATE do payload JSON`,
  );
} else {
  ok(`registrar BAIXA RAPIDA (${registrar.file})`);
}

const statusDeriv = lastDef(migrations, 'iso_pro_documento_status_derivado');
if (!statusDeriv) {
  fail('iso_pro_documento_status_derivado ausente nas migrations');
} else {
  const src = statusDeriv.src;
  const start = src.search(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.iso_pro_documento_status_derivado\s*\(/i,
  );
  const body = start >= 0 ? src.slice(start, start + 12000) : src;
  // Deve preservar Recebido com qAt parcial (lista = detalhe) e manter caminho rápido.
  const preservaRecebido =
    /v_status\s*=\s*'recebido'/i.test(body) && /RETURN\s+'recebido'/i.test(body);
  const earlyParcial =
    /IF\s+v_at\s*>\s*v_eps\s+THEN/i.test(body) && /RETURN\s+'parcial'/i.test(body);
  if (!preservaRecebido) {
    fail(
      `${statusDeriv.file}: status_derivado deve preservar 'recebido' com baixa parcial (lista=detalhe)`,
    );
  } else if (!earlyParcial) {
    fail(
      `${statusDeriv.file}: status_derivado deve early-return parcial quando qAt>0 e status≠recebido (perf)`,
    );
  } else {
    ok(`status_derivado preserva recebido + early parcial (${statusDeriv.file})`);
  }
}

const healFn = lastDef(migrations, 'iso_pro_heal_status_documentos_planejamento');
if (!healFn) {
  fail('iso_pro_heal_status_documentos_planejamento ausente (heal set-based parcial→recebido)');
} else {
  ok(`heal set-based (${healFn.file})`);
}

const listPage = lastDef(migrations, 'iso_pro_list_documentos_planejamento_page');
if (!listPage) {
  fail('iso_pro_list_documentos_planejamento_page ausente nas migrations');
} else {
  const start = listPage.src.search(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.iso_pro_list_documentos_planejamento_page\s*\(/i,
  );
  const body = start >= 0 ? listPage.src.slice(start, start + 12000) : listPage.src;
  if (/iso_pro_documento_status_derivado/i.test(body)) {
    fail(
      `${listPage.file}: lista rápida NÃO pode chamar status_derivado por linha (timeout 30s)`,
    );
  } else {
    ok(`lista rápida sem status_derivado (${listPage.file})`);
  }
}

const trg = lastTriggerEscala(migrations);
if (!trg) {
  fail('trg_iso_pro_snapshot_escala_outbox ausente nas migrations');
} else {
  const m = trg.src.match(
    /CREATE\s+TRIGGER\s+trg_iso_pro_snapshot_escala_outbox[\s\S]{0,400}?EXECUTE\s+FUNCTION/i,
  );
  const def = m ? m[0] : '';
  if (/UPDATE\s+OF[^;]*\bupdated_at\b/i.test(def)) {
    fail(
      `${trg.file}: trigger escala_outbox NÃO pode incluir updated_at (cada baixa table-first rebentava ~20s)`,
    );
  } else if (!/UPDATE\s+OF\s+payload/i.test(def)) {
    fail(`${trg.file}: trigger escala_outbox esperado em UPDATE OF payload[, documentos]`);
  } else {
    ok(`trigger sem updated_at (${trg.file})`);
  }
}

const submit = lastDef(migrations, 'iso_pro_submit_atendimento_comando');
if (submit && !/_server_ms/i.test(submit.src)) {
  fail(`${submit.file}: submit deve gravar _server_ms no payload (telemetria de perf)`);
} else if (submit) {
  ok(`submit _server_ms (${submit.file})`);
}

// --- mobile ---
const snapPath = path.join(mobileRoot, 'src/lib/isoProSnapshot.ts');
const cfgPath = path.join(mobileRoot, 'src/lib/config.ts');
if (!fs.existsSync(snapPath) || !fs.existsSync(cfgPath)) {
  console.warn('[check-atendimento-perf] iso_pro_mobile ausente — skip checks mobile');
} else {
  const snap = fs.readFileSync(snapPath, 'utf8');
  const cfg = fs.readFileSync(cfgPath, 'utf8');

  const timeoutMatch = snap.match(/ATENDIMENTO_RPC_TIMEOUT_MS\s*=\s*([\d_]+)/);
  const timeoutMs = timeoutMatch ? Number(timeoutMatch[1].replace(/_/g, '')) : 0;
  if (!(timeoutMs >= 45_000)) {
    fail(`mobile ATENDIMENTO_RPC_TIMEOUT_MS=${timeoutMs} (mínimo 45000; abort ~18s causava Nuvem incompleta)`);
  } else {
    ok(`mobile submit timeout ${timeoutMs}ms`);
  }

  if (!/peekAtendimentoComandoComRetry/.test(snap)) {
    fail('mobile sem peekAtendimentoComandoComRetry (ACK após timeout do cliente)');
  } else {
    ok('mobile peek retry após timeout');
  }

  if (!/resolveAtendimentoGatewayUrl/.test(cfg) || !/ISO_PRO_PROD_SUPABASE_HOST/.test(cfg)) {
    fail('mobile config sem guard de gateway só-produção');
  } else if (!/ofeogtjydjdjrmrekebh/i.test(cfg) && !/isProd/.test(cfg)) {
    // aceita isProd check
    fail('mobile config: gateway deve desligar fora do host de produção');
  } else {
    ok('mobile gateway só em produção');
  }
}

if (process.exitCode) {
  console.error('[check-atendimento-perf] invariantes falharam.');
  process.exit(1);
}
console.log('[check-atendimento-perf] todos os invariantes OK.');
