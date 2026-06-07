const MM2 = 'mm\u00B2';

/** Formata quantidade com separador de milhar pt-BR. */
export function formatarQuantidadeRir(q: number | string): string {
  const raw = String(q).trim();
  if (!raw) return '—';
  const n = Number(raw.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

const FRASES_NORMA_PADRAO = [
  'isolamento em composto poliolefínico (PVC) antichama',
  'condutor flexível de cobre (classe 4/5)',
  'classe de tensão 450/750V',
  'normas NBR NM 247-3 e NBR NM 280',
];

const TRECHOS_BOILERPLATE: RegExp[] = [
  /\bNBR\s+NM\s+[\d]+(?:\s*REV\.?\s*[\w./-]+)?(?:\s*E\s*[\d]+)?\b/gi,
  /\bCLASSE\s+DE\s+TENS[ÃA]O\s*[\d./]+\s*V\b/gi,
  /\bCOMPOSTO\s+POLIOLEF[IÍ]NICO\s*\(PVC\)[^,;.\n]*/gi,
  /\bCLORETO\s+POLIVINILA\s*\(PVC\)[^,;.\n]*/gi,
  /\bCONDUTOR\s+FLEX[IÍ]VEL\s+DE\s+COBRE[^,;.\n]*/gi,
  /\bCLASSE\s+\d+\s*\/\s*\d+\b/gi,
  /\bFABRICAD[OA][^,;.\n]*CONFORMIDADE[^,;.\n]*/gi,
  /\bFIO\s*\/\s*CABO\s+COM\s+ISOLA[ÇC][ÃA]O[^,;.\n]*/gi,
  /\bCABO\s+COM\s+ISOLA[ÇC][ÃA]O[^,;.\n]*/gi,
  /\bEM\s+CONFORMIDADE\s+COM\s+AS\s+NORMAS[^,;.\n]*/gi,
];

function normalizarEspacos(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function tituloPalavras(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMm\b/g, 'mm');
}

function parseBitola(valor: string): string {
  return valor.includes(',') ? valor : valor.replace('.', ',');
}

/** Extrai seção nominal (ex.: 2,5 mm²) sem confundir com «CLASSE 4/5». */
export function extrairSecaoMaterialRir(descricao: string): string | null {
  const desc = normalizarEspacos(descricao);
  const idx = desc.search(/NOMINAL/i);
  if (idx < 0) return null;
  const trecho = desc.slice(idx);
  const mDec = trecho.match(/NOMINAL\s+(\d+[,.]\d+)\s*mm/i);
  if (mDec?.[1]) return `${parseBitola(mDec[1])} ${MM2}`;
  const mInt = trecho.match(/NOMINAL\s+(\d+)\s*mm/i);
  if (mInt?.[1]) return `${parseBitola(mInt[1])} ${MM2}`;
  return null;
}

function extrairCor(desc: string): string | null {
  const m =
    desc.match(/\bCOR\s+([A-ZÁÉÍÓÚÃÕÂÊÔÇ][\wÁÉÍÓÚÃÕÂÊÔÇ-]*)/i) ??
    desc.match(/\bCOR:\s*([A-ZÁÉÍÓÚÃÕÂÊÔÇ][\wÁÉÍÓÚÃÕÂÊÔÇ-]*)/i);
  return m?.[1] ? tituloPalavras(m[1]) : null;
}

function extrairCondutores(desc: string): string | null {
  const m =
    desc.match(/(\d+)\s*[xX×]\s*(\d+[,.]?\d*)\s*mm/i) ??
    desc.match(/(\d+)\s+CONDUTORES?/i);
  if (!m) return null;
  if (m[2]) return `${m[1]}×${parseBitola(m[2])} ${MM2}`;
  return `${m[1]} cond.`;
}

function tipoMaterialResumido(desc: string): string {
  const u = desc.toUpperCase();
  if (u.includes('FIO/CABO') || u.includes('FIO / CABO') || u.includes('CABO')) return 'Cabo flexível PVC';
  if (u.includes('FIO')) return 'Fio/Cabo';
  return 'Material';
}

/** Reduz descrição longa ao que varia entre itens (bitola, cor, condutores). */
export function compactarDescricaoMaterialRir(descricao: string): string {
  const original = normalizarEspacos(descricao);
  if (!original) return '—';
  if (original.length <= 72) return original;

  const partes: string[] = [tipoMaterialResumido(original)];

  const secao = extrairSecaoMaterialRir(original);
  if (secao) partes.push(`Seção ${secao}`);

  const cond = extrairCondutores(original);
  if (cond && !secao) partes.push(cond);

  const cor = extrairCor(original);
  if (cor) partes.push(`Cor ${cor}`);

  if (partes.length > 1) return partes.join(' · ');

  let curta = original;
  for (const rx of TRECHOS_BOILERPLATE) {
    curta = curta.replace(rx, '');
  }
  curta = normalizarEspacos(curta.replace(/^[,\s-]+|[,\s-]+$/g, ''));
  if (curta.length > 0 && curta.length < original.length) return curta;
  return original.length > 90 ? `${original.slice(0, 87)}…` : original;
}

function coletarTrechosComuns(itens: { descricaoMaterial?: string }[]): string[] {
  const descs = itens.map((i) => normalizarEspacos(i.descricaoMaterial ?? '')).filter(Boolean);
  if (descs.length < 2) return [];

  const achados = new Set<string>();
  for (const rx of TRECHOS_BOILERPLATE) {
    for (const d of descs) {
      const m = d.match(rx);
      if (m) achados.add(normalizarEspacos(m[0]));
    }
  }

  const nbrs = new Set<string>();
  for (const d of descs) {
    const matches = d.match(/\bNBR\s+NM\s+[\d-]+(?:\s*REV\.?\s*[\w./-]+)?/gi) ?? [];
    for (const n of matches) nbrs.add(normalizarEspacos(n));
  }
  if (nbrs.size > 0) achados.add(`Normas ${[...nbrs].join(', ')}`);

  return [...achados];
}

/** Nota técnica geral exibida uma vez no rodapé do relatório. */
export function extrairNotaTecnicaGeralRir(itens: { descricaoMaterial?: string }[]): string | null {
  const descs = itens.map((i) => i.descricaoMaterial ?? '').filter((d) => d.trim().length > 40);
  if (descs.length === 0) return null;

  const compactas = descs.map(compactarDescricaoMaterialRir);
  const houveCompactacao = compactas.some((c, i) => c.length < (descs[i]?.length ?? 0) * 0.65);
  if (!houveCompactacao && descs.length < 2) return null;

  const trechos = coletarTrechosComuns(itens);
  const base = trechos.length > 0 ? trechos.join('. ') : FRASES_NORMA_PADRAO.join('. ');

  return (
    'Especificações gerais / normas técnicas: ' +
    base +
    '. Demais características conforme procedimento de inspeção e documentação do fornecedor.'
  );
}

/** HTML da descrição compacta com destaque em bitola/cor. */
export function formatarDescricaoCompactaHtmlRir(descricao: string): string {
  const texto = compactarDescricaoMaterialRir(descricao);
  const esc = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return esc
    .replace(/(Seção\s+\d+[,.]?\d*\s*mm\u00B2)/gi, '<strong>$1</strong>')
    .replace(/(Cor\s+[\wÁÉÍÓÚÃÕÂÊÔÇ-]+)/gi, '<strong>$1</strong>')
    .replace(/(\d+\s*[xX×]\s*\d+[,.]?\d*\s*mm\u00B2)/gi, '<strong>$1</strong>');
}
