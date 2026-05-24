import {
  abrirImpressaoHtmlRelatorio,
  cssInstitucionalRelatorio,
  escapeHtmlRelatorio,
  htmlBlocoLogoInstitucional,
  segmentoInstituicaoRodapeEletronico,
} from '../../../lib/htmlRelatorioInstitucional';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { resolverUrlLogoInstitucional, resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import type { Atendimento, DadosReciboAtendimento, DadosReciboSessaoConsolidada } from '../types/atendimento.types';

/** @deprecated Use LEGACY_LOGO_STORAGE_KEY em `logoInstitucional.ts`. Mantido para compatibilidade de import. */
export { LEGACY_LOGO_STORAGE_KEY as RECIBO_LOGO_STORAGE_KEY } from '../../../lib/logoInstitucional';

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
    .linha-ass { border-top: 1px solid #0f172a; margin: 40px 8px 0; padding-top: 8px; }
    .rotulo-ass { font-weight: 700; font-size: 9pt; color: #475569; margin: 10px 0 0; letter-spacing: 0.02em; }
    .bloco-ass-pessoa { margin: 8px auto 0; max-width: 340px; text-align: left; }
    .ass-nome-principal { font-size: 11pt; font-weight: 650; color: #0f172a; margin: 6px 0 3px; line-height: 1.28; }
    .ass-meta-linha { font-size: 9.25pt; color: #64748b; margin: 0; line-height: 1.45; }
    @media print {
      .assinaturas { margin-top: 28px; }
      .recibo-bloco-itens tbody tr:nth-child(even) { background: transparent; }
      .recibo-total-linha { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    .recibo-doc-foot {
      margin-top: 18px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      font-size: 8pt;
      color: #64748b;
      line-height: 1.45;
      text-align: center;
      page-break-inside: avoid;
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
      <div class="bloco-ass-pessoa">
        <p class="ass-nome-principal">${escapeHtmlRelatorio(nomeExibicaoAtendenteAssinatura(at))}</p>
        <p class="ass-meta-linha">${escapeHtmlRelatorio(
          linhaMatriculaFuncaoAssinatura(textoReciboOuEmDash(at.atendenteMatricula), textoReciboOuEmDash(at.atendenteFuncao)),
        )}</p>
      </div>
    </div>
    <div class="assinatura-box">
      <div class="linha-ass"></div>
      <p class="rotulo-ass">Atendido (quem retirou)</p>
      <div class="bloco-ass-pessoa">
        <p class="ass-nome-principal">${escapeHtmlRelatorio(at.recebedor.trim() || dados.nomeAtendido.trim() || '—')}</p>
        <p class="ass-meta-linha">${escapeHtmlRelatorio(
          linhaMatriculaFuncaoAssinatura(textoReciboOuEmDash(at.recebedorMatricula), textoReciboOuEmDash(at.recebedorFuncao)),
        )}</p>
      </div>
    </div>
  </section>
  <p class="recibo-doc-foot" role="contentinfo">Documento gerado eletronicamente pelo I.S.O PRO Desktop${segRodapeInst}. Conteudo para arquivo e auditoria. Referencia: ${escapeHtmlRelatorio(at.numero)}.</p>
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

function totalQuantidadeSecao(at: Atendimento): number {
  return at.itens.reduce((acc, it) => acc + (Number(it.quantidadeAtendida) || 0), 0);
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

  let totalGeral = 0;
  const secoesHtml = dados.secoes
    .map((secao) => {
      const at = secao.atendimento;
      const subtotal = totalQuantidadeSecao(at);
      totalGeral += subtotal;
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
      const docTitulo = `${escapeHtmlRelatorio(at.documentoNumero)} Rev. ${escapeHtmlRelatorio(secao.documentoRevisao)}`;
      return `
      <section class="bloco recibo-bloco-itens recibo-secao-doc">
        <h2>Documento ${docTitulo}</h2>
        <p class="panel-copy"><strong>Lote:</strong> ${escapeHtmlRelatorio(at.numero)} · <strong>Responsavel:</strong> ${escapeHtmlRelatorio(secao.documentoResponsavel || '—')}</p>
        <p class="recibo-doc-desc"><strong>Descricao do documento</strong><br/>${escapeHtmlRelatorio(secao.documentoDescricao || '—')}</p>
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
        <div class="recibo-total-linha"><strong>Subtotal deste documento:</strong> ${escapeHtmlRelatorio(String(subtotal))} un.</div>
      </section>`;
    })
    .join('');

  const lotesRodape = dados.numerosLotes.map((n) => escapeHtmlRelatorio(n)).join(' · ');
  const atRef = dados.secoes[0]?.atendimento;

  const extraRecibo = `
    body.recibo-body { padding: 0; color: #0f172a; }
    .recibo-secao-doc { margin-top: 22px; padding-top: 18px; border-top: 2px solid #e2e8f0; }
    .recibo-secao-doc:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
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
      .recibo-sheet { box-shadow: none !important; border: none !important; border-radius: 0 !important; max-width: none !important; }
      .recibo-secao-doc { page-break-inside: avoid; }
    }
    .recibo-bloco-itens table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10pt; }
    .recibo-bloco-itens th { background: #f1f5f9; text-align: left; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; }
    .recibo-bloco-itens td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .recibo-bloco-itens td.num { text-align: right; white-space: nowrap; }
    .recibo-total-linha { margin-top: 12px; padding: 10px 14px; background: #f8fafc; border-radius: 8px; text-align: right; }
    .recibo-total-geral { margin-top: 20px; padding: 14px 16px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; text-align: right; font-size: 11.5pt; }
    .recibo-doc-desc { margin: 10px 0 12px; font-size: 10.5pt; line-height: 1.45; color: #334155; }
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Recibo consolidado ${escapeHtmlRelatorio(dados.referencia)}</title>
  <style>
    ${cssInstitucionalRelatorio()}
    ${extraRecibo}
  </style>
</head>
<body class="recibo-body">
  <div class="recibo-sheet">
  <div class="inst-topbar recibo-topbar">
    <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
    <span>Recibo consolidado ${escapeHtmlRelatorio(dados.referencia)}</span>
  </div>

  <header class="recibo-header-main">
    <div class="recibo-logo-wrap">${htmlBlocoLogoInstitucional(logoUrl)}</div>
    <div class="inst-title-col">
      <h1>Recibo de retirada de material</h1>
      <p style="margin:8px 0 0;font-size:11pt;color:#475569;">Retirada em ${dados.secoes.length} documento(s) · ${escapeHtmlRelatorio(String(dados.secoes.length))} lote(s) no sistema</p>
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

  <div class="recibo-total-geral"><strong>Total geral de unidades (todos os documentos):</strong> ${escapeHtmlRelatorio(String(totalGeral))}</div>

  <section class="assinaturas">
    <div class="assinatura-box">
      <div class="linha-ass"></div>
      <p class="rotulo-ass">Atendente (operador)</p>
      <div class="bloco-ass-pessoa">
        <p class="ass-nome-principal">${escapeHtmlRelatorio(atRef ? nomeExibicaoAtendenteAssinatura(atRef) : dados.atendente)}</p>
        <p class="ass-meta-linha">${escapeHtmlRelatorio(
          linhaMatriculaFuncaoAssinatura(dados.atendenteMatricula, dados.atendenteFuncao),
        )}</p>
      </div>
    </div>
    <div class="assinatura-box">
      <div class="linha-ass"></div>
      <p class="rotulo-ass">Atendido (quem retirou)</p>
      <div class="bloco-ass-pessoa">
        <p class="ass-nome-principal">${escapeHtmlRelatorio(dados.recebedor.trim() || dados.nomeAtendido.trim() || '—')}</p>
        <p class="ass-meta-linha">${escapeHtmlRelatorio(
          linhaMatriculaFuncaoAssinatura(dados.recebedorMatricula, dados.recebedorFuncao),
        )}</p>
      </div>
    </div>
  </section>
  <p class="recibo-doc-foot" role="contentinfo">Documento gerado eletronicamente pelo I.S.O PRO Desktop${segRodapeInst}. Conteudo para arquivo e auditoria. Lotes: ${lotesRodape}.</p>
  </div>
</body>
</html>`;
}

export function imprimirReciboSessaoConsolidada(dados: DadosReciboSessaoConsolidada): boolean {
  return abrirImpressaoHtmlRelatorio(montarHtmlReciboConsolidado(dados));
}
