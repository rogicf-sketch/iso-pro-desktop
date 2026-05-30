import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || 'backups';
const files = fs
  .readdirSync(dir)
  .filter((f) => f.startsWith('iso-pro-snapshot-export-') && f.endsWith('.json'))
  .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m);
const file = path.join(dir, files[0].f);
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));

const rows = Array.isArray(raw) ? raw : raw.linhas ?? [raw];
for (const row of rows) {
  const pl = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload ?? {};
  console.log('--- tenant_id:', row.tenant_id ?? '(n/a)');
  console.log('updated_at:', row.updated_at);
  console.log('atendimentos:', (pl.atendimentos ?? []).length);
  console.log('atendimentoHistorico:', (pl.atendimentoHistorico ?? []).length);
  for (const a of pl.atendimentos ?? []) {
    console.log(' ', a.numero, a.dataAtendimento, a.status, a.documentoNumero);
  }
}
