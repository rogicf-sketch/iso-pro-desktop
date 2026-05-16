/**
 * Decimal flexivel para CSV/planilhas (PT-BR vs internacional).
 *
 * - `12,5` ou `749,5` → virgula como decimal (sem ambiguidade com ponto).
 * - `12.5` ou `749.5` → ponto como decimal (incl. `0.125`).
 * - `1.234,56` ou `7.495,5` → formato BR (ponto = milhar, virgula = decimal): remove milhares e aplica decimal.
 * - `7.495` ou `1.234.567` → so pontos, padrao BR de milhares (ultimo grupo 3 digitos): junta digitos.
 *   Excecao: `12.5`, `749.5` (ultimo grupo com 1–2 digitos) = decimal, nao milhar.
 */

function stripSpaces(s: string): string {
  return s.trim().replace(/\s/g, '').replace(/\u00A0/g, '');
}

/** Dois segmentos por ponto: `0.xxx` e sempre decimal (ex.: 0.125). */
function isLeadingZeroDecimal(a: string, b: string): boolean {
  return a === '0' && b.length > 0;
}

/**
 * `12.5`, `749.5` — parte decimal com 1 ou 2 digitos (nao e bloco de milhar 000).
 */
function isLikelyDecimalWithDot(b: string): boolean {
  return b.length === 1 || b.length === 2;
}

/** `7.495`, `12.500`, `1.234.567` — milhares BR (blocos de 3 apos o primeiro). */
function joinBrThousandsParts(parts: string[]): string {
  return parts.join('');
}

export function parseDecimalFlexible(s: string): number {
  let t = stripSpaces(s);
  if (!t) return 0;

  const hasComma = t.includes(',');
  const hasDot = t.includes('.');

  if (hasComma && hasDot) {
    const lastComma = t.lastIndexOf(',');
    const lastDot = t.lastIndexOf('.');
    if (lastComma > lastDot) {
      // BR: 1.234,56 ou 7.495,5
      const intPart = t.slice(0, lastComma).replace(/\./g, '');
      const decPart = t.slice(lastComma + 1).replace(/\./g, '');
      t = `${intPart}.${decPart}`;
    } else {
      // US: 1,234.56 — remove virgulas de milhar
      t = t.replace(/,/g, '');
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }

  if (hasComma && !hasDot) {
    // 749,5 ou 12,5 — uma virgula = decimal
    const parts = t.split(',');
    if (parts.length === 2) {
      const intPart = parts[0].replace(/\./g, '');
      t = `${intPart}.${parts[1]}`;
    } else if (parts.length > 2) {
      const dec = parts.pop()!;
      t = `${parts.join('').replace(/\./g, '')}.${dec}`;
    }
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }

  if (hasDot && !hasComma) {
    const parts = t.split('.');
    if (parts.length === 1) {
      const n = Number(parts[0]);
      return Number.isFinite(n) ? n : 0;
    }
    if (parts.length === 2) {
      const [a, b] = parts;
      if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) {
        const n = Number(t);
        return Number.isFinite(n) ? n : 0;
      }
      if (isLeadingZeroDecimal(a, b)) {
        return Number(`${a}.${b}`);
      }
      if (isLikelyDecimalWithDot(b)) {
        return Number(`${a}.${b}`);
      }
      if (b.length === 3) {
        const joined = joinBrThousandsParts(parts);
        const n = Number(joined);
        return Number.isFinite(n) ? n : 0;
      }
      return Number(`${a}.${b}`);
    }
    // Tres ou mais segmentos: 7.495.312 ou 1.234.567.890
    if (parts.every((p) => /^\d+$/.test(p))) {
      const firstLen = parts[0].length;
      const rest = parts.slice(1);
      if (firstLen >= 1 && firstLen <= 3 && rest.length > 0 && rest.every((p) => p.length === 3)) {
        const n = Number(joinBrThousandsParts(parts));
        return Number.isFinite(n) ? n : 0;
      }
    }
    const n = Number(t.replace(/\./g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Quantidades de recebimento (JSON, snapshot, form): aceita numero ou string em PT-BR / internacional.
 * Arredonda a 6 casas para reduzir lixo de ponto flutuante (ex.: 35.999999999999964 → 36).
 */
/**
 * Peso em kg com duas casas decimais (alinhado a planilhas em pt-BR e evita ambiguidade:
 * `14.818` no input HTML nao deve ser lido como «catorze mil» — fica `14.82`).
 */
export function roundPesoKg(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function coerceRecebimentoQuantidade(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'string') {
    return parseDecimalFlexible(val);
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return 0;
    return Math.round(val * 1_000_000) / 1_000_000;
  }
  return parseDecimalFlexible(String(val));
}
