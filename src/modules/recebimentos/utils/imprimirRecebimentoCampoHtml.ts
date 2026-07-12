import {
  imprimirRelatorioProfissional,
  nomeArquivoRelatorioPdf,
  preVisualizarRelatorioProfissional,
} from '../../../lib/relatorioProfissional';
import {
  cssBarraPreVisualizacaoImpressaoHtml,
  cssInstitucionalRelatorio,
  escapeHtmlRelatorio,
  htmlBarraPreVisualizacaoImpressao,
  htmlBlocoLogoInstitucional,
  scriptBarraPreVisualizacaoImpressao,
} from '../../../lib/htmlRelatorioInstitucional';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import { formatarDataDocumentoPtBr } from '../../documentos/utils/formatarDataDocumento';
import { cssFolhaCampoV2 } from '../../documentos/utils/imprimirPlanejamentoCampoHtml';
import type { Recebimento, RecebimentoFormData } from '../types/recebimento.types';
import { textoModoRecebimentoListagem } from './modoRecebimentoExibicao';

export type RecebimentoCampoRelatorioInput = RecebimentoFormData & {
  status: Recebimento['status'];
  dataConferencia?: string;
};

function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function labelStatusRecebimento(status: Recebimento['status']): string {
  if (status === 'conferido') return 'Conferido';
  if (status === 'aguardando_conferencia') return 'Aguardando conferencia';
  if (status === 'parcialmente_conferido') return 'Parcialmente conferido';
  if (status === 'divergente') return 'Divergente';
  if (status === 'cancelado') return 'Cancelado';
  if (status === 'rascunho') return 'Rascunho';
  return status;
}

function badgeStatusRecebimentoClass(status: Recebimento['status']): string {
  if (status === 'conferido') return 'fc-pill fc-pill-doc fc-pill-doc--ok';
  if (status === 'aguardando_conferencia' || status === 'parcialmente_conferido') {
    return 'fc-pill fc-pill-doc fc-pill-doc--warn';
  }
  if (status === 'divergente') return 'fc-pill fc-pill-doc fc-pill-doc--warn';
  if (status === 'cancelado') return 'fc-pill fc-pill-doc fc-pill-doc--muted';
  return 'fc-pill fc-pill-doc fc-pill-doc--pend';
}

type LinhaStatus = 'conferido' | 'parcial' | 'pendente' | 'recebido';

function quantidadeConferidaParaRelatorio(
  rec: RecebimentoCampoRelatorioInput,
  qReceb: number,
  qConf: number,
): number {
  if (rec.modoRecebimento === 'direto') {
    return qReceb;
  }
  return qConf;
}

function statusLinhaItem(rec: RecebimentoCampoRelatorioInput, qReceb: number, qConf: number): LinhaStatus {
  if (rec.modoRecebimento === 'direto') {
    return qReceb > 0 ? 'recebido' : 'pendente';
  }
  const qEfetiva = quantidadeConferidaParaRelatorio(rec, qReceb, qConf);
  if (qReceb <= 0) return qEfetiva > 0 ? 'parcial' : 'pendente';
  if (qEfetiva + 1e-9 >= qReceb) return 'conferido';
  if (qEfetiva > 0) return 'parcial';
  return 'pendente';
}

function badgeLinhaRecebimentoHtml(st: LinhaStatus): string {
  if (st === 'recebido') {
    return `<span class="fc-pill fc-pill-linha fc-pill-linha--ok" role="status"><span class="fc-pill-ic" aria-hidden="true">&#10003;</span>Recebido</span>`;
  }
  if (st === 'conferido') {
    return `<span class="fc-pill fc-pill-linha fc-pill-linha--ok" role="status"><span class="fc-pill-ic" aria-hidden="true">&#10003;</span>Conferido</span>`;
  }
  if (st === 'parcial') {
    return `<span class="fc-pill fc-pill-linha fc-pill-linha--warn" role="status"><span class="fc-pill-ic" aria-hidden="true">&#9680;</span>Parcial</span>`;
  }
  return `<span class="fc-pill fc-pill-linha fc-pill-linha--pend" role="status"><span class="fc-pill-ic" aria-hidden="true">&#9675;</span>Pendente</span>`;
}

