import fs from 'node:fs';

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let cur = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i+1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ';') { cur.push(f); f = ''; }
    else if (ch === '\r') {}
    else if (ch === '\n') { cur.push(f); f=''; if (cur.some(c=>c.trim()!=='')) rows.push(cur); cur = []; }
    else f += ch;
  }
  if (f !== '' || cur.length) { cur.push(f); if (cur.some(c=>c.trim()!=='')) rows.push(cur); }
  return rows;
}
const norm = (v) => String(v ?? '').trim().toLowerCase();
const num = (v) => { const s = String(v??'').replace(',','.'); return Number.isFinite(Number(s)) ? Number(s) : 0; };

// ATD export: soma retirada liquida (retirada_original - estornada) por doc+codigo
const atd = parseCsv(fs.readFileSync('C:/Users/rogic/Downloads/iso-pro-atendimentos-materiais-2026-07-18T20-25-253.csv', 'latin1'));
const ha = atd[0]; const iDoc = ha.indexOf('documento_numero'); const iRev = ha.indexOf('documento_revisao');
const iCod = ha.indexOf('codigo_material'); const iQ = ha.indexOf('quantidade_retirada_original'); const iE = ha.indexOf('quantidade_estornada_acumulada'); const iSt = ha.indexOf('status_lote');
const atdSum = new Map();
for (const r of atd.slice(1)) {
  if (norm(r[iSt]) === 'cancelado') continue;
  const k = norm(r[iDoc]) + '|' + norm(r[iRev]) + '|' + norm(r[iCod]);
  const liq = num(r[iQ]) - num(r[iE]);
  atdSum.set(k, (atdSum.get(k) ?? 0) + liq);
}
console.log('ATD export: linhas', atd.length - 1, '| chaves doc+cod:', atdSum.size);

// Docs export: quantidade_atendida por doc+rev+codigo
const docs = parseCsv(fs.readFileSync('C:/Users/rogic/Downloads/iso-pro-documentos-itens-2026-07-18T20-24-19.csv', 'latin1'));
const hd = docs[0];
const jNum = hd.indexOf('numero'); const jRev = hd.indexOf('revisao'); const jCod = hd.indexOf('codigo_material'); const jAt = hd.indexOf('quantidade_atendida');
const docAt = new Map();
for (const r of docs.slice(1)) {
  const k = norm(r[jNum]) + '|' + norm(r[jRev]) + '|' + norm(r[jCod]);
  docAt.set(k, (docAt.get(k) ?? 0) + num(r[jAt]));
}
console.log('Docs export: linhas', docs.length - 1);

// Comparacao: ATD diz X, doc diz Y
let ok = 0; const menos = []; const mais = [];
for (const [k, qa] of atdSum) {
  const qd = docAt.get(k);
  if (qd === undefined) { menos.push({ k, atd: qa, doc: 'LINHA NAO ENCONTRADA' }); continue; }
  if (Math.abs(qd - qa) < 1e-6) ok++;
  else if (qd < qa - 1e-6) menos.push({ k, atd: qa, doc: qd });
  else mais.push({ k, atd: qa, doc: qd });
}
console.log('Coerentes (doc == atendimento):', ok);
console.log('Doc MENOR que atendimento (estornei demais):', menos.length);
for (const m of menos.slice(0, 30)) console.log('  ', JSON.stringify(m));
console.log('Doc MAIOR que atendimento:', mais.length);
for (const m of mais.slice(0, 10)) console.log('  ', JSON.stringify(m));
