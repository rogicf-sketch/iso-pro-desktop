/**
 * Restauro do incidente de importação de 12/07/2026:
 * a importação do CSV de 40 mil linhas leu o planejamento base do seed demo local
 * (falha de leitura da nuvem) e sobrescreveu o snapshot, apagando os 1250 desenhos
 * antigos e zerando atendimentos + atendimentoHistorico.
 *
 * Fontes de recuperação:
 *  1. Export CSV de 12/07 18:43 UTC (1250 docs antigos completos, com quantidades atendidas e localizações)
 *  2. iso_pro_atendimento_comandos (IDs originais de 1201 docs + 92 linhas de histórico de 08-12/07)
 *  3. Backup local de 12/06 (13 atendimentos + 138 linhas de histórico)
 *
 * O restauro grava: documentos = 1250 antigos restaurados + 2872 novos da importação
 * (sem os docs demo DOC-1001/DOC-1002), e repõe atendimentos/atendimentoHistorico.
 *
 * Uso:
 *   node --use-system-ca scripts/restore-planejamento-incidente-20260712.mjs           (dry-run)
 *   node --use-system-ca scripts/restore-planejamento-incidente-20260712.mjs --apply   (grava na nuvem)
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnvFile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
loadEnvFile(path.join(projectRoot, '.env'));

const APPLY = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const TENANT = '00000000-0000-0000-0000-000000000001';

const EXPORT_CSV = 'C:/Users/rogic/Downloads/iso-pro-documentos-itens-2026-07-12T18-43-08.csv';
const BACKUP_JUNHO = path.join(projectRoot, 'backups', 'iso-pro-snapshot-export-2026-06-12T02-14-00.json');

const supabase = createClient(url, key, { auth: { persistSession: false } });

/* ---------- CSV parsing (separador ';', aspas com escape "" , BOM UTF-8) ---------- */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ';') {
      cur.push(field);
      field = '';
    } else if (ch === '\r') {
      // ignora
    } else if (ch === '\n') {
      cur.push(field);
      field = '';
      if (cur.some((c) => c.trim() !== '')) rows.push(cur);
      cur = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || cur.length) {
    cur.push(field);
    if (cur.some((c) => c.trim() !== '')) rows.push(cur);
  }
  return rows;
}

