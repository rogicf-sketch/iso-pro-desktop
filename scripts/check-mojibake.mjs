/**
 * Falha se encontrar mojibake típico (UTF-8 lido como Latin-1) em src/.
 * Ex.: "…" → "â€¦", "—" → "â€”", "ão" → "Ã£o".
 *
 * Uso: node scripts/check-mojibake.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src');
const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.md']);

/** Sequências de 2+ codepoints que só aparecem em texto UTF-8 mal descodificado. */
const PATTERNS = [
  { re: /\u00E2\u20AC[\u00A6\u201C\u201D\u2013\u2014\u00A2]/g, label: 'ellipsis/dash/bullet mojibake (â€…)' },
  { re: /\u00C3[\u00A1\u00A9\u00AD\u00B3\u00BA\u00A3\u00B5\u00A7\u00B1]/g, label: 'accented letter mojibake (Ã£/Ã§/Ã©…)' },
  { re: /\u00C2[\u00AB\u00BB]/g, label: 'guillemet mojibake (Â«Â»)' },
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name === 'dist') continue;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(name.name))) out.push(full);
  }
  return out;
}

const hits = [];
for (const file of walk(ROOT)) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const { re, label } of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(line)) {
        hits.push({ file, line: i + 1, label, sample: line.trim().slice(0, 120) });
      }
    }
  }
}

if (hits.length === 0) {
  console.log('check-mojibake: ok (sem texto corrompido em src/)');
  process.exit(0);
}

console.error(`check-mojibake: ${hits.length} ocorrencia(s) de texto corrompido:\n`);
for (const h of hits.slice(0, 40)) {
  const rel = path.relative(process.cwd(), h.file);
  console.error(`  ${rel}:${h.line}  [${h.label}]`);
  console.error(`    ${h.sample}`);
}
if (hits.length > 40) console.error(`  … e mais ${hits.length - 40}`);
console.error('\nCorrija para UTF-8 correcto (ex.: "..." em vez de "â€¦", "Nao"/"Não" em vez de "NÃ£o").');
process.exit(1);
