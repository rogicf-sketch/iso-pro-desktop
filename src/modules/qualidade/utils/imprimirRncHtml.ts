import {
  abrirImpressaoHtmlRelatorio,
  cssBarraPreVisualizacaoImpressaoHtml,
  cssInstitucionalRelatorio,
  escapeHtmlRelatorio,
  htmlBarraPreVisualizacaoImpressao,
  htmlBlocoLogoInstitucional,
  segmentoInstituicaoRodapeEletronico,
  scriptBarraPreVisualizacaoImpressao,
} from '../../../lib/htmlRelatorioInstitucional';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { hydrateRncRegistro } from './rncFotoIdb';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import type { RncItemLinha, RncRegistro } from '../types/qualidade.types';

const statusLabel: Record<RncRegistro['status'], string> = {
  aberto: 'Aberto',
  em_tratativa: 'Em tratativa',
  concluido: 'Fechado (concluido)',
  cancelado: 'Cancelado',
};

const localLabel: Record<NonNullable<RncRegistro['localArmazenagem']>, string> = {
  '': 'Nao informado',
  almoxarifado: 'Almoxarifado',
  quarentena: 'Area de quarentena',
  outro: 'Outro',
};

const acaoImediataLabel: Record<NonNullable<RncRegistro['acaoImediataTipo']>, string> = {
  '': 'Nao se aplica / a definir',
  devolvido_transportador: 'Material devolvido ao transportador',
  quarentena_bloqueado: 'Material segregado em quarentena (etiqueta BLOQUEADO)',
  parcial_item_defeito: 'Recebimento parcial (rejeitado apenas o item com defeito)',
};

function formatDatePt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function simNao(v: boolean): string {
  return v ? 'Sim' : 'Nao';
}

function htmlSecaoIdentificacaoGeral(registro: RncRegistro, loc: string): string {
  const incl = (registro.itensRnc ?? []).filter((x) => x.incluir);
  const legacyQty =
    incl.length === 0
      ? `<dt>Quantidade recebida (ref.)</dt><dd>${escapeHtmlRelatorio(String(registro.quantidadeRecebidaRef))}</dd>
      <dt>Quantidade rejeitada</dt><dd>${escapeHtmlRelatorio(String(registro.quantidadeRejeitada))}</dd>`
      : '';
  const tabelaNc =
    incl.length > 0
      ? `<div class="rnc-ident-nc-resumo">
    <p class="rnc-ident-nc-caption">Itens da NF com nao conformidade (${incl.length})</p>
    <table class="rnc-table rnc-ident-nc-table">
      <thead><tr><th>#</th><th>Codigo</th><th>Descricao material</th><th>Qtd recebida (ref.)</th><th>Qtd rejeitada</th></tr></thead>
      <tbody>${incl
        .map(
          (it, idx) =>
            `<tr><td>${idx + 1}</td><td>${escapeHtmlRelatorio(it.codigoMaterial)}</td><td>${escapeHtmlRelatorio(it.descricaoMaterial)}</td><td>${escapeHtmlRelatorio(String(it.quantidadeRecebida))}</td><td>${escapeHtmlRelatorio(String(it.quantidadeRejeitada))}</td></tr>`,
        )
        .join('')}</tbody>
    </table>
  </div>`
      : '';
  return `<section class="bloco rnc-sec">
    <h2>1. Identificacao geral</h2>
    <dl class="campos rnc-grid">
      <dt>Fornecedor</dt><dd>${escapeHtmlRelatorio(registro.recebimentoFornecedor ?? '')}</dd>
      <dt>NF / Fatura</dt><dd>${escapeHtmlRelatorio(registro.recebimentoNotaFiscal ?? '')}</dd>
      <dt>Pedido de compra</dt><dd>${escapeHtmlRelatorio(registro.pedidoCompra)}</dd>
      <dt>Romaneio</dt><dd>${escapeHtmlRelatorio(registro.recebimentoRomaneio ?? '')}</dd>
      <dt>Data recebimento (NF)</dt><dd>${escapeHtmlRelatorio(registro.recebimentoData ?? '')}</dd>
      <dt>Setor / area</dt><dd>${escapeHtmlRelatorio(registro.setor)}</dd>
      ${legacyQty}
      <dt>Local segregacao</dt><dd>${escapeHtmlRelatorio(loc)}</dd>
    </dl>
    ${tabelaNc}
  </section>`;
}

