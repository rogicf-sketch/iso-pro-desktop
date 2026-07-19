import {
  cssBarraPreVisualizacaoImpressaoHtml,
  cssInstitucionalRelatorio,
  escapeHtmlRelatorio,
  htmlBarraPreVisualizacaoImpressao,
  htmlBlocoLogoInstitucional,
  scriptBarraPreVisualizacaoImpressao,
  segmentoInstituicaoRodapeEletronico,
} from '../../../lib/htmlRelatorioInstitucional';
import { imprimirRelatorioProfissional, nomeArquivoRelatorioPdf } from '../../../lib/relatorioProfissional';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import type { DadosReciboEstorno } from '../types/atendimento.types';
import { cssReciboAtendimentoBase, htmlAssinaturasRecibo } from './imprimirReciboAtendimento';

function totalQuantidadeEstorno(dados: DadosReciboEstorno): number {
  return dados.itensEstorno.reduce((acc, it) => acc + (Number(it.quantidadeAtendida) || 0), 0);
}

function cssReciboEstornoExtra(): string {
  return `
    .recibo-estorno-badge {
      margin: 0 0 10px;
      padding: 7px 12px;
      font-size: 9.5pt;
      line-height: 1.35;
      color: #334155;
      background: linear-gradient(90deg, #fff7ed 0%, #f8fafc 100%);
      border: 1px solid #fed7aa;
      border-left: 4px solid #ea580c;
      border-radius: 8px;
    }
    .recibo-estorno-badge strong { color: #c2410c; font-weight: 700; }
    .recibo-estorno-motivo {
      margin: 0 0 10px;
      padding: 8px 12px;
      font-size: 9.5pt;
      line-height: 1.4;
      color: #334155;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #94a3b8;
      border-radius: 8px;
      white-space: pre-wrap;
    }
    .recibo-estorno-motivo strong { color: #475569; font-weight: 700; }
    .recibo-tabela-itens .col-doc { width: 14%; font-size: 9pt; }
    @media print {
      .recibo-estorno-badge,
      .recibo-estorno-motivo {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      /* Estorno compacto: cabe em 1 folha para lotes pequenos. */
      .recibo-estorno-motivo {
        margin: 0 0 6px !important;
        padding: 6px 10px !important;
        font-size: 9pt !important;
        border-radius: 6px !important;
      }
      .recibo-estorno-badge {
        margin: 0 0 6px !important;
        padding: 5px 10px !important;
        font-size: 8.5pt !important;
      }
    }
  `;
}

