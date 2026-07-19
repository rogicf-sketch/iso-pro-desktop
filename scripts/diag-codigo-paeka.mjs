/** Cruzamento PAEKA0C0B9-8033080: planejamento + recebimentos + atendimento. */
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnvFile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(__dirname, '..', '.env'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const TENANT = '00000000-0000-0000-0000-000000000001';
const COD = 'PAEKA0C0B9-8033080';
const codNorm = COD.toLowerCase();

const supabase = createClient(url, key, { auth: { persistSession: false } });
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

async function main() {
  const { data: snap, error } = await supabase
    .from('iso_pro_snapshot')
    .select('payload')
    .eq('id', 'default')
    .eq('tenant_id', TENANT)
    .maybeSingle();
  if (error || !snap) throw new Error(error?.message ?? 'sem snapshot');
  const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;

  // --- Planejamento ---
  const linhasPlan = [];
  let prevista = 0;
  let atendidaDocs = 0;
  for (const doc of pl.documentos ?? []) {
    if (String(doc.status ?? '').toLowerCase() === 'cancelado') continue;
    for (const it of doc.itens ?? []) {
      if (String(it.codigo ?? '').trim().toLowerCase() !== codNorm) continue;
      const q = num(it.quantidade);
      const a = num(it.quantidadeAtendida ?? it.quantidade_atendida);
      prevista += q;
      atendidaDocs += a;
      linhasPlan.push({
        numero: doc.numero,
        revisao: doc.revisao,
        qDoc: q,
        qAt: a,
        falta: Math.max(0, q - a),
        statusDocCol: doc.status ?? null,
      });
    }
  }
  linhasPlan.sort((a, b) => String(a.numero).localeCompare(String(b.numero)));
  console.log('=== PLANEJAMENTO ===');
  console.log('linhas:', linhasPlan.length, '| prevista (soma):', prevista, '| atendida nos docs:', atendidaDocs);
  for (const l of linhasPlan) console.log(' ', JSON.stringify(l));

  // --- Recebimentos ---
  let recebido = 0;
  const linhasRec = [];
  for (const rec of pl.recebimentos ?? []) {
    const modo = String(rec.modoRecebimento ?? 'direto').toLowerCase();
    const st = String(rec.statusConferencia ?? rec.status ?? '').toLowerCase();
    if (st === 'cancelado' || st === 'rascunho') continue;
    const conta =
      modo === 'direto' ||
      st === 'conferido' ||
      st === 'parcialmente_conferido' ||
      st === 'divergente';
    if (!conta) continue;
    for (const it of rec.itens ?? []) {
      if (String(it.codigo ?? '').trim().toLowerCase() !== codNorm) continue;
      let q;
      if (modo === 'direto') q = Math.max(0, num(it.quantidade));
      else if (it.quantidadeConferida != null) q = Math.max(0, num(it.quantidadeConferida));
      else q = Math.max(0, num(it.quantidade));
      recebido += q;
      linhasRec.push({
        nota: rec.nota,
        modo,
        status: st || '(direto)',
        loc: it.localizacao ?? '',
        q,
      });
    }
  }
  console.log('=== RECEBIMENTOS ===');
  console.log('linhas:', linhasRec.length, '| recebido total:', recebido);
  for (const l of linhasRec) console.log(' ', JSON.stringify(l));

  // --- Atendimento: historico + lotes + atendimentos ---
  const hist = (pl.atendimentoHistorico ?? []).filter(
    (h) => String(h.codigoMaterial ?? h.codigo ?? '').trim().toLowerCase() === codNorm,
  );
  const lotes = (pl.atendimentoLotes ?? []).filter((lote) =>
    (lote.itens ?? []).some(
      (it) => String(it.codigoMaterial ?? it.codigo ?? '').trim().toLowerCase() === codNorm,
    ),
  );
  const atds = (pl.atendimentos ?? []).filter((a) =>
    (a.itens ?? a.linhas ?? []).some?.(
      (it) => String(it.codigoMaterial ?? it.codigo ?? '').trim().toLowerCase() === codNorm,
    ) ||
    String(a.codigoMaterial ?? a.codigo ?? '').trim().toLowerCase() === codNorm,
  );

  let somaHist = 0;
  console.log('=== ATENDIMENTO HISTORICO ===');
  console.log('linhas:', hist.length);
  for (const h of hist) {
    const q = num(h.quantidade ?? h.quantidadeAtendida ?? h.qtd);
    somaHist += q;
    console.log(
      ' ',
      JSON.stringify({
        lote: h.loteNumero ?? h.numeroLote ?? h.atendimentoNumero ?? h.numero,
        doc: h.documentoNumero ?? h.numeroDocumento ?? h.documento,
        rev: h.documentoRevisao ?? h.revisao,
        q,
        data: h.data ?? h.criadoEm ?? h.atendidoEm,
        status: h.status,
        local: h.localizacao ?? h.local,
      }),
    );
  }
  console.log('soma historico:', somaHist);

  console.log('=== ATENDIMENTO LOTES (com este codigo) ===');
  console.log('lotes:', lotes.length);
  for (const lote of lotes.slice(0, 20)) {
    const itens = (lote.itens ?? []).filter(
      (it) => String(it.codigoMaterial ?? it.codigo ?? '').trim().toLowerCase() === codNorm,
    );
    console.log(
      ' ',
      JSON.stringify({
        numero: lote.numero ?? lote.loteNumero ?? lote.id,
        status: lote.status,
        doc: lote.documentoNumero ?? lote.numeroDocumento,
        itens: itens.map((it) => ({
          q: num(it.quantidade ?? it.quantidadeAtendida),
          local: it.localizacao ?? it.local,
        })),
      }),
    );
  }

  // Amostra de keys se historico vazio mas ha dados
  if (!hist.length && (pl.atendimentoHistorico ?? []).length) {
    console.log('keys amostra historico:', Object.keys(pl.atendimentoHistorico[0]).join(','));
  }
  if (!lotes.length && (pl.atendimentoLotes ?? []).length) {
    console.log('keys amostra lote:', Object.keys(pl.atendimentoLotes[0]).join(','));
    const amostra = pl.atendimentoLotes[0];
    if (amostra.itens?.[0]) console.log('keys item lote:', Object.keys(amostra.itens[0]).join(','));
  }

  // Tabela escala
  const { data: itensTab } = await supabase
    .from('iso_pro_documento_itens_planejamento')
    .select('documento_id, codigo, quantidade, quantidade_atendida, localizacao')
    .eq('tenant_id', TENANT)
    .ilike('codigo', COD);
  console.log('=== TABELA ESCALA (itens) ===');
  console.log('linhas:', (itensTab ?? []).length);
  let tabPrev = 0;
  let tabAt = 0;
  for (const it of itensTab ?? []) {
    tabPrev += num(it.quantidade);
    tabAt += num(it.quantidade_atendida);
  }
  console.log('soma tabela prevista:', tabPrev, '| atendida:', tabAt);

  console.log('=== RESUMO ===');
  console.log({
    prevista,
    recebido,
    atendidaNosDocumentos: atendidaDocs,
    somaHistorico: somaHist,
    saldoDisponivelEstimado: recebido - atendidaDocs,
    statusGlobalEsperado:
      prevista <= 0
        ? 'pendente'
        : atendidaDocs + 1e-9 >= prevista
          ? 'atendido'
          : recebido + 1e-9 >= prevista
            ? 'recebido'
            : recebido > 0
              ? 'parcial'
              : 'pendente',
  });
}

main().catch((e) => {
  console.error('FALHA:', e.message);
  process.exit(1);
});