function htmlCabecalhoColunasRecebimento(mostrarConferencia: boolean): string {
  const cls = mostrarConferencia ? ' fc-rec-table-head--conf' : '';
  return `<div class="fc-rec-table-head${cls}" role="row">
    <span>#</span>
    <span>Codigo</span>
    <span>Descricao</span>
    <span>Localizacao</span>
    <span class="fc-rec-th fc-rec-th--um">UM</span>
    <span class="fc-rec-th fc-rec-th--qtd">Qtd rec.</span>
    ${mostrarConferencia ? '<span>Qtd conferida</span>' : ''}
    <span>Certificado</span>
    ${mostrarConferencia ? '<span>Situacao conferencia</span>' : '<span>Situacao</span>'}
  </div>`;
}

function tituloRecebimento(rec: RecebimentoCampoRelatorioInput): string {
  const nf = rec.notaFiscal.trim();
  const rom = rec.romaneio.trim();
  if (nf && rom) return `${nf} · ${rom}`;
  return nf || rom || 'Recebimento';
}

function slugArquivo(rec: RecebimentoCampoRelatorioInput): string {
  const nf = rec.notaFiscal.trim();
  const rom = rec.romaneio.trim();
  return nf || rom || rec.fornecedor.trim() || 'recebimento';
}

function locCell(raw: string | undefined): string {
  const t = (raw ?? '').trim();
  if (!t) return '—';
  return escapeHtmlRelatorio(t).replace(/\n/g, '<br>');
}

