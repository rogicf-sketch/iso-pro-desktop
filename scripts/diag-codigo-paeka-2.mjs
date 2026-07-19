/** Aprofunda atendimento do codigo PAEKA — historico, atendimentos, estornos. */
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
const docsAlvo = [
  'BGB-20"-TB-002-SS11-NI',
  'BGB-20"-TB-005-SS11-PP',
  'BGB-24"-TB-001-SS11-NI',
  'BGB-24"-TB-004-SS11-PP',
  'BGL-20"-BV-001-SS11-NI',
  'BGL-20"-BV-002-SS11-NI',
];

const supabase = createClient(url, key, { auth: { persistSession: false } });
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const hasCod = (obj) => {
  const s = JSON.stringify(obj ?? {}).toLowerCase();
  return s.includes(COD.toLowerCase());
};

async function main() {
  const { data: snap } = await supabase
    .from('iso_pro_snapshot')
    .select('payload')
    .eq('id', 'default')
    .eq('tenant_id', TENANT)
    .maybeSingle();
  const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;

  console.log('counts:', {
    historico: (pl.atendimentoHistorico ?? []).length,
    lotes: (pl.atendimentoLotes ?? []).length,
    atendimentos: (pl.atendimentos ?? []).length,
    estornos: (pl.atendimentoEstornoLog ?? []).length,
  });

  // Qualquer estrutura que mencione o codigo
  const histHit = (pl.atendimentoHistorico ?? []).filter(hasCod);
  const loteHit = (pl.atendimentoLotes ?? []).filter(hasCod);
  const atdHit = (pl.atendimentos ?? []).filter(hasCod);
  const estHit = (pl.atendimentoEstornoLog ?? []).filter(hasCod);
  console.log('hits por codigo:', {
    historico: histHit.length,
    lotes: loteHit.length,
    atendimentos: atdHit.length,
    estornos: estHit.length,
  });

  if (histHit.length) {
    console.log('=== HISTORICO completo (PAEKA) ===');
    for (const h of histHit) console.log(JSON.stringify(h, null, 1));
  }
  if (atdHit.length) {
    console.log('=== ATENDIMENTOS (PAEKA) ===');
    for (const a of atdHit) console.log(JSON.stringify(a, null, 1).slice(0, 2000));
  }
  if (loteHit.length) {
    console.log('=== LOTES (PAEKA) ===');
    for (const l of loteHit) console.log(JSON.stringify(l, null, 1).slice(0, 2000));
  }

  // Historico por documento alvo (qualquer codigo) — para ver se ATDs existem
  console.log('=== HISTORICO por desenho alvo (todos os codigos) ===');
  for (const numDoc of docsAlvo) {
    const rows = (pl.atendimentoHistorico ?? []).filter((h) => {
      const d = String(h.documentoNumero ?? h.numeroDocumento ?? h.documento ?? '');
      return d === numDoc || d.includes(numDoc.replace(/"/g, ''));
    });
    const paeka = rows.filter(hasCod);
    const somaPaeka = paeka.reduce(
      (s, h) => s + num(h.quantidade ?? h.quantidadeAtendida ?? h.qtd),
      0,
    );
    console.log(
      numDoc,
      '→ hist total linhas:',
      rows.length,
      '| PAEKA linhas:',
      paeka.length,
      '| PAEKA qtd:',
      somaPaeka,
      '| ATDs:',
      [...new Set(rows.map((h) => h.loteNumero ?? h.numeroLote ?? h.atendimentoNumero ?? h.numero).filter(Boolean))].slice(0, 8),
    );
  }

  // Itens nos docs com quantidadeAtendida > 0 sem historico?
  console.log('=== Docs com qAt>0 vs historico PAEKA ===');
  for (const doc of pl.documentos ?? []) {
    if (!docsAlvo.includes(String(doc.numero))) continue;
    for (const it of doc.itens ?? []) {
      if (String(it.codigo ?? '').trim().toUpperCase() !== COD) continue;
      const a = num(it.quantidadeAtendida ?? it.quantidade_atendida);
      if (a <= 0) continue;
      const histDoc = histHit.filter(
        (h) => String(h.documentoNumero ?? h.numeroDocumento ?? h.documento ?? '') === String(doc.numero),
      );
      const somaH = histDoc.reduce((s, h) => s + num(h.quantidade ?? h.quantidadeAtendida ?? h.qtd), 0);
      console.log({
        doc: doc.numero,
        qDoc: num(it.quantidade),
        qAtDoc: a,
        histSoma: somaH,
        divergencia: a !== somaH,
      });
    }
  }

  // amostra keys historico
  if ((pl.atendimentoHistorico ?? []).length) {
    console.log('keys historico:', Object.keys(pl.atendimentoHistorico[0]).join(','));
  }
  if ((pl.atendimentos ?? []).length) {
    console.log('keys atendimento[0]:', Object.keys(pl.atendimentos[0]).join(','));
    console.log('amostra atendimento[0]:', JSON.stringify(pl.atendimentos[0]).slice(0, 500));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
