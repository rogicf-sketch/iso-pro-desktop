import type { TipoDocControle } from './relatorioDocControle';

/** Origem pública estável para QR impresso (clientes leem fora da rede da obra). */
export const DOC_VERIFICACAO_PUBLIC_ORIGIN = 'https://isoprogestaodemateriais.com.br';

export type DocumentoVerificacaoDados = {
  tipo: TipoDocControle;
  codigo: string;
  emitidoEm: string;
  versaoDoc: string;
};

const TIPOS = new Set<string>(['RIR', 'RNC', 'RF', 'RECIBO', 'RFO']);

export function rotuloTipoDocumentoControle(tipo: string): string {
  switch (tipo) {
    case 'RIR':
      return 'Relatório de inspeção de recebimento';
    case 'RNC':
      return 'Relatório de não conformidade';
    case 'RF':
      return 'Relatório fotográfico';
    case 'RECIBO':
      return 'Recibo de atendimento';
    case 'RFO':
      return 'Relatório final de obra';
    default:
      return 'Documento I.S.O PRO';
  }
}

/** Origem a gravar no QR: em localhost usa o site público para o telemóvel conseguir abrir. */
export function origemPublicaVerificacaoDocumento(): string {
  if (typeof window === 'undefined') return DOC_VERIFICACAO_PUBLIC_ORIGIN;
  const host = window.location.hostname;
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return DOC_VERIFICACAO_PUBLIC_ORIGIN;
  }
  return window.location.origin;
}

/**
 * URL da página pública de verificação (hash router).
 * Ex.: https://…/#/verificar?t=RIR&c=RIR-INS-04&e=…&v=7
 */
export function urlVerificacaoDocumentoControle(opts: {
  tipo: TipoDocControle;
  codigo: string;
  emitidoEm?: string;
  versaoDoc?: string;
  origin?: string;
}): string {
  const origin = (opts.origin ?? origemPublicaVerificacaoDocumento()).replace(/\/$/, '');
  const codigo = opts.codigo.trim() || opts.tipo;
  const emitido = (opts.emitidoEm ?? new Date().toISOString()).trim();
  const ver = String(opts.versaoDoc ?? '0').trim() || '0';
  const q = new URLSearchParams({
    t: opts.tipo,
    c: codigo,
    e: emitido,
    v: ver,
  });
  return `${origin}/#/verificar?${q.toString()}`;
}

export function parseDocumentoVerificacaoSearch(search: string): DocumentoVerificacaoDados | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const tipo = (params.get('t') || '').trim().toUpperCase();
  const codigo = (params.get('c') || '').trim();
  const emitidoEm = (params.get('e') || '').trim();
  const versaoDoc = (params.get('v') || '').trim().replace(/^v/i, '');
  if (!TIPOS.has(tipo) || !codigo) return null;
  return {
    tipo: tipo as TipoDocControle,
    codigo,
    emitidoEm: emitidoEm || '—',
    versaoDoc: versaoDoc || '0',
  };
}

/** Aceita payload legado `ISO-PRO|RIR|codigo|emitido|v7` (QR antigos). */
export function parseDocumentoVerificacaoPayloadLegado(texto: string): DocumentoVerificacaoDados | null {
  const parts = texto.trim().split('|');
  if (parts.length < 4 || parts[0] !== 'ISO-PRO') return null;
  const tipo = parts[1].trim().toUpperCase();
  if (!TIPOS.has(tipo)) return null;
  const codigo = parts[2].trim();
  if (!codigo) return null;
  const emitidoEm = (parts[3] || '').trim() || '—';
  const versaoDoc = (parts[4] || '0').trim().replace(/^v/i, '') || '0';
  return { tipo: tipo as TipoDocControle, codigo, emitidoEm, versaoDoc };
}

export function formatarEmitidoVerificacao(isoOuTexto: string): string {
  const t = isoOuTexto.trim();
  if (!t || t === '—') return '—';
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) return t;
  return new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