function htmlTiposLista(t: RncItemLinha['tiposOcorrencia'] | RncRegistro['tiposOcorrencia']): string {
  return `<ul class="rnc-list">
      <li>Avaria fisica / dano: <strong>${simNao(!!t?.avariaFisica)}</strong></li>
      <li>Quantidade incorreta: <strong>${simNao(!!t?.quantidadeIncorreta)}</strong></li>
      <li>Material incorreto: <strong>${simNao(!!t?.materialIncorreto)}</strong></li>
      <li>Documentacao / certificado faltante: <strong>${simNao(!!t?.documentacaoFaltante)}</strong></li>
      <li>Validade expirada ou curta: <strong>${simNao(!!t?.validadeExpirada)}</strong></li>
      <li>Outro: <strong>${simNao(!!t?.outro)}</strong>${t?.outro ? ` — ${escapeHtmlRelatorio(t.outroTexto)}` : ''}</li>
    </ul>`;
}

function montarHtmlItensNc(registro: RncRegistro): string {
  const incl = (registro.itensRnc ?? []).filter((x) => x.incluir);
  if (incl.length === 0) {
    const t = registro.tiposOcorrencia;
    return `<p><strong>Tipos de ocorrencia:</strong></p>
    ${htmlTiposLista(t)}
    <p><strong>Descricao detalhada (o que, onde, quando, como):</strong></p>
    <p style="white-space: pre-wrap;">${escapeHtmlRelatorio(registro.descricaoDetalhada || registro.descricao)}</p>`;
  }
  return incl
    .map((it, idx) => {
      const fotos =
        it.fotosDataUrls.length > 0
          ? `<div class="rnc-print-fotos" role="group" aria-label="Fotos do item">${it.fotosDataUrls
              .map(
                (url, fi) =>
                  `<figure class="rnc-print-photo-frame">
  <div class="rnc-print-photo-inner"><img src="${url}" alt="Evidencia fotografica ${fi + 1}" /></div>
  <figcaption>Foto ${fi + 1}</figcaption>
</figure>`,
              )
              .join('')}</div>`
          : it.fotosDeclaradasSemArquivo
            ? '<p class="rnc-muted"><em>Evidencia fotografica declarada fora do sistema.</em></p>'
            : '<p class="rnc-muted">—</p>';
      return `<article class="rnc-item-print-bloco">
    <header class="rnc-item-print-head">
      <span class="rnc-item-print-badge">Item ${idx + 1}</span>
      <h3 class="rnc-item-print-title">${escapeHtmlRelatorio(it.codigoMaterial || '—')}</h3>
      <p class="rnc-item-print-sub">${escapeHtmlRelatorio(it.descricaoMaterial)}</p>
    </header>
    <div class="rnc-item-print-body">
    <dl class="rnc-dl-grid">
      <div class="rnc-dl-row"><dt>Unidade</dt><dd>${escapeHtmlRelatorio(it.unidade)}</dd></div>
      <div class="rnc-dl-row"><dt>Disciplina</dt><dd>${escapeHtmlRelatorio(it.disciplina)}</dd></div>
      <div class="rnc-dl-row"><dt>Localizacao</dt><dd>${escapeHtmlRelatorio(it.localizacao)}</dd></div>
      <div class="rnc-dl-row"><dt>Qtd. recebida (NF)</dt><dd>${escapeHtmlRelatorio(String(it.quantidadeRecebida))}</dd></div>
      <div class="rnc-dl-row"><dt>Qtd. conferida</dt><dd>${escapeHtmlRelatorio(String(it.quantidadeConferida))}</dd></div>
      <div class="rnc-dl-row"><dt>Qtd. rejeitada (NC)</dt><dd>${escapeHtmlRelatorio(String(it.quantidadeRejeitada))}</dd></div>
      <div class="rnc-dl-row rnc-dl-row--full"><dt>Certificado</dt><dd>${escapeHtmlRelatorio(it.certificado)}</dd></div>
    </dl>
    <div class="rnc-subsec">
      <h4 class="rnc-subsec-title">Tipos de ocorrencia (neste item)</h4>
      ${htmlTiposLista(it.tiposOcorrencia)}
    </div>
    <div class="rnc-subsec">
      <h4 class="rnc-subsec-title">Descricao do desvio</h4>
      <p class="rnc-text-block">${escapeHtmlRelatorio(it.descricaoDetalhada)}</p>
    </div>
    <div class="rnc-subsec rnc-subsec--fotos">
      <h4 class="rnc-subsec-title">Evidencias fotograficas</h4>
      ${fotos}
    </div>
    </div>
  </article>`;
    })
    .join('');
}

