import QRCode from 'qrcode';
import { urlVerificacaoDocumentoControle } from './documentoVerificacao';
import { escapeHtmlRelatorio } from './htmlRelatorioInstitucional';

export type TipoDocControle = 'RIR' | 'RNC' | 'RF' | 'RECIBO' | 'RFO';

export type RodapeInstitucionalControleOpts = {
  /** Razão social / nome no rodapé (config). */
  nomeEmpresa: string;
  /** CNPJ (config). */
  cnpj: string;
  /** Código do documento (RIR-…, RF-…, etc.). */
  codigo: string;
  /** Versão do template HTML (ex.: 7). */
  versaoDoc: string;
  /** Data URL do QR (opcional). */
  qrDataUrl?: string;
  /** Texto extra curto (ex.: «assinaturas na última página»). */
  extra?: string;
};

/**
 * Conteúdo do QR: URL da página pública de verificação.
 * (Payload legado ISO-PRO|… ainda é aceite na página /verificar.)
 */
export function payloadQrDocumentoControle(opts: {
  tipo: TipoDocControle;
  codigo: string;
  emitidoEm?: string;
  versaoDoc?: string;
}): string {
  return urlVerificacaoDocumentoControle(opts);
}

export async function dataUrlQrDocumentoControle(
  opts: Parameters<typeof payloadQrDocumentoControle>[0],
  widthPx = 64,
): Promise<string> {
  const texto = payloadQrDocumentoControle(opts);
  return QRCode.toDataURL(texto, {
    width: widthPx,
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#1c1917', light: '#ffffff' },
  });
}

/** Linha institucional: Empresa · CNPJ · código · vN (sem «Desktop» / URL). */
export function linhaRodapeInstitucionalControle(opts: {
  nomeEmpresa: string;
  cnpj: string;
  codigo: string;
  versaoDoc: string;
}): string {
  const parts: string[] = ['I.S.O PRO'];
  const nome = opts.nomeEmpresa.trim();
  const cnpj = opts.cnpj.trim();
  if (nome) parts.push(nome);
  if (cnpj) parts.push(`CNPJ ${cnpj}`);
  const codigo = opts.codigo.trim();
  if (codigo) parts.push(codigo);
  const ver = String(opts.versaoDoc).trim();
  if (ver) parts.push(`v${ver}`);
  return parts.join(' · ');
}

/**
 * Rodapé de documento controlado: QR + carimbo + linha institucional.
 */
export function htmlRodapeInstitucionalControle(opts: RodapeInstitucionalControleOpts): string {
  const linha = linhaRodapeInstitucionalControle(opts);
  const extra = opts.extra?.trim()
    ? `<span class="iso-doc-foot__extra">${escapeHtmlRelatorio(opts.extra.trim())}</span>`
    : '';
  const qr = opts.qrDataUrl
    ? `<img class="iso-doc-foot__qr" src="${opts.qrDataUrl}" width="56" height="56" alt="" />`
    : '';
  return `<div class="iso-doc-foot" role="contentinfo">
  ${qr ? `<div class="iso-doc-foot__qr-wrap">${qr}</div>` : ''}
  <div class="iso-doc-foot__text">
    <div class="iso-doc-foot__stamp">Documento controlado</div>
    <div class="iso-doc-foot__line">${escapeHtmlRelatorio(linha)}</div>
    <span class="iso-doc-foot__extra">Leia o QR para verificar este documento no I.S.O PRO.</span>
    ${extra}
  </div>
</div>`;
}

export function cssRodapeInstitucionalControle(): string {
  return `
.iso-doc-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #e7e5e4;
  page-break-inside: avoid;
  break-inside: avoid;
}
.iso-doc-foot__qr-wrap {
  flex: 0 0 auto;
  line-height: 0;
  border: 1px solid #e7e5e4;
  padding: 2px;
  background: #fff;
}
.iso-doc-foot__qr {
  display: block;
  width: 56px;
  height: 56px;
}
.iso-doc-foot__text {
  flex: 1 1 auto;
  min-width: 0;
}
.iso-doc-foot__stamp {
  font-size: 6.5pt;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #047857;
  margin-bottom: 2px;
}
.iso-doc-foot__line {
  font-size: 6.5pt;
  color: #78716c;
  line-height: 1.35;
  letter-spacing: 0.02em;
}
.iso-doc-foot__extra {
  display: block;
  margin-top: 2px;
  font-size: 6pt;
  color: #a8a29e;
}
`;
}
