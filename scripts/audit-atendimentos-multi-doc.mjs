/**
 * Audita export CSV de atendimentos vs planejamento (documentos-itens).
 * Detecta lotes mobile onde o documento exportado não bate com o desenho do material.
 *
 * Uso:
 *   node scripts/audit-atendimentos-multi-doc.mjs <atendimentos.csv> <documentos-itens.csv>
 */
import fs from 'node:fs';

const csvPath = process.argv[2];
const docPath = process.argv[3];
if (!csvPath || !docPath) {
  console.error('Uso: node scripts/audit-atendimentos-multi-doc.mjs <atendimentos.csv> <documentos-itens.csv>');
  process.exit(1);
}

function parseCsvSemicolon(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(';').map((h) => h.trim());
  const idx = (name) => header.indexOf(name);
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQ = !inQ;
        cur += c;
        continue;
      }
      if (c === ';' && !inQ) {
        cols.push(cur);
        cur = '';
        continue;
      }
      cur += c;
    }
    cols.push(cur);
    const get = (k) => {
      const v = cols[idx(k)] ?? '';
      return v.replace(/^"|"$/g, '').replace(/""/g, '"').trim();
    };
    rows.push(Object.fromEntries(header.map((h, i) => [h, get(h)])));
  }
  return rows;
}

const atRows = parseCsvSemicolon(fs.readFileSync(csvPath, 'utf8'));
const docRows = parseCsvSemicolon(fs.readFileSync(docPath, 'utf8'));

const codToDocs = new Map();
for (const r of docRows) {
  const numDoc = r.documento_numero ?? r.numero ?? '';
  const cod = (r.codigo_material ?? r.codigo ?? '').trim();
  if (!cod || !numDoc) continue;
  if (!codToDocs.has(cod)) codToDocs.set(cod, new Set());
  codToDocs.get(cod).add(numDoc);
}

const byLote = new Map();
for (const r of atRows) {
  const lote = r.lote_numero ?? '';
  if (!lote) continue;
  if (!byLote.has(lote)) byLote.set(lote, []);
  byLote.get(lote).push(r);
}

const mobileLotes = [...byLote.entries()].filter(([, rs]) =>
  rs.some((r) => /mobile/i.test(String(r.origem_registro ?? ''))),
);

console.log('Lotes mobile no CSV:', mobileLotes.length);

const multiDocExport = [];
const suspeitos = [];

for (const [lote, rs] of mobileLotes) {
  const docsExport = new Set(rs.map((r) => r.documento_numero));
  if (docsExport.size > 1) {
    multiDocExport.push({ lote, docs: [...docsExport], itens: rs.length });
  }

  const docsEsperados = new Set();
  const conflitos = [];
  for (const r of rs) {
    const cod = r.codigo_material ?? '';
    const esperados = codToDocs.get(cod);
    if (!esperados) continue;
    for (const d of esperados) docsEsperados.add(d);
    const docExp = r.documento_numero ?? '';
    if (esperados.size === 1) {
      const unico = [...esperados][0];
      if (unico !== docExp) {
        conflitos.push({ codigo: cod, docExport: docExp, docsPlanejamento: [unico] });
      }
    } else if (!esperados.has(docExp)) {
      conflitos.push({ codigo: cod, docExport: docExp, docsPlanejamento: [...esperados] });
    }
  }

  if (conflitos.length) {
    suspeitos.push({
      lote,
      docsExport: [...docsExport],
      docsEsperados: [...docsEsperados],
      conflitos,
      totalConflitos: conflitos.length,
      itens: rs.length,
    });
  }
}

console.log('\nLotes mobile com mais de 1 documento no CSV (export antigo):', multiDocExport.length);
for (const x of multiDocExport.slice(0, 10)) {
  console.log(`  ${x.lote} (${x.itens} itens) -> ${x.docs.join(' | ')}`);
}

console.log('\nLotes mobile SUSPEITOS (documento exportado vs planejamento):', suspeitos.length);
for (const s of suspeitos.sort((a, b) => b.totalConflitos - a.totalConflitos)) {
  const exp = s.docsEsperados.slice(0, 5).join(' · ');
  const mais = s.docsEsperados.length > 5 ? ` (+${s.docsEsperados.length - 5})` : '';
  console.log(`\n--- ${s.lote} | ${s.totalConflitos}/${s.itens} itens conflitantes`);
  console.log(`    CSV mostra: ${s.docsExport.join(' · ')}`);
  console.log(`    Planejamento esperaria: ${exp}${mais}`);
  for (const c of s.conflitos.slice(0, 8)) {
    console.log(`    · ${c.codigo}: CSV="${c.docExport}" | desenho(s)=${c.docsPlanejamento.join(' ou ')}`);
  }
  if (s.conflitos.length > 8) console.log(`    ... +${s.conflitos.length - 8} itens`);
}

console.log('\n--- Resumo ---');
console.log('Correção de código corrige EXPORT/RECIBO se atendimentoHistorico tiver documento certo por linha.');
console.log('Lotes acima com conflito no CSV ANTIGO podem ser só bug de export — reexportar após deploy.');
console.log('Se após reexport ainda conflitar, o dado gravado (historico/planejamento) precisa estorno manual.');