export function montarHtmlRnc(registro: RncRegistro): string {
  const logoUrl = resolverUrlLogoInstitucionalParaHtmlImpresso();
  const cfgRodape = readConfiguracoes();
  const segRodapeInst = segmentoInstituicaoRodapeEletronico(
    cfgRodape.documentoRodapeNome,
    cfgRodape.documentoRodapeCnpj,
  );
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const ev = registro.evidencias;
  const loc =
    registro.localArmazenagem === 'outro' && registro.localArmazenagemOutro.trim()
      ? `Outro: ${registro.localArmazenagemOutro.trim()}`
      : localLabel[registro.localArmazenagem || ''];

  const linhasPlano = (registro.planoAcaoLinhas ?? []).filter((l) => l.acao.trim() || l.responsavel.trim() || l.prazo.trim());
  const rowsPlano =
    linhasPlano.length > 0
      ? linhasPlano
          .map(
            (l) =>
              `<tr><td>${escapeHtmlRelatorio(l.acao)}</td><td>${escapeHtmlRelatorio(l.responsavel)}</td><td>${escapeHtmlRelatorio(l.prazo)}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="3">—</td></tr>';

  /** Titulo do documento: so o codigo evita repetir o mesmo texto do h1 no cabecalho do navegador ao imprimir. */
  const codigoTitulo = registro.codigo.trim();
  const documentTitle = codigoTitulo ? escapeHtmlRelatorio(codigoTitulo) : 'RNC';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${documentTitle}</title>
  <style>${cssInstitucionalRelatorio()}${cssBarraPreVisualizacaoImpressaoHtml()}
    .rnc-doc { max-width: 900px; margin: 0 auto; }
    /* Cabecalho repetido em cada pagina na impressao (thead) */
    table.rnc-print-frame { width: 100%; border-collapse: collapse; margin: 0; }
    thead.rnc-print-head { display: table-header-group; }
    tbody.rnc-print-body { display: table-row-group; }
    thead.rnc-print-head td,
    tbody.rnc-print-body td { border: none; padding: 0; vertical-align: top; }
    thead.rnc-print-head .rnc-print-repeat-header { margin-bottom: 12px; }
    @media print {
      @page { margin: 10mm 12mm; }
      thead.rnc-print-head td {
        background: #fff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    .rnc-sec { margin-top: 20px; padding: 14px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; page-break-inside: avoid; }
    .rnc-sec h2 { font-size: 0.72rem; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #334155; text-transform: uppercase; letter-spacing: 0.08em; color: #334155; font-weight: 800; }
    .rnc-grid { display: grid; grid-template-columns: 160px 1fr 160px 1fr; gap: 4px 16px; font-size: 9.5pt; align-items: baseline; }
    .rnc-grid dt { font-weight: 700; color: #475569; margin: 0; }
    .rnc-grid dd { margin: 0 0 6px 0; color: #0f172a; grid-column: span 1; }
    @media (max-width: 720px) { .rnc-grid { grid-template-columns: 1fr 1fr; } }
    .rnc-list { margin: 6px 0 0 0; padding-left: 18px; font-size: 9.5pt; line-height: 1.45; }
    .rnc-muted { color: #64748b; font-size: 9.5pt; margin: 6px 0 0 0; }
    .rnc-text-block { white-space: pre-wrap; margin: 6px 0 0 0; font-size: 9.5pt; line-height: 1.45; color: #0f172a; }
    /* Itens NC */
    .rnc-item-print-bloco { border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; margin-bottom: 18px; background: #fff; page-break-inside: avoid; box-shadow: 0 1px 3px rgba(15,23,42,0.06); }
    .rnc-item-print-head { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: #fff; padding: 12px 16px; }
    .rnc-item-print-badge { display: inline-block; font-size: 7.5pt; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.9; margin-bottom: 4px; }
    .rnc-item-print-title { margin: 0; font-size: 11pt; font-weight: 700; letter-spacing: 0.02em; }
    .rnc-item-print-sub { margin: 6px 0 0 0; font-size: 9pt; opacity: 0.92; line-height: 1.35; }
    .rnc-item-print-body { padding: 14px 16px 16px; }
    .rnc-dl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; font-size: 9pt; margin: 0 0 14px 0; }
    .rnc-dl-row { display: grid; grid-template-columns: 130px 1fr; gap: 8px; align-items: baseline; border-bottom: 1px dotted #e2e8f0; padding-bottom: 6px; }
    .rnc-dl-row--full { grid-column: 1 / -1; }
    .rnc-dl-row dt { font-weight: 700; color: #64748b; margin: 0; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; }
    .rnc-dl-row dd { margin: 0; color: #0f172a; }
    .rnc-subsec { margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
    .rnc-subsec-title { margin: 0 0 8px 0; font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; }
    .rnc-subsec--fotos { border-top: 2px solid #cbd5e1; margin-top: 16px; padding-top: 14px; }
    /* Fotos: quadros uniformes (mesma altura e largura de celula) */
    .rnc-print-fotos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 4px; }
    @media print {
      .rnc-print-fotos { grid-template-columns: repeat(2, 1fr); }
    }
    .rnc-print-photo-frame { margin: 0; padding: 0; break-inside: avoid; page-break-inside: avoid; }
    .rnc-print-photo-inner {
      width: 100%;
      height: 200px;
      border: 2px solid #94a3b8;
      border-radius: 8px;
      background: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      overflow: hidden;
    }
    .rnc-print-photo-inner img {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      vertical-align: middle;
    }
    .rnc-print-photo-frame figcaption {
      margin-top: 6px;
      font-size: 8pt;
      color: #64748b;
      font-weight: 600;
      text-align: center;
      letter-spacing: 0.03em;
    }
    table.rnc-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 10px; }
    table.rnc-table th, table.rnc-table td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; vertical-align: top; }
    table.rnc-table th { background: #e2e8f0; color: #334155; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; }
    table.rnc-table tbody tr:nth-child(even) { background: #f8fafc; }
    .rnc-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 20px; page-break-inside: avoid; }
    .rnc-sign > div { text-align: center; }
    .rnc-sign .line { border-top: 1px dashed #64748b; margin: 36px 8px 8px 8px; }
    .rnc-sign .role { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; font-weight: 800; }
    .rnc-sign .role--plain { text-transform: none; letter-spacing: 0.02em; font-size: 9.5px; }
    .rnc-sign .sub { font-size: 8.5px; color: #94a3b8; margin-top: 2px; font-weight: 600; }
    .rnc-ident-nc-resumo { margin-top: 14px; page-break-inside: avoid; }
    .rnc-ident-nc-caption { margin: 0 0 8px 0; font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; }
    .rnc-ident-nc-table { font-size: 8.5pt; }
    .rnc-sign .nome { font-size: 12px; margin-top: 6px; color: #0f172a; font-weight: 600; }
    .rnc-sign .data { font-size: 10px; color: #94a3b8; margin-top: 3px; }
    .rnc-doc-foot {
      margin-top: 16px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      font-size: 8pt;
      color: #64748b;
      line-height: 1.45;
      text-align: center;
      page-break-inside: avoid;
    }
  </style>
</head>
<body class="rnc-doc">
  ${htmlBarraPreVisualizacaoImpressao()}
  <table class="rnc-print-frame">
    <thead class="rnc-print-head">
      <tr>
        <td>
          <header class="inst-header rnc-print-repeat-header">
            ${htmlBlocoLogoInstitucional(logoUrl)}
            <div class="inst-title-col">
              <h1>Relatorio de Nao Conformidade (RNC)</h1>
              <p style="margin:4px 0 0 0;font-size:10pt;color:#555;">Recebimento de materiais</p>
            </div>
          </header>
        </td>
      </tr>
    </thead>
    <tbody class="rnc-print-body">
      <tr>
        <td>
          <div class="inst-topbar">
            <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
            <span>${escapeHtmlRelatorio(registro.codigo)}</span>
          </div>

  <section class="bloco rnc-sec">
    <h2>Cabecalho</h2>
    <dl class="campos rnc-grid">
      <dt>RNC Nº</dt><dd>${escapeHtmlRelatorio(registro.codigo)}</dd>
      <dt>Data de abertura</dt><dd>${escapeHtmlRelatorio(registro.dataRegistro)}</dd>
      <dt>Status do registro</dt><dd>${escapeHtmlRelatorio(statusLabel[registro.status])}</dd>
      <dt>Responsavel pela RNC</dt><dd>${escapeHtmlRelatorio(registro.responsavel)}</dd>
    </dl>
  </section>

  ${htmlSecaoIdentificacaoGeral(registro, loc)}

  <section class="bloco rnc-sec">
    <h2>2. Descricao da nao conformidade (por item da NF)</h2>
    ${montarHtmlItensNc(registro)}
  </section>

  <section class="bloco rnc-sec">
    <h2>3. Evidencias objetivas</h2>
    <ul class="rnc-list">
      <li>Fotos anexadas: <strong>${simNao(!!ev?.fotosAnexadas)}</strong></li>
      <li>Copia pedido / especificacao: <strong>${simNao(!!ev?.copiaPedido)}</strong></li>
      <li>Copia NF: <strong>${simNao(!!ev?.copiaNf)}</strong></li>
      <li>Laudo de conferencia: <strong>${simNao(!!ev?.laudoConferencia)}</strong></li>
    </ul>
    <p style="white-space: pre-wrap;"><strong>Obs.:</strong> ${escapeHtmlRelatorio(registro.evidenciasObservacao)}</p>
  </section>

  <section class="bloco rnc-sec">
    <h2>4. Acao imediata (segregacao)</h2>
    <p>${escapeHtmlRelatorio(acaoImediataLabel[registro.acaoImediataTipo || ''])}</p>
    <p style="white-space: pre-wrap;">${escapeHtmlRelatorio(registro.acaoImediataObservacoes)}</p>
  </section>

  <section class="bloco rnc-sec">
    <h2>5. Analise da causa raiz</h2>
    <p style="white-space: pre-wrap;">${escapeHtmlRelatorio(registro.analiseCausaRaiz)}</p>
  </section>

  <section class="bloco rnc-sec">
    <h2>6. Plano de acao</h2>
    <table class="rnc-table">
      <thead><tr><th>Acao</th><th>Responsavel</th><th>Prazo</th></tr></thead>
      <tbody>${rowsPlano}</tbody>
    </table>
    <p style="white-space: pre-wrap; margin-top:10px; font-size:0.88rem; color:#64748b;"><strong>Texto consolidado:</strong> ${escapeHtmlRelatorio(registro.planoAcao)}</p>
  </section>

  <section class="bloco rnc-sec">
    <h2>7. Encerramento</h2>
    <div class="rnc-sign">
      <div>
        <div class="line"></div>
        <div class="role">Responsavel setor de materiais</div>
        <div class="sub">Gestao do recebimento / materiais</div>
        <div class="nome">${escapeHtmlRelatorio(registro.assinaturaResponsavelRnc.nome)}</div>
        <div class="data">${registro.assinaturaResponsavelRnc.data ? formatDatePt(registro.assinaturaResponsavelRnc.data) : '—'}</div>
      </div>
      <div>
        <div class="line"></div>
        <div class="role">Qualidade</div>
        <div class="sub">Analise e disposicao</div>
        <div class="nome">${escapeHtmlRelatorio(registro.assinaturaQualidade.nome)}</div>
        <div class="data">${registro.assinaturaQualidade.data ? formatDatePt(registro.assinaturaQualidade.data) : '—'}</div>
      </div>
      <div>
        <div class="line"></div>
        <div class="role role--plain">Ciencia da contraparte</div>
        <div class="nome">${escapeHtmlRelatorio(registro.assinaturaFornecedor.nome)}</div>
        <div class="data">${registro.assinaturaFornecedor.data ? formatDatePt(registro.assinaturaFornecedor.data) : '—'}</div>
      </div>
    </div>
    <p style="white-space: pre-wrap; margin-top: 18px;"><strong>Observacoes gerais:</strong> ${escapeHtmlRelatorio(registro.observacoes)}</p>
    <p class="rnc-doc-foot" role="contentinfo">Documento gerado eletronicamente pelo I.S.O PRO Desktop${segRodapeInst}. Conteudo para arquivo e auditoria. Referencia: ${escapeHtmlRelatorio(registro.codigo)}.</p>
  </section>
        </td>
      </tr>
    </tbody>
  </table>
  ${scriptBarraPreVisualizacaoImpressao()}
</body>
</html>`;
}

export function imprimirRncHtml(registro: RncRegistro): boolean {
  return abrirImpressaoHtmlRelatorio(montarHtmlRnc(registro));
}

/** Hidrata fotos em IndexedDB antes de montar o HTML (impressão a partir da lista). */
export async function imprimirRncHtmlAsync(registro: RncRegistro): Promise<boolean> {
  const h = await hydrateRncRegistro(registro);
  return abrirImpressaoHtmlRelatorio(montarHtmlRnc(h));
}
