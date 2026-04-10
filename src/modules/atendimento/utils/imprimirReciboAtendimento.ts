import { abrirImpressaoHtmlRelatorio, cssInstitucionalRelatorio, escapeHtmlRelatorio, htmlBlocoLogoInstitucional } from '../../../lib/htmlRelatorioInstitucional';
import { resolverUrlLogoInstitucional, resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import type { Atendimento, DadosReciboAtendimento } from '../types/atendimento.types';

/** @deprecated Use LEGACY_LOGO_STORAGE_KEY em `logoInstitucional.ts`. Mantido para compatibilidade de import. */
export { LEGACY_LOGO_STORAGE_KEY as RECIBO_LOGO_STORAGE_KEY } from '../../../lib/logoInstitucional';

function totalQuantidadeItens(at: Atendimento): number {
  return at.itens.reduce((acc, it) => acc + (Number(it.quantidadeAtendida) || 0), 0);
}

/** Resolve URL do logo: campo explicito no objeto > Configuracoes > localStorage legado. */
export function resolverUrlLogoRecibo(dados: DadosReciboAtendimento): string {
  return resolverUrlLogoInstitucional(dados.logoUrl);
}

export function montarHtmlRecibo(dados: DadosReciboAtendimento): string {
  const at = dados.atendimento;
  const logoUrl = resolverUrlLogoInstitucionalParaHtmlImpresso(dados.logoUrl);
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const dataFmt = (() => {
    try {
      return new Date(at.dataAtendimento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return at.dataAtendimento;
    }
  })();

  const docTitulo = `${escapeHtmlRelatorio(at.documentoNumero)} Rev. ${escapeHtmlRelatorio(dados.documentoRevisao)}`;

  const blocoExterno = dados.detalhesRetiradaExterna
    ? `
    <section class="bloco">
      <h2>Dados do retirante (externo)</h2>
      <p><strong>Documento (ID):</strong> ${escapeHtmlRelatorio(dados.detalhesRetiradaExterna.documentoIdentificacao)}</p>
      <p><strong>Telefone:</strong> ${escapeHtmlRelatorio(dados.detalhesRetiradaExterna.telefone)}</p>
      <p><strong>Autorizador interno:</strong> ${escapeHtmlRelatorio(dados.detalhesRetiradaExterna.autorizadorInterno)}</p>
      <p><strong>Motivo da retirada:</strong> ${escapeHtmlRelatorio(dados.detalhesRetiradaExterna.motivoRetirada)}</p>
    </section>`
    : `
    <section class="bloco">
      <h2>Retirada interna</h2>
      <p>Material retirado por colaborador cadastrado (identificacao vinculada ao registro do atendimento).</p>
    </section>`;

  const linhasHtml = at.itens
    .map(
      (it, idx) =>
        `<tr>
          <td>${idx + 1}</td>
          <td>${escapeHtmlRelatorio(it.codigoMaterial)}</td>
          <td>${escapeHtmlRelatorio(it.descricaoMaterial)}</td>
          <td>${escapeHtmlRelatorio(it.unidade)}</td>
          <td class="num">${escapeHtmlRelatorio(String(it.quantidadeAtendida))}</td>
        </tr>`,
    )
    .join('');

  const total = totalQuantidadeItens(at);

  const extraRecibo = `
    body.recibo-body { padding: 0; color: #0f172a; }
    @media screen {
      body.recibo-body {
        background: linear-gradient(165deg, #dbeafe 0%, #e8eef5 40%, #f1f5f9 100%);
        min-height: 100vh;
        padding: 20px 14px 48px;
      }
      .recibo-sheet {
        max-width: 880px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 14px;
        box-shadow: 0 12px 40px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.06);
        padding: 28px 32px 36px;
        border: 1px solid rgba(148, 163, 184, 0.45);
      }
    }
    @media print {
      body.recibo-body { background: #fff !important; padding: 0 !important; }
      .recibo-sheet {
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        max-width: none !important;
        padding: 8px 0 0 !important;
        margin: 0 !important;
      }
    }
    .recibo-topbar.inst-topbar {
      margin-bottom: 22px;
      padding: 11px 16px;
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      border-radius: 10px;
      border: 1px solid #e2e8f0;
      font-size: 9.5pt;
      color: #64748b;
    }
    .recibo-topbar.inst-topbar span:last-child { color: #0f172a; font-weight: 600; }
    .recibo-logo-wrap .inst-logo-img {
      border-radius: 10px;
      padding: 10px;
      background: #fafafa;
      border: 1px solid #e2e8f0;
      box-sizing: content-box;
    }
    .recibo-logo-wrap .inst-logo-placeholder {
      border-radius: 10px;
      border-color: #cbd5e1;
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    }
    .recibo-header-main {
      display: flex;
      gap: 22px;
      align-items: flex-start;
      margin-bottom: 22px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e2e8f0;
    }
    .recibo-header-main .inst-title-col h1 {
      font-size: 1.45rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      color: #0f172a;
      margin: 0;
      padding: 0;
      border-bottom: none;
      line-height: 1.25;
    }
    .recibo-header-main .inst-title-col h1::after {
      content: '';
      display: block;
      margin-top: 12px;
      height: 3px;
      width: 64px;
      background: linear-gradient(90deg, #0d9488, #2dd4bf);
      border-radius: 2px;
    }
    .recibo-bloco-info {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px 18px;
      margin-bottom: 18px;
    }
    .recibo-bloco-info .grid2 p { margin: 6px 0; font-size: 10.5pt; }
    .recibo-bloco-info .grid2 strong { color: #475569; font-weight: 600; }
    .recibo-doc-desc { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-size: 10.5pt; line-height: 1.45; color: #334155; }
    .bloco h2 {
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #64748b;
      margin: 0 0 10px;
    }
    .bloco:not(.recibo-bloco-itens) { margin-bottom: 18px; }
    .bloco:not(.recibo-bloco-itens) p { color: #334155; line-height: 1.5; }
    section.bloco:not(.recibo-bloco-info):not(.recibo-bloco-itens) {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 18px 16px;
      margin-bottom: 18px;
    }
    section.bloco:not(.recibo-bloco-info):not(.recibo-bloco-itens) h2 { margin-top: 0; }
    section.bloco:not(.recibo-bloco-info):not(.recibo-bloco-itens) p { margin: 8px 0 0; font-size: 10.5pt; color: #475569; }
    .recibo-bloco-itens table {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      font-size: 10pt;
    }
    .recibo-bloco-itens th {
      background: #f1f5f9 !important;
      color: #334155;
      font-weight: 600;
      border-color: #e2e8f0 !important;
      padding: 10px 10px !important;
    }
    .recibo-bloco-itens td {
      border-color: #e2e8f0 !important;
      padding: 9px 10px !important;
      vertical-align: top;
    }
    .recibo-bloco-itens tbody tr:nth-child(even) { background: #fafbfc; }
    .recibo-total-linha {
      margin-top: 14px;
      padding: 10px 14px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 8px;
      font-size: 10.5pt;
      color: #065f46;
    }
    .assinaturas { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; page-break-inside: avoid; }
    .assinatura-box { text-align: center; }
    .linha-ass { border-top: 1px solid #0f172a; margin: 48px 8px 8px; padding-top: 6px; }
    .rotulo-ass { font-weight: 700; font-size: 10pt; color: #334155; }
    .nome-ass { font-size: 10pt; margin-top: 4px; min-height: 1.2em; color: #0f172a; }
    @media print {
      .assinaturas { margin-top: 28px; }
      .recibo-bloco-itens tbody tr:nth-child(even) { background: transparent; }
      .recibo-total-linha { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Recibo ${escapeHtmlRelatorio(at.numero)}</title>
  <style>
    ${cssInstitucionalRelatorio()}
    ${extraRecibo}
  </style>
</head>
<body class="recibo-body">
  <div class="recibo-sheet">
  <div class="inst-topbar recibo-topbar">
    <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
    <span>Recibo ${escapeHtmlRelatorio(at.numero)}</span>
  </div>

  <header class="recibo-header-main">
    <div class="recibo-logo-wrap">${htmlBlocoLogoInstitucional(logoUrl)}</div>
    <div class="inst-title-col">
      <h1>Recibo de retirada de material</h1>
    </div>
  </header>

  <section class="bloco recibo-bloco-info">
    <div class="grid2">
      <p><strong>Lote / atendimento:</strong> ${escapeHtmlRelatorio(at.numero)}</p>
      <p><strong>Data e hora:</strong> ${escapeHtmlRelatorio(dataFmt)}</p>
      <p><strong>Documento:</strong> ${docTitulo}</p>
      <p><strong>Responsavel (documento):</strong> ${escapeHtmlRelatorio(dados.documentoResponsavel || '-')}</p>
    </div>
    <div class="recibo-doc-desc">
      <strong>Descricao do documento</strong>
      <p style="margin: 6px 0 0">${escapeHtmlRelatorio(dados.documentoDescricao || '-')}</p>
    </div>
  </section>

  ${blocoExterno}

  <section class="bloco recibo-bloco-itens">
    <h2>Itens desta retirada</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Codigo</th>
          <th>Descricao do material</th>
          <th>UN</th>
          <th>Quantidade</th>
        </tr>
      </thead>
      <tbody>${linhasHtml}</tbody>
    </table>
    <div class="recibo-total-linha"><strong>Total de unidades (esta operacao):</strong> ${escapeHtmlRelatorio(String(total))}</div>
  </section>

  <section class="assinaturas">
    <div class="assinatura-box">
      <div class="linha-ass"></div>
      <p class="rotulo-ass">Atendente (operador)</p>
      <p class="nome-ass">${escapeHtmlRelatorio(at.atendente)}</p>
    </div>
    <div class="assinatura-box">
      <div class="linha-ass"></div>
      <p class="rotulo-ass">Atendido (quem retirou)</p>
      <p class="nome-ass">${escapeHtmlRelatorio(dados.nomeAtendido)}</p>
    </div>
  </section>
  </div>
</body>
</html>`;
}

/**
 * Abre o recibo em nova janela e dispara a impressao.
 * Usa URL de objeto (blob) em vez de document.write para evitar pagina em branco (ex.: noopener / CSP).
 */
/** URL blob para iframe de visualizacao (revogar com URL.revokeObjectURL ao fechar). */
export function criarBlobUrlVisualizacaoRecibo(dados: DadosReciboAtendimento): string {
  const html = montarHtmlRecibo(dados);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  return URL.createObjectURL(blob);
}

/** @returns false se o navegador bloqueou a nova janela (popup). */
export function imprimirReciboAtendimento(dados: DadosReciboAtendimento): boolean {
  return abrirImpressaoHtmlRelatorio(montarHtmlRecibo(dados));
}
