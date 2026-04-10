/**
 * Codigo de barras EAN-13 para uso interno (prefixo BR ficticio + sequencia).
 * Compativel com leitores que esperam 13 digitos numericos.
 */

const PREFIXO = '7899999';
const DIGITOS_SEQUENCIA = 5;
const TAMANHO_EAN13 = 13;

/** Corpo de 12 digitos (sem DV) -> digito verificador EAN-13. */
export function digitoVerificadorEan13(corpo12: string): string {
  const d = corpo12.replace(/\D/g, '');
  if (d.length !== 12) {
    throw new Error('EAN-13: sao necessarios 12 digitos antes do verificador.');
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(d[i]!, 10);
    if (Number.isNaN(n)) throw new Error('EAN-13: apenas digitos.');
    sum += n * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

/** Retorna sequencia interna (1..99999) se o codigo foi gerado por este modulo, senao null. */
export function extrairSequenciaCodigoBarrasInterno(codigoBarras: string | undefined): number | null {
  const d = String(codigoBarras ?? '').replace(/\D/g, '');
  if (d.length !== TAMANHO_EAN13) return null;
  if (!d.startsWith(PREFIXO)) return null;
  const seqPart = d.slice(PREFIXO.length, 12);
  const n = parseInt(seqPart, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Proximo EAN-13 unico com base nos materiais ja cadastrados.
 * Formato: PREFIXO (7) + sequencia (5) + DV (1) = 13 digitos.
 */
export function gerarProximoCodigoBarrasEan13(materiais: ReadonlyArray<{ codigoBarras?: string }>): string {
  let maxSeq = 0;
  for (const m of materiais) {
    const s = extrairSequenciaCodigoBarrasInterno(m.codigoBarras);
    if (s !== null && s > maxSeq) maxSeq = s;
  }

  const maxTentativas = 100_000;
  for (let t = 0; t < maxTentativas; t++) {
    const seq = maxSeq + 1 + t;
    if (seq > 10 ** DIGITOS_SEQUENCIA - 1) {
      throw new Error('Limite de codigos de barras internos atingido (sequencia de 5 digitos).');
    }
    const corpo12 = `${PREFIXO}${String(seq).padStart(DIGITOS_SEQUENCIA, '0')}`;
    const dv = digitoVerificadorEan13(corpo12);
    const candidato = `${corpo12}${dv}`;
    const duplicado = materiais.some((m) => String(m.codigoBarras ?? '').replace(/\D/g, '') === candidato);
    if (!duplicado) return candidato;
  }

  throw new Error('Nao foi possivel gerar codigo de barras unico.');
}
