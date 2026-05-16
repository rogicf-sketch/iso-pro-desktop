/**
 * Verifica um ficheiro JSON gerado por export-iso-pro-snapshot.mjs (sem ligar ao Supabase).
 *
 * Uso:
 *   node scripts/verify-iso-pro-snapshot-export.mjs backups/iso-pro-snapshot-export-....json
 */
import fs from 'node:fs';
import path from 'node:path';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Uso: node scripts/verify-iso-pro-snapshot-export.mjs <caminho-do-json>');
  process.exit(1);
}

const abs = path.resolve(filePath);
if (!fs.existsSync(abs)) {
  console.error('Ficheiro nao encontrado:', abs);
  process.exit(1);
}

const asArr = (x) => (Array.isArray(x) ? x : []);
const asObjArr = (x) => asArr(x).filter((v) => v != null && typeof v === 'object');

function refsFromPayload(payload) {
  const out = [];
  for (const row of asObjArr(payload.atendimentoHistorico)) {
    const id = String(row.documentoId ?? '').trim();
    const num = String(row.documento ?? '').trim().toLowerCase();
    if (!id && !num) continue;
    out.push({ id, num });
  }
  for (const at of asObjArr(payload.atendimentos)) {
    const id = String(at.documentoId ?? '').trim();
    const num = String(at.documentoNumero ?? '').trim().toLowerCase();
    if (!id && !num) continue;
    out.push({ id, num });
  }
  return out;
}

function refKey(r) {
  if (r.id) return 'id:' + r.id;
  if (r.num) return 'n:' + r.num;
  return '';
}

function covered(ref, docs) {
  const ids = new Set(docs.map((d) => String(d.id ?? '').trim()).filter(Boolean));
  const nums = new Set(docs.map((d) => String(d.numero ?? '').trim().toLowerCase()).filter(Boolean));
  if (ref.id && ids.has(ref.id)) return true;
  if (ref.num && nums.has(ref.num)) return true;
  return false;
}

const raw = fs.readFileSync(abs, 'utf8');
let j;
try {
  j = JSON.parse(raw);
} catch (e) {
  console.error('JSON invalido:', e instanceof Error ? e.message : e);
  process.exit(1);
}

console.log('Ficheiro:', abs);
console.log('Tamanho bytes:', fs.statSync(abs).size);
console.log('exportadoEm:', j.exportadoEm ?? '(em falta)');
console.log('origem:', j.origem ?? '(em falta)');

const linhas = asArr(j.linhas);
console.log('linhas:', linhas.length);

if (!linhas.length) {
  console.error('ERRO: array "linhas" vazio ou em falta.');
  process.exit(1);
}

const row = linhas[0];
console.log('Primeira linha id:', row.id, '| updated_at:', row.updated_at);

const pl = row.payload != null && typeof row.payload === 'object' ? row.payload : {};
const keys = Object.keys(pl).sort();
console.log('payload keys (' + keys.length + '):', keys.join(', '));

const docs = asObjArr(pl.documentos);
const mats = asObjArr(pl.materiais);
const users = asObjArr(pl.usuarios);
const usersSistema = asObjArr(pl.usuariosSistema);
const ats = asObjArr(pl.atendimentos);
const hist = asObjArr(pl.atendimentoHistorico);
const unidades = asObjArr(pl.unidades);

console.log(
  'Counts: unidades',
  unidades.length,
  '| materiais',
  mats.length,
  '| documentos',
  docs.length,
  '| usuarios',
  users.length,
  '| usuariosSistema',
  usersSistema.length,
  '| atendimentos',
  ats.length,
  '| atendimentoHistorico',
  hist.length,
);

const refs = refsFromPayload(pl);
const distintas = new Set(refs.map(refKey).filter(Boolean));
const uncovered = refs.filter((r) => !covered(r, docs));
const amostra = [...new Set(uncovered.map(refKey).filter(Boolean))].slice(0, 25);

console.log('refs em atendimentos+historico:', refs.length, '| distintas:', distintas.size);

if (uncovered.length) {
  console.log('AVISO: referencias sem documento no payload (possive orfas):', uncovered.length);
  console.log('Amostra:', amostra.join(', ') || '(vazio)');
} else {
  console.log('Integridade refs->documentos neste backup: OK.');
}

function pickNomeEmail(u) {
  return {
    id: u.id,
    nome: u.nome ?? u.name ?? u.nomeCompleto,
    email: u.email,
  };
}

const cec = [...users, ...usersSistema].filter((u) =>
  /cec/i.test(String(u.nome ?? u.name ?? u.nomeCompleto ?? u.email ?? '')),
);
console.log('Usuarios (usuarios + usuariosSistema) com "cec" em nome/email:', cec.length);
if (cec.length) {
  console.log(cec.slice(0, 8).map(pickNomeEmail));
}

console.log('--- Fim da verificacao ---');