export function montarHtmlReciboEstorno(dados: DadosReciboEstorno): string {
  const at = dados.atendimento;
  const logoUrl = resolverUrlLogoInstitucionalParaHtmlImpresso(dados.logoUrl);
  const cfgR = readConfiguracoes();
  const segRodapeInst = segmentoInstituicaoRodapeEletronico(cfgR.documentoRodapeNome, cfgR.documentoRodapeCnpj);
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const dataAtendFmt = (() => {
    try {
      return new Date(at.dataAtendimento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return at.dataAtendimento;
    }
  })();

  const docTitulo =
    dados.documentoTitulo?.trim() ||
    (dados.documentoNumero === 'MULTIPLOS'
      ? 'Varios desenhos (ver coluna Documento)'
      : `${escapeHtmlRelatorio(dados.documentoNumero)} Rev. ${escapeHtmlRelatorio(dados.documentoRevisao)}`);

  const linhasHtml = dados.itensEstorno
    .map(
      (it, idx) =>
        `<tr>
          <td class="col-num">${idx + 1}</td>
          <td class="col-doc">${escapeHtmlRelatorio((it.documentoNumero?.trim() || at.documentoNumero || '—').trim())}</td>
          <td class="col-codigo">${escapeHtmlRelatorio(it.codigoMaterial)}</td>
          <td class="col-desc">${escapeHtmlRelatorio(it.descricaoMaterial)}</td>
          <td class="col-un">${escapeHtmlRelatorio(it.unidade)}</td>
          <td class="col-qtd">${escapeHtmlRelatorio(String(it.quantidadeAtendida))}</td>
        </tr>`,
    )
    .join('');

  const total = totalQuantidadeEstorno(dados);
  const classeDensidade = dados.itensEstorno.length > 6 ? ' recibo-body--denso' : '';
  const avisoParcial =
    dados.estornoParcial ?
      `<p class="recibo-estorno-badge" role="note"><strong>Estorno parcial</strong> — apenas os itens abaixo foram devolvidos nesta operacao.</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Estorno ${escapeHtmlRelatorio(at.numero)}</title>
  <style>
    ${cssInstitucionalRelatorio()}
    ${cssBarraPreVisualizacaoImpressaoHtml()}
    ${cssReciboAtendimentoBase()}
    ${cssReciboEstornoExtra()}
  </style>
</head>
<body class="recibo-body${classeDensidade}">
  ${htmlBarraPreVisualizacaoImpressao()}
  <div class="recibo-sheet">
  <div class="inst-topbar recibo-topbar">
    <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
    <span>Estorno ${escapeHtmlRelatorio(at.numero)}</span>
  </div>

  <header class="recibo-header-main recibo-header-main--titulo-centro">
    <div class="recibo-logo-wrap">${htmlBlocoLogoInstitucional(logoUrl)}</div>
    <div class="inst-title-col recibo-titulo-centro">
      <h1>Recibo de estorno de material</h1>
    </div>
  </header>

  <section class="bloco recibo-bloco-info">
    <div class="grid2">
      <p><strong>Documento:</strong> ${docTitulo}</p>
      <p><strong>Responsavel (documento):</strong> ${escapeHtmlRelatorio(dados.documentoResponsavel || '—')}</p>
      <p><strong>Lote / atendimento:</strong> ${escapeHtmlRelatorio(at.numero)}</p>
      <p><strong>Data da retirada:</strong> ${escapeHtmlRelatorio(dataAtendFmt)}</p>
      <p><strong>Atendente (retirada):</strong> ${escapeHtmlRelatorio(at.atendente)}</p>
      <p><strong>Recebedor (retirada):</strong> ${escapeHtmlRelatorio(at.recebedor)}${at.recebedorTipo === 'externo' && at.recebedorEmpresa ? ` — ${escapeHtmlRelatorio(at.recebedorEmpresa)}` : ''}</p>
      <p><strong>Quem registrou o estorno:</strong> ${escapeHtmlRelatorio(dados.nomeQuemEstorna || '—')}</p>
      <p><strong>Quem devolve o material:</strong> ${escapeHtmlRelatorio(dados.nomeQuemDevolve || '—')}</p>
    </div>
    <div class="recibo-doc-desc">
      <strong>Descricao do documento</strong>
      <p style="margin: 4px 0 0">${escapeHtmlRelatorio(dados.documentoDescricao || '—')}</p>
    </div>
  </section>

  <div class="recibo-estorno-motivo">
    <strong>Motivo do estorno:</strong> ${escapeHtmlRelatorio(dados.motivoEstorno || '—')}
  </div>

  ${avisoParcial}

  <section class="bloco recibo-bloco-itens">
    <h2>Materiais devolvidos (estorno)</h2>
    <div class="recibo-tabela-wrap">
    <table class="recibo-tabela-itens">
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th class="col-doc">Documento</th>
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
    <div class="recibo-total-linha"><strong>Total de unidades devolvidas (esta operacao):</strong> ${escapeHtmlRelatorio(String(total))}</div>

  <div class="recibo-rodape-fin">
  ${htmlAssinaturasRecibo(
    dados.nomeQuemEstorna.trim() || '—',
    '—',
    dados.nomeQuemDevolve.trim() || '—',
    '—',
    {
      atendente: 'Responsavel pelo estorno (operador)',
      atendido: 'Quem devolveu o material',
    },
  )}
  <p class="recibo-doc-foot" role="contentinfo">Documento gerado eletronicamente pelo I.S.O PRO${segRodapeInst}. Conteudo para arquivo e auditoria. Referencia: estorno ${escapeHtmlRelatorio(at.numero)}.</p>
  </div>
  </div>
  </div>
  ${scriptBarraPreVisualizacaoImpressao()}
</body>
</html>`;
}

export async function imprimirReciboEstorno(dados: DadosReciboEstorno): Promise<boolean> {
  return imprimirRelatorioProfissional({
    html: montarHtmlReciboEstorno(dados),
    fileName: nomeArquivoRelatorioPdf(dados.atendimento.numero, 'estorno'),
    titulo: `Recibo estorno ${dados.atendimento.numero}`,
    tipoNuvem: 'recibo_estorno',
  });
}