export function montarHtmlRecebimentoCampo(rec: RecebimentoCampoRelatorioInput): string {
  const logoUrl = resolverUrlLogoInstitucionalParaHtmlImpresso();
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const tituloDoc = tituloRecebimento(rec);
  const modoLabel = textoModoRecebimentoListagem(rec.modoRecebimento, rec.status, rec.dataConferencia);

  const observacaoBloco = rec.observacoes?.trim()
    ? `<section class="bloco fc-obs"><h2>Observacoes do recebimento</h2><p class="fc-obs-text">${escapeHtmlRelatorio(rec.observacoes)}</p></section>`
    : '';

  const mostrarConferencia = rec.modoRecebimento === 'aguardando_conferencia';

  const linhasHtml =
    rec.itens.length === 0
      ? '<p class="fc-footnote">Nenhum item neste recebimento.</p>'
      : `${htmlCabecalhoColunasRecebimento(mostrarConferencia)}${rec.itens
          .map((it, idx) => {
            const qReceb = Number(it.quantidadeRecebida) || 0;
            const qConf = Number(it.quantidadeConferida) || 0;
            const qConfExib = quantidadeConferidaParaRelatorio(rec, qReceb, qConf);
            const st = statusLinhaItem(rec, qReceb, qConf);
            const clsConf =
              qReceb > 0 && qConfExib + 1e-9 >= qReceb
                ? 'fc-qbox-v fc-qbox-v--ok'
                : qConfExib <= 0 && qReceb > 0 && mostrarConferencia
                  ? 'fc-qbox-v fc-qbox-v--zero'
                  : 'fc-qbox-v';
            const cert = (it.certificado ?? '').trim() || '—';
            const disc = (it.disciplina ?? '').trim();
            const discHtml = disc
              ? `<div class="fc-item-desc" style="margin-top:3px;font-size:7.8pt;color:#64748b;">Disciplina: ${escapeHtmlRelatorio(disc)}</div>`
              : '';
            const colConf = mostrarConferencia
              ? `<div class="fc-rec-qtd"><span class="fc-rec-qtd-v ${clsConf}">${escapeHtmlRelatorio(fmtQty(qConfExib))}</span></div>`
              : '';
            return `<article class="fc-item fc-item--rec${mostrarConferencia ? ' fc-item--rec-conf' : ''}" role="row">
          <div class="fc-item-num" aria-label="Linha">${idx + 1}</div>
          <div><span class="fc-pill fc-pill-code">${escapeHtmlRelatorio(it.codigoMaterial)}</span></div>
          <div class="fc-item-desc">${escapeHtmlRelatorio(it.descricaoMaterial)}${discHtml}</div>
          <div><span class="fc-pill fc-pill-loc">${locCell(it.localizacao)}</span></div>
          <div class="fc-item-um">${escapeHtmlRelatorio(it.unidade || '—')}</div>
          <div class="fc-rec-qtd"><span class="fc-rec-qtd-v">${escapeHtmlRelatorio(fmtQty(qReceb))}</span></div>
          ${colConf}
          <div><span class="fc-pill fc-pill-cert">${escapeHtmlRelatorio(cert)}</span></div>
          <div style="padding-top:0;">${badgeLinhaRecebimentoHtml(st)}</div>
        </article>`;
          })
          .join('')}`;

  const extra = `
    @page { size: A4 landscape; margin: 6mm 8mm; }
    ${cssFolhaCampoV2()}
    .fc-item--rec {
      grid-template-columns: 28px minmax(88px, 0.78fr) minmax(120px, 1.18fr) minmax(72px, 0.62fr) 44px 62px minmax(72px, 0.68fr) minmax(88px, 0.62fr);
      gap: 6px 10px;
    }
    .fc-item--rec.fc-item--rec-conf {
      grid-template-columns: 28px minmax(84px, 0.72fr) minmax(110px, 1.05fr) minmax(68px, 0.55fr) 44px 56px 56px minmax(68px, 0.55fr) minmax(84px, 0.58fr);
    }
    .fc-rec-table-head {
      display: grid;
      grid-template-columns: 28px minmax(88px, 0.78fr) minmax(120px, 1.18fr) minmax(72px, 0.62fr) 44px 62px minmax(72px, 0.68fr) minmax(88px, 0.62fr);
      gap: 6px 10px;
      align-items: end;
      padding: 0 9px 4px;
      margin-bottom: 2px;
      border-bottom: 1px solid #bae6fd;
      font-size: 6.85pt;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #0369a1;
    }
    .fc-rec-table-head.fc-rec-table-head--conf {
      grid-template-columns: 28px minmax(84px, 0.72fr) minmax(110px, 1.05fr) minmax(68px, 0.55fr) 44px 56px 56px minmax(68px, 0.55fr) minmax(84px, 0.58fr);
    }
    .fc-rec-th--um,
    .fc-rec-th--qtd {
      text-align: center;
      white-space: nowrap;
      justify-self: center;
    }
    .fc-item--rec .fc-item-um {
      min-width: 0;
      max-width: 100%;
      justify-self: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .fc-item--rec .fc-rec-qtd {
      min-width: 0;
      max-width: 100%;
      justify-self: center;
    }
    .fc-rec-qtd { text-align: center; }
    .fc-rec-qtd-v {
      display: inline-block;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      padding: 2px 6px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 9pt;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: #0f172a;
      background: #fff;
    }
    .fc-rec-qtd-v.fc-qbox-v--ok { color: #047857; border-color: #6ee7b7; }
    .fc-rec-qtd-v.fc-qbox-v--zero { color: #b45309; border-color: #fdba74; }
    .fc-pill-cert {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #0f172a;
      font-size: 7.8pt;
      font-family: ui-monospace, Consolas, monospace;
      white-space: normal;
      word-break: break-word;
    }
    .fc-meta-grid--rec {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtmlRelatorio(tituloDoc)} — Recebimento</title>
  <style>${cssInstitucionalRelatorio()}${cssBarraPreVisualizacaoImpressaoHtml()}${extra}</style>
</head>
<body class="folha-campo-v2">
  ${htmlBarraPreVisualizacaoImpressao()}
  <div class="inst-topbar">
    <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
    <span>Folha de campo — recebimento / conferencia</span>
  </div>
  <header class="inst-header">
    ${htmlBlocoLogoInstitucional(logoUrl, true)}
    <div class="inst-title-col">
      <h1>${escapeHtmlRelatorio(tituloDoc)}</h1>
      <p class="fc-doc-kicker">Itens da nota fiscal para conferencia no campo</p>
      <p class="fc-doc-desc">${escapeHtmlRelatorio(rec.fornecedor || 'Sem fornecedor.')}</p>
    </div>
  </header>

  <section class="bloco">
    <div class="fc-meta-grid fc-meta-grid--rec">
      <div class="fc-meta-card">
        <span class="fc-meta-k">Nota fiscal</span>
        <span class="fc-meta-v">${escapeHtmlRelatorio(rec.notaFiscal.trim() || '—')}</span>
      </div>
      <div class="fc-meta-card">
        <span class="fc-meta-k">Romaneio</span>
        <span class="fc-meta-v">${escapeHtmlRelatorio(rec.romaneio.trim() || '—')}</span>
      </div>
      <div class="fc-meta-card">
        <span class="fc-meta-k">Fornecedor</span>
        <span class="fc-meta-v">${escapeHtmlRelatorio(rec.fornecedor.trim() || '—')}</span>
      </div>
      <div class="fc-meta-card">
        <span class="fc-meta-k">Conferente</span>
        <span class="fc-meta-v">${escapeHtmlRelatorio(rec.conferente.trim() || '—')}</span>
      </div>
      <div class="fc-meta-card">
        <span class="fc-meta-k">Data do recebimento</span>
        <span class="fc-meta-v">${escapeHtmlRelatorio(formatarDataDocumentoPtBr(rec.dataRecebimento))}</span>
      </div>
      <div class="fc-meta-card">
        <span class="fc-meta-k">Modo</span>
        <span class="fc-meta-v">${escapeHtmlRelatorio(modoLabel)}</span>
      </div>
      <div class="fc-meta-card">
        <span class="fc-meta-k">Status</span>
        <span class="${badgeStatusRecebimentoClass(rec.status)}">${escapeHtmlRelatorio(labelStatusRecebimento(rec.status))}</span>
      </div>
      <div class="fc-meta-card">
        <span class="fc-meta-k">Total de itens</span>
        <span class="fc-meta-v">${rec.itens.length}</span>
      </div>
    </div>
  </section>
  ${observacaoBloco}
  <section class="bloco">
    <h2 class="fc-section-title">Lista de materiais</h2>
    <div class="fc-item-list">
      ${linhasHtml}
    </div>
    <div class="fc-footnote">
      <strong>Colunas:</strong> Codigo, descricao, localizacao de estoque, unidade (UM), quantidade recebida na NF, certificado do material.
      ${
        mostrarConferencia
          ? `«Qtd conferida» = quantidade efectivamente conferida. «Pendente» = linha ainda sem conferencia registada (0 ou inferior ao recebido). «Parcial» = conferiu menos do que a NF. «Conferido» = quantidade conferida igual ou superior ao recebido.`
          : `Modo direto: entrada ja considerada recebida; «Recebido» indica linha com quantidade na NF (nao exige coluna de conferencia separada).`
      }
      Em caso de divergencia com o ecra, prevalece o registo na base apos sincronizacao.
    </div>
  </section>
  ${scriptBarraPreVisualizacaoImpressao()}
</body>
</html>`;
}

export async function imprimirRecebimentoCampoHtml(rec: RecebimentoCampoRelatorioInput): Promise<boolean> {
  const html = montarHtmlRecebimentoCampo(rec);
  const fileName = nomeArquivoRelatorioPdf(slugArquivo(rec), 'recebimento');
  const titulo = `Recebimento — ${tituloRecebimento(rec)}`;
  return imprimirRelatorioProfissional({ html, fileName, titulo });
}

export async function preVisualizarRecebimentoCampoHtml(
  rec: RecebimentoCampoRelatorioInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const html = montarHtmlRecebimentoCampo(rec);
  const fileName = nomeArquivoRelatorioPdf(slugArquivo(rec), 'recebimento');
  const titulo = `Recebimento — ${tituloRecebimento(rec)}`;
  return preVisualizarRelatorioProfissional({ html, fileName, titulo });
}
