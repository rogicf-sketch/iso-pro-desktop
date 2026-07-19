import {
  cssBarraPreVisualizacaoImpressaoHtml,
  cssInstitucionalRelatorio,
  escapeHtmlRelatorio,
  htmlBarraPreVisualizacaoImpressao,
  htmlBlocoLogoInstitucional,
  scriptBarraPreVisualizacaoImpressao,
  segmentoInstituicaoRodapeEletronico,
} from '../../../lib/htmlRelatorioInstitucional';
import {
  guardarRelatorioProfissional,
  imprimirRelatorioProfissional,
  nomeArquivoRelatorioPdf,
} from '../../../lib/relatorioProfissional';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { resolverUrlLogoInstitucional, resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import type { Atendimento, DadosReciboAtendimento, DadosReciboSessaoConsolidada } from '../types/atendimento.types';

function totalQuantidadeItens(at: Atendimento): number {
  return at.itens.reduce((acc, it) => acc + (Number(it.quantidadeAtendida) || 0), 0);
}

function textoReciboOuEmDash(v: string | undefined): string {
  const t = (v ?? '').trim();
  return t || '—';
}

/** Evita duplicar matrícula na linha «Nome» quando o campo atendente veio do autocomplete «Nome - matrícula». */
function nomeExibicaoAtendenteAssinatura(at: Atendimento): string {
  const full = at.atendente.trim();
  const m = (at.atendenteMatricula ?? '').trim();
  if (m && full.endsWith(` - ${m}`)) return full.slice(0, full.length - m.length - 3).trim();
  return full;
}

/** Uma linha secundária: matrícula e função (evita três rótulos «Nome / Matrícula / Função»). */
function linhaMatriculaFuncaoAssinatura(mat: string | undefined, funcao: string | undefined): string {
  const m = (mat ?? '').trim();
  const f = (funcao ?? '').trim();
  const mOk = m && m !== '—';
  const fOk = f && f !== '—';
  if (!mOk && !fOk) return '—';
  const partes: string[] = [];
  if (mOk) partes.push(`Mat. ${m}`);
  if (fOk) partes.push(f);
  return partes.join(' · ');
}

/** Resolve URL do logo: campo explicito no objeto > Configuracoes > localStorage legado. */
export function resolverUrlLogoRecibo(dados: DadosReciboAtendimento): string {
  return resolverUrlLogoInstitucional(dados.logoUrl);
}

/** Badge / bloco compacto do tipo de retirada (auditoria). */
function htmlBlocoTipoRetirada(
  dados: Pick<DadosReciboAtendimento, 'detalhesRetiradaExterna'>,
): string {
  if (dados.detalhesRetiradaExterna) {
    const e = dados.detalhesRetiradaExterna;
    return `
    <section class="bloco recibo-bloco-tipo recibo-bloco-tipo--externa">
      <h2>Retirada externa</h2>
      <div class="grid2 recibo-grid-externo">
        ${e.empresa?.trim() ? `<p><strong>Empresa:</strong> ${escapeHtmlRelatorio(e.empresa)}</p>` : ''}
        <p><strong>Documento (ID):</strong> ${escapeHtmlRelatorio(e.documentoIdentificacao)}</p>
        <p><strong>Telefone:</strong> ${escapeHtmlRelatorio(e.telefone)}</p>
        <p><strong>Autorizador interno:</strong> ${escapeHtmlRelatorio(e.autorizadorInterno)}</p>
        <p><strong>Motivo da retirada:</strong> ${escapeHtmlRelatorio(e.motivoRetirada)}</p>
      </div>
    </section>`;
  }
  return `
    <p class="recibo-tipo-badge" role="note">
      <strong>Retirada interna</strong> — material entregue a colaborador cadastrado; identificacao vinculada ao registro deste atendimento (arquivo e auditoria).
    </p>`;
}

export function htmlAssinaturasRecibo(
  atendenteNome: string,
  atendenteMeta: string,
  atendidoNome: string,
  atendidoMeta: string,
  rotulos?: { atendente?: string; atendido?: string },
): string {
  const rotuloAt = rotulos?.atendente ?? 'Atendente (operador)';
  const rotuloRec = rotulos?.atendido ?? 'Atendido (quem retirou)';
  return `
  <section class="assinaturas" aria-label="Assinaturas">
    <div class="assinatura-box">
      <p class="rotulo-ass">${escapeHtmlRelatorio(rotuloAt)}</p>
      <div class="espaco-assinatura" aria-hidden="true"></div>
      <div class="linha-ass" aria-hidden="true"></div>
      <div class="bloco-ass-pessoa">
        <p class="ass-nome-principal">${escapeHtmlRelatorio(atendenteNome)}</p>
        <p class="ass-meta-linha">${escapeHtmlRelatorio(atendenteMeta)}</p>
      </div>
    </div>
    <div class="assinatura-box">
      <p class="rotulo-ass">${escapeHtmlRelatorio(rotuloRec)}</p>
      <div class="espaco-assinatura" aria-hidden="true"></div>
      <div class="linha-ass" aria-hidden="true"></div>
      <div class="bloco-ass-pessoa">
        <p class="ass-nome-principal">${escapeHtmlRelatorio(atendidoNome)}</p>
        <p class="ass-meta-linha">${escapeHtmlRelatorio(atendidoMeta)}</p>
      </div>
    </div>
  </section>`;
}

function htmlLinhaItemRecibo(
  idx: number,
  codigo: string,
  descricao: string,
  unidade: string,
  quantidade: number,
  documentoNumero?: string,
): string {
  const colDoc =
    documentoNumero != null && documentoNumero !== ''
      ? `<td class="col-doc">${escapeHtmlRelatorio(documentoNumero)}</td>`
      : '';
  return `<tr>
          <td class="col-num">${idx + 1}</td>${colDoc}
          <td class="col-codigo">${escapeHtmlRelatorio(codigo)}</td>
          <td class="col-desc">${escapeHtmlRelatorio(descricao)}</td>
          <td class="col-un">${escapeHtmlRelatorio(unidade)}</td>
          <td class="col-qtd">${escapeHtmlRelatorio(String(quantidade))}</td>
        </tr>`;
}

function reciboAtendimentoTemVariosDocumentos(at: Atendimento): boolean {
  const nums = new Set(
    at.itens.map((it) => String(it.documentoNumero ?? '').trim()).filter((n) => n && n !== '-'),
  );
  return nums.size > 1 || at.documentoNumero === 'MULTIPLOS';
}

export function montarHtmlRecibo(dados: DadosReciboAtendimento): string {
  const at = dados.atendimento;
  const logoUrl = resolverUrlLogoInstitucionalParaHtmlImpresso(dados.logoUrl);
  const cfgR = readConfiguracoes();
  const segRodapeInst = segmentoInstituicaoRodapeEletronico(cfgR.documentoRodapeNome, cfgR.documentoRodapeCnpj);
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const dataFmt = (() => {
    try {
      return new Date(at.dataAtendimento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return at.dataAtendimento;
    }
  })();

  const docTitulo =
    at.documentoNumero === 'MULTIPLOS' || reciboAtendimentoTemVariosDocumentos(at)
      ? 'Varios desenhos (ver coluna Documento)'
      : `${escapeHtmlRelatorio(at.documentoNumero)} Rev. ${escapeHtmlRelatorio(dados.documentoRevisao)}`;

  const blocoExterno = htmlBlocoTipoRetirada(dados);

  const mostrarColDoc = reciboAtendimentoTemVariosDocumentos(at);
  const linhasHtml = at.itens
    .map((it, idx) =>
      htmlLinhaItemRecibo(
        idx,
        it.codigoMaterial,
        it.descricaoMaterial,
        it.unidade,
        it.quantidadeAtendida,
        mostrarColDoc ? (it.documentoNumero?.trim() || at.documentoNumero || '—') : undefined,
      ),
    )
    .join('');

  const total = totalQuantidadeItens(at);
  // Compacto sempre na impressao (poucos itens tambem) — evita 2.a folha so com assinaturas.
  const classeDensidade = ' recibo-body--denso';

  const extraRecibo = cssReciboAtendimentoBase();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Recibo ${escapeHtmlRelatorio(at.numero)}</title>
  <style>
    ${cssInstitucionalRelatorio()}
    ${cssBarraPreVisualizacaoImpressaoHtml()}
    ${extraRecibo}
  </style>
</head>
<body class="recibo-body${classeDensidade}">
  ${htmlBarraPreVisualizacaoImpressao()}
  <div class="recibo-sheet">
  <div class="inst-topbar recibo-topbar">
    <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
    <span>Recibo ${escapeHtmlRelatorio(at.numero)}</span>
  </div>

  <header class="recibo-header-main recibo-header-main--titulo-centro">
    <div class="recibo-logo-wrap">${htmlBlocoLogoInstitucional(logoUrl)}</div>
    <div class="inst-title-col recibo-titulo-centro">
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
    <div class="recibo-tabela-wrap">
    <table class="recibo-tabela-itens">
      <thead>
        <tr>
          <th class="col-num">#</th>${mostrarColDoc ? '<th class="col-doc">Documento</th>' : ''}
          <th class="col-codigo">Codigo</th>
          <th class="col-desc">Descricao do material</th>
          <th class="col-un">UN</th>
          <th class="col-qtd">Qtd</th>
        </tr>
      </thead>
      <tbody>${linhasHtml}</tbody>
    </table>
    </div>
  </section>

  <div class="recibo-fechamento">
    <div class="recibo-total-linha"><strong>Total de unidades (esta operacao):</strong> ${escapeHtmlRelatorio(String(total))}</div>

  <div class="recibo-rodape-fin">
  ${htmlAssinaturasRecibo(
    nomeExibicaoAtendenteAssinatura(at),
    linhaMatriculaFuncaoAssinatura(textoReciboOuEmDash(at.atendenteMatricula), textoReciboOuEmDash(at.atendenteFuncao)),
    at.recebedor.trim() || dados.nomeAtendido.trim() || '—',
    linhaMatriculaFuncaoAssinatura(textoReciboOuEmDash(at.recebedorMatricula), textoReciboOuEmDash(at.recebedorFuncao)),
  )}
  <p class="recibo-doc-foot" role="contentinfo">Documento gerado eletronicamente pelo I.S.O PRO${segRodapeInst}. Conteudo para arquivo e auditoria. Referencia: ${escapeHtmlRelatorio(at.numero)}.</p>
  </div>
  </div>
  </div>
  ${scriptBarraPreVisualizacaoImpressao()}
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

/** Abre pré-visualização do recibo (aguarda geração do PDF). */
export async function imprimirReciboAtendimento(dados: DadosReciboAtendimento): Promise<boolean> {
  return imprimirRelatorioProfissional({
    html: montarHtmlRecibo(dados),
    fileName: nomeArquivoRelatorioPdf(dados.atendimento.numero, 'recibo'),
    titulo: `Recibo ${dados.atendimento.numero}`,
    tipoNuvem: 'recibo_atendimento',
  });
}

export async function guardarReciboAtendimentoPdf(
  dados: DadosReciboAtendimento,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return guardarRelatorioProfissional({
    html: montarHtmlRecibo(dados),
    fileName: nomeArquivoRelatorioPdf(dados.atendimento.numero, 'recibo'),
    tipoNuvem: 'recibo_atendimento',
  });
}

function totalQuantidadeSecao(at: Atendimento): number {
  return at.itens.reduce((acc, it) => acc + (Number(it.quantidadeAtendida) || 0), 0);
}

export function cssReciboAtendimentoBase(): string {
  return `
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
    @page {
      size: A4 portrait;
      margin: 7mm 9mm 8mm;
    }
    @media print {
      body.recibo-body { background: #fff !important; padding: 0 !important; }
      .recibo-sheet {
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        max-width: none !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .recibo-topbar {
        margin-bottom: 4px !important;
        padding: 3px 8px !important;
        font-size: 7.5pt !important;
      }
      .recibo-header-main {
        margin-bottom: 6px !important;
        padding-bottom: 6px !important;
        gap: 6px !important;
      }
      .recibo-header-main--titulo-centro {
        position: relative !important;
        display: block !important;
        min-height: 36px !important;
      }
      .recibo-header-main--titulo-centro .recibo-logo-wrap {
        position: relative !important;
        z-index: 2 !important;
        display: inline-block !important;
      }
      .recibo-header-main--titulo-centro .recibo-titulo-centro {
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        width: 100% !important;
        text-align: center !important;
        z-index: 1 !important;
      }
      .recibo-header-main--titulo-centro .recibo-titulo-centro h1 {
        font-size: 11.5pt !important;
        text-align: center !important;
        display: inline-block !important;
        max-width: 72% !important;
      }
      .recibo-header-main--titulo-centro .recibo-titulo-centro h1::after {
        margin-top: 4px !important;
        margin-left: auto !important;
        margin-right: auto !important;
        height: 2px !important;
        width: 40px !important;
      }
      .recibo-subtitulo-consolidado {
        font-size: 8pt !important;
        margin-top: 2px !important;
      }
      .recibo-logo-wrap .inst-logo-img {
        max-height: 32px !important;
        max-width: 96px !important;
        padding: 2px !important;
      }
      .recibo-bloco-info {
        padding: 6px 8px !important;
        margin-bottom: 4px !important;
      }
      .recibo-bloco-info .grid2 p,
      .recibo-doc-desc,
      .recibo-grid-externo p {
        font-size: 8pt !important;
        margin: 2px 0 !important;
      }
      .recibo-bloco-info .recibo-doc-desc {
        margin-top: 4px !important;
        padding-top: 4px !important;
      }
      .recibo-tipo-badge {
        margin: 0 0 4px !important;
        padding: 4px 8px !important;
        font-size: 7.5pt !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .recibo-bloco-tipo--externa {
        padding: 6px 8px !important;
        margin-bottom: 4px !important;
      }
      .bloco h2 { margin-bottom: 4px !important; font-size: 7pt !important; }
      .recibo-bloco-itens { margin-bottom: 4px !important; }
      .recibo-bloco-itens h2 { margin-bottom: 4px !important; }
      .recibo-tabela-wrap { margin-top: 2px !important; }
      .recibo-tabela-itens { font-size: 8pt !important; }
      .recibo-tabela-itens th,
      .recibo-tabela-itens td {
        padding: 3px 6px !important;
      }
      .recibo-tabela-itens thead th {
        padding: 4px 6px !important;
        font-size: 6.5pt !important;
      }
      .recibo-total-linha {
        margin-top: 4px !important;
        padding: 4px 8px !important;
        font-size: 8.5pt !important;
      }
      .recibo-total-geral {
        margin-top: 6px !important;
        padding: 5px 8px !important;
        font-size: 9pt !important;
      }
      .recibo-rodape-fin {
        page-break-inside: auto;
        break-inside: auto;
      }
      /* Nunca empurrar assinaturas sozinhas para a 2.a folha. */
      .recibo-fechamento {
        page-break-inside: auto;
        break-inside: auto;
        page-break-before: avoid;
      }
      .assinaturas {
        margin-top: 6px !important;
        gap: 10px !important;
        page-break-inside: auto;
        break-inside: auto;
      }
      .assinatura-box {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        text-align: center !important;
      }
      .linha-ass {
        margin: 0 0 2px !important;
        width: 88% !important;
        max-width: 260px !important;
      }
      .espaco-assinatura {
        width: 88% !important;
        max-width: 260px !important;
        min-height: 12px !important;
      }
      .rotulo-ass { margin: 0 0 1px !important; font-size: 7.5pt !important; text-align: center !important; width: 100%; }
      .ass-nome-principal { font-size: 9pt !important; margin: 0 0 1px !important; text-align: center !important; width: 100%; }
      .ass-meta-linha { font-size: 7.5pt !important; text-align: center !important; width: 100%; }
      .bloco-ass-pessoa {
        margin: 0 !important;
        width: 88% !important;
        max-width: 260px !important;
        text-align: center !important;
      }
      body.recibo-body--denso .recibo-tabela-itens { font-size: 7.5pt !important; }
      body.recibo-body--denso .recibo-tabela-itens th,
      body.recibo-body--denso .recibo-tabela-itens td {
        padding: 2px 5px !important;
      }
      body.recibo-body--denso .recibo-tabela-itens .col-desc { line-height: 1.2 !important; }
      body.recibo-body--denso .recibo-tabela-itens thead th { font-size: 6.5pt !important; padding: 3px 5px !important; }
      .recibo-doc-foot {
        margin-top: 4px !important;
        padding-top: 3px !important;
        font-size: 6.5pt !important;
      }
      .recibo-secao-doc {
        margin-top: 8px !important;
        padding-top: 6px !important;
      }
      .recibo-secao-doc:first-of-type {
        margin-top: 0 !important;
        padding-top: 0 !important;
      }
      .recibo-secao-meta {
        font-size: 8pt !important;
        margin: 0 0 4px !important;
      }
      .recibo-bloco-itens tbody tr:nth-child(even) { background: transparent !important; }
      .recibo-tabela-itens tbody tr:nth-child(even) { background: #f8fafc !important; }
      .recibo-total-linha,
      .recibo-total-geral,
      .recibo-bloco-info,
      .recibo-tipo-badge,
      .recibo-bloco-tipo--externa {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .recibo-secao-doc h2,
      .recibo-secao-meta,
      .recibo-secao-doc .recibo-total-linha {
        page-break-after: avoid;
      }
      .recibo-bloco-itens thead { display: table-header-group; }
      .recibo-tabela-itens tr { page-break-inside: avoid; }
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
    .recibo-header-main--titulo-centro {
      position: relative;
      display: block;
      min-height: 56px;
    }
    .recibo-header-main--titulo-centro .recibo-logo-wrap {
      position: relative;
      z-index: 2;
      display: inline-block;
      vertical-align: middle;
    }
    .recibo-header-main--titulo-centro .recibo-titulo-centro {
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 100%;
      text-align: center;
      pointer-events: none;
      z-index: 1;
    }
    .recibo-header-main--titulo-centro .recibo-titulo-centro h1 {
      display: inline-block;
      text-align: center;
      max-width: 72%;
    }
    .recibo-header-main--titulo-centro .recibo-titulo-centro h1::after {
      margin-left: auto;
      margin-right: auto;
    }
    .recibo-subtitulo-consolidado {
      margin: 8px 0 0;
      font-size: 11pt;
      color: #475569;
      text-align: center;
    }
    .recibo-header-main .inst-title-col h1,
    .recibo-header-main .recibo-titulo-centro h1 {
      font-size: 1.45rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      color: #0f172a;
      margin: 0;
      padding: 0;
      border-bottom: none;
      line-height: 1.25;
    }
    .recibo-header-main .inst-title-col h1::after,
    .recibo-header-main .recibo-titulo-centro h1::after {
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
    .recibo-doc-desc { margin: 10px 0 12px; font-size: 10.5pt; line-height: 1.45; color: #334155; }
    .recibo-bloco-info .recibo-doc-desc {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px dashed #cbd5e1;
    }
    .recibo-tipo-badge {
      margin: 0 0 16px;
      padding: 10px 14px;
      font-size: 10pt;
      line-height: 1.45;
      color: #334155;
      background: linear-gradient(90deg, #f0fdfa 0%, #f8fafc 100%);
      border: 1px solid #99f6e4;
      border-left: 4px solid #0d9488;
      border-radius: 8px;
    }
    .recibo-tipo-badge strong { color: #0f766e; font-weight: 700; }
    .recibo-bloco-tipo--externa {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 18px 16px;
      margin-bottom: 18px;
    }
    .recibo-grid-externo p { margin: 6px 0; font-size: 10.5pt; color: #334155; }
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
    .recibo-tabela-wrap {
      margin-top: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      background: #fff;
    }
    .recibo-tabela-itens {
      width: 100%;
      border-collapse: collapse;
      border: none !important;
      font-size: 10pt;
      margin-top: 0 !important;
    }
    .recibo-tabela-itens th,
    .recibo-tabela-itens td {
      border: none !important;
      padding: 10px 12px;
      text-align: left;
      vertical-align: top;
    }
    .recibo-tabela-itens thead th {
      background: linear-gradient(180deg, #f0fdfa 0%, #ecfdf5 100%) !important;
      border-bottom: 2px solid #0d9488 !important;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #0f766e !important;
      padding: 9px 12px;
    }
    .recibo-tabela-itens tbody td {
      border-bottom: 1px solid #eef2f6 !important;
      color: #334155;
    }
    .recibo-tabela-itens tbody tr:last-child td { border-bottom: none !important; }
    .recibo-tabela-itens tbody tr:nth-child(even) { background: #f8fafc; }
    .recibo-tabela-itens tbody tr:hover { background: #f0fdfa; }
    .recibo-tabela-itens .col-num {
      width: 32px;
      text-align: center;
      color: #94a3b8;
      font-size: 9pt;
      font-variant-numeric: tabular-nums;
    }
    .recibo-tabela-itens .col-codigo {
      width: 18%;
      font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
      font-size: 8.5pt;
      color: #475569;
      word-break: break-all;
    }
    .recibo-tabela-itens .col-doc {
      width: 14%;
      font-size: 9pt;
      word-break: break-word;
    }
    .recibo-tabela-itens .col-desc {
      color: #0f172a;
      line-height: 1.38;
    }
    .recibo-tabela-itens .col-un {
      width: 44px;
      text-align: center;
      color: #64748b;
      font-size: 9pt;
      white-space: nowrap;
    }
    .recibo-tabela-itens .col-qtd {
      width: 52px;
      text-align: right;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #0d9488;
      white-space: nowrap;
    }
    .recibo-tabela-itens thead .col-qtd { text-align: right; }
    .recibo-tabela-itens thead .col-num,
    .recibo-tabela-itens thead .col-un { text-align: center; }
    .recibo-total-linha {
      margin-top: 14px;
      padding: 10px 14px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 8px;
      font-size: 10.5pt;
      color: #065f46;
      text-align: right;
    }
    .recibo-total-geral {
      margin-top: 20px;
      padding: 14px 16px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      text-align: right;
      font-size: 11.5pt;
      color: #1e3a8a;
      page-break-inside: avoid;
    }
    .recibo-secao-doc {
      margin-top: 22px;
      padding-top: 18px;
      border-top: 2px solid #e2e8f0;
    }
    .recibo-secao-doc:first-of-type {
      border-top: none;
      padding-top: 0;
      margin-top: 0;
    }
    .recibo-secao-doc h2 {
      font-size: 11pt;
      letter-spacing: normal;
      text-transform: none;
      color: #0f172a;
      margin: 0 0 8px;
    }
    .recibo-secao-meta {
      font-size: 10pt;
      color: #475569;
      margin: 0 0 10px;
      line-height: 1.45;
    }
    .assinaturas {
      margin-top: 22px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 28px;
    }
    .assinatura-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .rotulo-ass {
      font-weight: 700;
      font-size: 9pt;
      color: #475569;
      margin: 0 0 4px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      width: 100%;
      text-align: center;
    }
    .espaco-assinatura {
      width: 88%;
      max-width: 280px;
      min-height: 48px;
      flex-shrink: 0;
    }
    .bloco-ass-pessoa {
      margin: 0;
      width: 88%;
      max-width: 280px;
      text-align: center;
    }
    .ass-nome-principal {
      font-size: 11pt;
      font-weight: 650;
      color: #0f172a;
      margin: 0 0 3px;
      line-height: 1.28;
      text-align: center;
      width: 100%;
    }
    .ass-meta-linha {
      font-size: 9.25pt;
      color: #64748b;
      margin: 0;
      line-height: 1.45;
      text-align: center;
      width: 100%;
    }
    .linha-ass {
      border-top: 1px solid #0f172a;
      margin: 0 0 8px;
      width: 88%;
      max-width: 280px;
      min-height: 1px;
    }
    .recibo-fechamento {
      page-break-inside: auto;
      break-inside: auto;
    }
    body.recibo-body--denso .recibo-tabela-itens .col-desc { line-height: 1.28; font-size: 8.5pt; }
    body.recibo-body--denso .recibo-tabela-itens th,
    body.recibo-body--denso .recibo-tabela-itens td { padding: 6px 10px; }
    .recibo-doc-foot {
      margin-top: 16px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      font-size: 8pt;
      color: #64748b;
      line-height: 1.45;
      text-align: center;
    }
  `;
}

export function montarHtmlReciboConsolidado(dados: DadosReciboSessaoConsolidada): string {
  const logoUrl = resolverUrlLogoInstitucionalParaHtmlImpresso(dados.logoUrl);
  const cfgR = readConfiguracoes();
  const segRodapeInst = segmentoInstituicaoRodapeEletronico(cfgR.documentoRodapeNome, cfgR.documentoRodapeCnpj);
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const dataFmt = (() => {
    try {
      return new Date(dados.dataAtendimento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return dados.dataAtendimento;
    }
  })();

  const blocoExterno = htmlBlocoTipoRetirada(dados);

  let totalGeral = 0;
  const secoesHtml = dados.secoes
    .map((secao) => {
      const at = secao.atendimento;
      const subtotal = totalQuantidadeSecao(at);
      totalGeral += subtotal;
      const linhasHtml = at.itens
        .map((it, idx) =>
          htmlLinhaItemRecibo(idx, it.codigoMaterial, it.descricaoMaterial, it.unidade, it.quantidadeAtendida),
        )
        .join('');
      const docTitulo = `${escapeHtmlRelatorio(at.documentoNumero)} Rev. ${escapeHtmlRelatorio(secao.documentoRevisao)}`;
      return `
      <section class="bloco recibo-bloco-itens recibo-secao-doc">
        <h2>Documento ${docTitulo}</h2>
        <p class="recibo-secao-meta"><strong>Lote:</strong> ${escapeHtmlRelatorio(at.numero)} · <strong>Responsavel:</strong> ${escapeHtmlRelatorio(secao.documentoResponsavel || '—')}</p>
        <p class="recibo-doc-desc"><strong>Descricao do documento</strong><br/>${escapeHtmlRelatorio(secao.documentoDescricao || '—')}</p>
        <div class="recibo-tabela-wrap">
        <table class="recibo-tabela-itens">
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th class="col-codigo">Codigo</th>
              <th class="col-desc">Descricao do material</th>
              <th class="col-un">UN</th>
              <th class="col-qtd">Qtd</th>
            </tr>
          </thead>
          <tbody>${linhasHtml}</tbody>
        </table>
        </div>
        <div class="recibo-total-linha"><strong>Subtotal deste documento:</strong> ${escapeHtmlRelatorio(String(subtotal))} un.</div>
      </section>`;
    })
    .join('');

  const lotesRodape = dados.numerosLotes.map((n) => escapeHtmlRelatorio(n)).join(' · ');
  const atRef = dados.secoes[0]?.atendimento;
  const classeDensidade = ' recibo-body--denso';

  const extraRecibo = cssReciboAtendimentoBase();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Recibo consolidado ${escapeHtmlRelatorio(dados.referencia)}</title>
  <style>
    ${cssInstitucionalRelatorio()}
    ${cssBarraPreVisualizacaoImpressaoHtml()}
    ${extraRecibo}
  </style>
</head>
<body class="recibo-body${classeDensidade}">
  ${htmlBarraPreVisualizacaoImpressao()}
  <div class="recibo-sheet">
  <div class="inst-topbar recibo-topbar">
    <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
    <span>Recibo consolidado ${escapeHtmlRelatorio(dados.referencia)}</span>
  </div>

  <header class="recibo-header-main recibo-header-main--titulo-centro">
    <div class="recibo-logo-wrap">${htmlBlocoLogoInstitucional(logoUrl)}</div>
    <div class="inst-title-col recibo-titulo-centro">
      <h1>Recibo de retirada de material</h1>
      <p class="recibo-subtitulo-consolidado">Retirada em ${dados.secoes.length} documento(s) · ${escapeHtmlRelatorio(String(dados.secoes.length))} lote(s) no sistema</p>
    </div>
  </header>

  <section class="bloco recibo-bloco-info">
    <div class="grid2">
      <p><strong>Data e hora:</strong> ${escapeHtmlRelatorio(dataFmt)}</p>
      <p><strong>Lotes registrados:</strong> ${lotesRodape}</p>
      <p><strong>Atendente:</strong> ${escapeHtmlRelatorio(dados.atendente)}</p>
      <p><strong>Retirante:</strong> ${escapeHtmlRelatorio(dados.nomeAtendido)}</p>
    </div>
  </section>

  ${blocoExterno}

  ${secoesHtml}

  <div class="recibo-fechamento">
  <div class="recibo-total-geral"><strong>Total geral de unidades (todos os documentos):</strong> ${escapeHtmlRelatorio(String(totalGeral))}</div>

  <div class="recibo-rodape-fin">
  ${htmlAssinaturasRecibo(
    atRef ? nomeExibicaoAtendenteAssinatura(atRef) : dados.atendente,
    linhaMatriculaFuncaoAssinatura(dados.atendenteMatricula, dados.atendenteFuncao),
    dados.recebedor.trim() || dados.nomeAtendido.trim() || '—',
    linhaMatriculaFuncaoAssinatura(dados.recebedorMatricula, dados.recebedorFuncao),
  )}
  <p class="recibo-doc-foot" role="contentinfo">Documento gerado eletronicamente pelo I.S.O PRO${segRodapeInst}. Conteudo para arquivo e auditoria. Lotes: ${lotesRodape}.</p>
  </div>
  </div>
  </div>
  ${scriptBarraPreVisualizacaoImpressao()}
</body>
</html>`;
}

export async function imprimirReciboSessaoConsolidada(dados: DadosReciboSessaoConsolidada): Promise<boolean> {
  return imprimirRelatorioProfissional({
    html: montarHtmlReciboConsolidado(dados),
    fileName: nomeArquivoRelatorioPdf(dados.referencia, 'recibo-consolidado'),
    titulo: `Recibo consolidado ${dados.referencia}`,
    tipoNuvem: 'recibo_sessao',
  });
}