function parseDecimalPtBr(s) {
  const t = String(s ?? '').trim();
  if (!t) return 0;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function dataParaIso(s) {
  const t = String(s ?? '').trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return t;
}

function chaveDoc(numero, revisao) {
  return `${String(numero).trim().toLowerCase()}|${String(revisao ?? '').trim().toLowerCase()}`;
}

async function main() {
  /* ---------- 1. Reconstruir docs antigos do export CSV ---------- */
  const csvText = fs.readFileSync(EXPORT_CSV, 'utf8');
  const rows = parseCsv(csvText);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const iNumero = col('numero');
  const iRev = col('revisao');
  const iDesc = col('descricao_documento');
  const iResp = col('responsavel');
  const iData = col('data_documento');
  const iCodigo = col('codigo_material');
  const iDescMat = col('descricao_material');
  const iLoc = col('localizacao_planejamento');
  const iUn = col('unidade');
  const iQtdDoc = col('quantidade_documento');
  const iQtdAtd = col('quantidade_atendida');
  if ([iNumero, iRev, iCodigo, iQtdDoc].some((x) => x < 0)) {
    throw new Error('Cabecalho do export CSV inesperado: ' + header.join(','));
  }

  const antigos = new Map(); // chave -> doc
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const numero = String(row[iNumero] ?? '').trim();
    const revisao = String(row[iRev] ?? '').trim();
    if (!numero) continue;
    const k = chaveDoc(numero, revisao);
    if (!antigos.has(k)) {
      antigos.set(k, {
        id: null,
        numero,
        revisao,
        data: dataParaIso(row[iData]),
        descricao: String(row[iDesc] ?? '').trim(),
        responsavel: String(row[iResp] ?? '').trim(),
        itens: [],
      });
    }
    const doc = antigos.get(k);
    doc.itens.push({
      id: null,
      codigo: String(row[iCodigo] ?? '').trim(),
      descricao: String(row[iDescMat] ?? '').trim(),
      unidade: String(row[iUn] ?? '').trim() || 'UN',
      quantidade: parseDecimalPtBr(row[iQtdDoc]),
      quantidadeAtendida: parseDecimalPtBr(row[iQtdAtd]),
      localizacao: String(row[iLoc] ?? '').trim(),
    });
  }
  console.log('[1] Export CSV: docs antigos reconstruidos:', antigos.size);

  /* ---------- 2. IDs originais: comandos + backup junho ---------- */
  const { data: cmds, error: cmdErr } = await supabase
    .from('iso_pro_atendimento_comandos')
    .select('created_at, payload')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: true });
  if (cmdErr) throw new Error('Falha a ler comandos: ' + cmdErr.message);

  const idPorChave = new Map();
  const itensPorChave = new Map(); // chave doc -> Map(codigo.lower -> itemId)
  const histComandos = new Map();
  for (const c of cmds ?? []) {
    const p = typeof c.payload === 'string' ? JSON.parse(c.payload) : c.payload ?? {};
    for (const d of p.documentos ?? []) {
      const k = chaveDoc(d.numero, d.revisao);
      if (d.id) idPorChave.set(k, String(d.id));
      if (Array.isArray(d.itens) && d.itens.length) {
        if (!itensPorChave.has(k)) itensPorChave.set(k, new Map());
        const m = itensPorChave.get(k);
        for (const it of d.itens) {
          if (it.id && it.codigo) m.set(String(it.codigo).trim().toLowerCase(), String(it.id));
        }
      }
    }
    for (const h of p.atendimentoHistorico ?? []) {
      histComandos.set(String(h.id), h);
    }
  }
  console.log('[2] Comandos: IDs de docs:', idPorChave.size, '| historico:', histComandos.size);

  const rawJun = JSON.parse(fs.readFileSync(BACKUP_JUNHO, 'utf8'));
  const rowsJun = Array.isArray(rawJun) ? rawJun : rawJun.linhas ?? [rawJun];
  const plJun = (() => {
    const r = rowsJun.find((x) => x.tenant_id === TENANT) ?? rowsJun[0];
    return typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
  })();
  for (const d of plJun.documentos ?? []) {
    const k = chaveDoc(d.numero, d.revisao);
    if (!idPorChave.has(k) && d.id) idPorChave.set(k, String(d.id));
    if (Array.isArray(d.itens) && d.itens.length) {
      if (!itensPorChave.has(k)) itensPorChave.set(k, new Map());
      const m = itensPorChave.get(k);
      for (const it of d.itens) {
        const ck = String(it.codigo ?? '').trim().toLowerCase();
        if (it.id && ck && !m.has(ck)) m.set(ck, String(it.id));
      }
    }
  }
  console.log('[2] + backup junho: IDs de docs acumulados:', idPorChave.size);

  /* ---------- 3. Atribuir IDs aos docs antigos ---------- */
  let idsRecuperados = 0;
  let idsNovos = 0;
  for (const [k, doc] of antigos) {
    const idAntigo = idPorChave.get(k);
    doc.id = idAntigo ?? crypto.randomUUID();
    if (idAntigo) idsRecuperados += 1;
    else idsNovos += 1;
    const mapaItens = itensPorChave.get(k);
    doc.itens.forEach((it, idx) => {
      const ck = it.codigo.toLowerCase();
      const idConhecido = mapaItens?.get(ck);
      // Gerador deterministico identico ao da importacao CSV original.
      it.id = idConhecido ?? `csv-doc-item-${k}-${ck}-${idx}`;
    });
  }
  console.log('[3] IDs recuperados:', idsRecuperados, '| novos UUID:', idsNovos);

  /* ---------- 4. Ler snapshot atual ---------- */
  const { data: snapRow, error: snapErr } = await supabase
    .from('iso_pro_snapshot')
    .select('payload, updated_at')
    .eq('id', 'default')
    .eq('tenant_id', TENANT)
    .maybeSingle();
  if (snapErr || !snapRow) throw new Error('Falha a ler snapshot: ' + (snapErr?.message ?? 'linha nao encontrada'));
  const atual = typeof snapRow.payload === 'string' ? JSON.parse(snapRow.payload) : snapRow.payload;
  console.log('[4] Snapshot atual: docs', (atual.documentos ?? []).length, '| updated_at', snapRow.updated_at);

  /* ---------- 5. Montar lista final de documentos ---------- */
  const chavesAntigas = new Set(antigos.keys());
  const novosImportados = (atual.documentos ?? []).filter((d) => {
    const numero = String(d.numero ?? '');
    if (/^DOC-100[12]$/i.test(numero)) return false; // seed demo fora da nuvem
    return !chavesAntigas.has(chaveDoc(numero, d.revisao));
  });
  const docsFinais = [...antigos.values(), ...novosImportados];
  const chavesFinais = new Set(docsFinais.map((d) => chaveDoc(d.numero, d.revisao)));
  if (chavesFinais.size !== docsFinais.length) throw new Error('Chaves duplicadas na lista final!');
  console.log('[5] Final: antigos', antigos.size, '+ novos', novosImportados.length, '=', docsFinais.length, 'documentos');

  /* ---------- 6. Restaurar atendimentos + historico ---------- */
  const histMap = new Map();
  for (const h of plJun.atendimentoHistorico ?? []) histMap.set(String(h.id), h);
  for (const [id, h] of histComandos) histMap.set(id, h);
  const atendMap = new Map();
  for (const a of plJun.atendimentos ?? []) atendMap.set(String(a.id), a);
  for (const a of atual.atendimentos ?? []) atendMap.set(String(a.id), a);
  const atendimentosFinal = [...atendMap.values()];
  console.log('[6] Historico juntado:', histMap.size, '(junho', (plJun.atendimentoHistorico ?? []).length, '+ comandos', histComandos.size, ')');
  console.log('[6] Atendimentos restaurados:', atendimentosFinal.length);

  /* ---------- 7. Integridade: excluir linhas de historico orfas (doc apagado antes do incidente) ---------- */
  const idsDocsFinais = new Set(docsFinais.map((d) => String(d.id)));
  const historicoFinal = [];
  const orfas = [];
  for (const h of histMap.values()) {
    const ref = String(h.documentoId ?? '');
    if (!ref || idsDocsFinais.has(ref)) historicoFinal.push(h);
    else orfas.push(`${h.loteNumero} -> doc ${h.documento} (${ref})`);
  }
  console.log('[7] Historico final:', historicoFinal.length, '| linhas orfas excluidas:', orfas.length);
  if (orfas.length) console.log('    orfas:', orfas.join(' ; '));

  // Sanidade: quantidades atendidas restauradas
  const comAtendida = [...antigos.values()].reduce(
    (acc, d) => acc + d.itens.filter((i) => i.quantidadeAtendida > 0).length,
    0,
  );
  console.log('[7] Itens antigos com quantidadeAtendida > 0:', comAtendida);

  if (!APPLY) {
    console.log('\nDRY-RUN concluido. Nada foi gravado. Rode com --apply para restaurar.');
    return;
  }

  /* ---------- 8. Gravar ---------- */
  const nextPayload = {
    ...atual,
    documentos: docsFinais,
    atendimentos: atendimentosFinal,
    atendimentoHistorico: historicoFinal,
    dataAtualizacao: new Date().toISOString(),
  };
  const { error: writeErr } = await supabase
    .from('iso_pro_snapshot')
    .update({ payload: nextPayload, updated_at: new Date().toISOString() })
    .eq('id', 'default')
    .eq('tenant_id', TENANT);
  if (writeErr) throw new Error('Falha ao gravar snapshot: ' + writeErr.message);
  console.log('[8] Snapshot gravado com', docsFinais.length, 'documentos.');

  /* ---------- 9. Sincronizar tabelas de escala ---------- */
  const { data: syncData, error: syncErr } = await supabase.rpc(
    'iso_pro_sync_documentos_planejamento_from_snapshot',
    { p_tenant_id: TENANT },
  );
  if (syncErr) {
    console.log('[9] AVISO: sync tabelas falhou:', syncErr.message, '— usar Configuracoes > reparar escala no PC.');
  } else {
    console.log('[9] Tabelas de escala sincronizadas:', JSON.stringify(syncData));
  }

  /* ---------- 10. Releitura de confirmacao ---------- */
  const { data: confRow } = await supabase
    .from('iso_pro_snapshot')
    .select('payload')
    .eq('id', 'default')
    .eq('tenant_id', TENANT)
    .maybeSingle();
  const conf = typeof confRow.payload === 'string' ? JSON.parse(confRow.payload) : confRow.payload;
  console.log(
    '[10] CONFIRMACAO NUVEM — documentos:',
    (conf.documentos ?? []).length,
    '| atendimentos:',
    (conf.atendimentos ?? []).length,
    '| historico:',
    (conf.atendimentoHistorico ?? []).length,
    '| lotes:',
    (conf.atendimentoLotes ?? []).length,
  );
}

main().catch((e) => {
  console.error('FALHA:', e.message);
  process.exit(1);
});
