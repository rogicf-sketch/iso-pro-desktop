/**
 * Corrige mojibake comum em numeros de documento com polegadas (ex.: AG-6"-UT...).
 * UTF-8 de aspas tipograficas lido como Latin-1 vira "â€œ" / "â€" / "â€".
 */
export function formatDocumentoNumeroDisplay(raw: string | null | undefined): string {
  let s = String(raw ?? '');
  if (!s) return s;
  s = s
    .replace(/â€œ|â€|â€²|â€³/g, '"')
    .replace(/(\d)â€+(?=-)/g, '$1"')
    .replace(/[“”″‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'");
  return s;
}
