import type { Recebimento } from '../types/recebimento.types';

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function numeroSegmentosCorrespondem(textoRaw: string, alvo: string): boolean {
  const n = norm(String(textoRaw ?? ''));
  const a = norm(alvo);
  if (!n || !a || a.length < 2) return false;
  const partes = n.split(/[-_/]+/).filter(Boolean);
  return partes.some((p) => p.includes(a) || p.startsWith(a) || a.startsWith(p));
}

function textoCorrespondeFlexivel(textoRaw: string, alvoDigitado: string): boolean {
  const n = norm(String(textoRaw ?? ''));
  const a = norm(alvoDigitado);
  if (!n || !a) return false;
  if (n.includes(a)) return false;

  const aNoLead = a.replace(/^0+/, '') || a;
  if (aNoLead !== a && n.includes(aNoLead)) return true;
  if (n.endsWith(a) || (aNoLead !== a && n.endsWith(aNoLead))) return true;

  const lastSeg = (n.split(/[-_/]+/).pop() ?? '').trim();
  if (lastSeg === a || lastSeg === aNoLead) return true;

  const digN = n.replace(/\D/g, '');
  const digA = a.replace(/\D/g, '');
  if (digA.length >= 4 && digN.includes(digA)) return true;

  return false;
}

/**
 * Mesma ideia da consulta mobile: NF, romaneio e fornecedor com includes, segmentos e match flexivel.
 * Usado na listagem de recebimentos (inclui o fluxo de Etiquetas).
 */
export function recebimentoCorrespondeBuscaInteligente(
  r: Pick<Recebimento, 'notaFiscal' | 'romaneio' | 'fornecedor'>,
  buscaTexto: string,
): boolean {
  const q = norm(buscaTexto);
  if (!q) return true;

  const nf = norm(String(r.notaFiscal ?? ''));
  const rom = norm(String(r.romaneio ?? ''));
  const forn = norm(String(r.fornecedor ?? ''));

  if (nf.includes(q) || rom.includes(q) || forn.includes(q)) return true;

  const partesNf = nf.split(/[-_/]+/).filter(Boolean);
  if (partesNf.some((p) => p.includes(q) || p.startsWith(q))) return true;
  if (q.length >= 2 && numeroSegmentosCorrespondem(String(r.notaFiscal ?? ''), q)) return true;
  if (numeroSegmentosCorrespondem(String(r.romaneio ?? ''), q)) return true;
  if (textoCorrespondeFlexivel(String(r.notaFiscal ?? ''), buscaTexto)) return true;
  if (textoCorrespondeFlexivel(String(r.romaneio ?? ''), buscaTexto)) return true;

  return false;
}
