import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { abrirImpressaoHtmlRelatorio, escapeHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import type { RirRegistro } from '../types/qualidade.types';
import { rirObraDefaultsFromConfig } from './rirConfigDefaults';

const DOC_VERSION = '18';

function formatDatePt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function formatDateTimePt(): string {
  return new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function laudoLabel(l: RirRegistro['laudo']): string {
  if (l === 'reprovado') return 'Reprovado';
  if (l === 'observacoes') return 'Conforme observacoes';
  return 'Aprovado';
}

function statusTratativaLabel(s: RirRegistro['status']): string {
  const m: Record<RirRegistro['status'], string> = {
    aberto: 'Em aberto',
    em_analise: 'Em analise',
    tratado: 'Tratado',
    cancelado: 'Cancelado',
  };
  return m[s] ?? s;
}

function mkIns(on: boolean): string {
  return on
    ? '<span class="rir-pill ok">✓</span>'
    : '<span class="rir-pill off">—</span>';
}

/**
 * Relatorio RIR — layout inspirado no formulario em papel (bordas, faixas cinza, tabela material + certificado).
 */
export function montarHtmlRelatorioRirCompleto(r: RirRegistro): string {
  const cfg = readConfiguracoes();
  const logo = resolverUrlLogoInstitucionalParaHtmlImpresso();
  const clienteNome = cfg.cliente || '';
  const projetoNome = cfg.projeto || '';
  const localCfg = cfg.local || '';
  const obCfg = rirObraDefaultsFromConfig(cfg);
  const uoExibir = (r.uo || '').trim() || obCfg.uo;
  const localExibir = (r.localObra || '').trim() || obCfg.localObra;
  const contratoExibir = (r.contratoNumero || '').trim() || obCfg.contratoNumero;
  const laudo = r.laudo || 'aprovado';
  const laudoTxt = laudoLabel(laudo);
  const statusTxt = statusTratativaLabel(r.status);
  const solCompra = (r.solCompraPackList ?? '').trim();

  let rows = '';
  (r.itensRir ?? []).forEach((it, i) => {
    rows += `<tr>
      <td class="rir-c-item">${i + 1}</td>
      <td>${escapeHtmlRelatorio(it.codigoMaterial)}</td>
      <td class="rir-c-q">${escapeHtmlRelatorio(String(it.quantidade))}</td>
      <td>${escapeHtmlRelatorio(it.unidade)}</td>
      <td class="rir-c-desc">${escapeHtmlRelatorio(it.descricaoMaterial).replace(/\n/g, '<br>')}</td>
      <td class="rir-c-cert">${escapeHtmlRelatorio(it.certificado)}</td>
    </tr>`;
  });
  if (!rows) rows = '<tr><td colspan="6" class="rir-empty-row">Nenhum item registrado neste relatorio.</td></tr>';

  const logoBlock = logo
    ? `<img class="rir-logo" src="${escapeHtmlRelatorio(logo)}" alt="Logo" />`
    : `<div class="rir-brand-fallback">${escapeHtmlRelatorio(clienteNome || 'I.S.O PRO')}</div>`;

  const escopoLinha = [clienteNome, projetoNome].filter(Boolean).join(' · ') || '—';
  const refReceb = r.recebimentoId ? escapeHtmlRelatorio(r.recebimentoId) : '—';
  return `<div class="rir-doc rir-doc--classic" lang="pt-BR">
<style>
/* Margens de página para impressão/PDF: ver @media print { @page { ... } } */
html {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body.rir-print-body {
  margin: 0;
  padding: 0;
}
.rir-doc--classic {
  font-family: 'Segoe UI', 'Calibri', 'Helvetica Neue', Arial, system-ui, sans-serif;
  color: #0f172a;
  font-size: 10.5pt;
  line-height: 1.45;
  background: #f1f5f9;
  padding: 14px;
  max-width: 960px;
  margin: 0 auto;
}
.rir-doc--classic * { box-sizing: border-box; }
.rir-doc-inner {
  background: #fff;
  border: 1px solid #334155;
  padding: 18px 20px 22px;
}
.rir-classic-top {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(200px, 2.2fr) minmax(120px, 1fr);
  gap: 12px;
  align-items: start;
  border-bottom: 2px solid #0f172a;
  padding-bottom: 12px;
  margin-bottom: 0;
}
.rir-brand { display: flex; align-items: center; }
.rir-logo { max-height: 64px; max-width: 200px; object-fit: contain; }
.rir-brand-fallback { font-size: 18px; font-weight: 800; color: #0f172a; }
.rir-title-block { text-align: center; padding: 4px 8px; }
.rir-title-main {
  margin: 0;
  font-size: 11pt;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #0f172a;
  line-height: 1.3;
}
.rir-title-sub { margin: 6px 0 0 0; font-size: 11px; color: #475569; line-height: 1.35; }
.rir-meta-box { font-size: 11px; text-align: right; line-height: 1.5; color: #334155; }
.rir-meta-box strong { display: block; font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
.rir-classic-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px 12px;
  margin-top: 12px;
  font-size: 11px;
}
.rir-classic-grid--2 { grid-template-columns: repeat(2, 1fr); }
.rir-fld label {
  display: block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 2px;
}
.rir-fld span { font-size: 12px; font-weight: 600; color: #0f172a; word-break: break-word; line-height: 1.4; }
/* Documentos: linha1 NF | Fornecedor; linha2 Procedimento | Romaneio; linha3 Sol.compra (esq.); Obs em largura total */
.rir-doc-campos {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 6px 18px;
  margin-top: 0;
  font-size: 11px;
  align-items: start;
  max-width: 32rem;
  width: 100%;
}
.rir-doc-campos__nf { grid-column: 1; grid-row: 1; }
.rir-doc-campos__forn { grid-column: 2; grid-row: 1; }
.rir-doc-campos__proc { grid-column: 1; grid-row: 2; }
.rir-doc-campos__rom { grid-column: 2; grid-row: 2; }
.rir-doc-campos__sol { grid-column: 1; grid-row: 3; }
.rir-doc-campos__full { grid-column: 1 / -1; grid-row: 4; }
.rir-classic-bar {
  margin: 14px 0 8px 0;
  padding: 7px 10px;
  background: #e5e7eb;
  border: 1px solid #94a3b8;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #1e293b;
}
.rir-ins-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin-top: 8px; font-size: 11px; }
.rir-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 0; font-weight: 600; }
.rir-pill.ok { color: #047857; }
.rir-pill.off { color: #94a3b8; }
/* Sem borda dupla no contorno: evita traços verticais fantasmas no PDF (Chrome). */
.rir-classic-table-wrap { margin: 10px 0 14px; overflow: hidden; border: none; background: transparent; }
.rir-classic-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 10.5px;
  border: 1px solid #334155;
  table-layout: auto;
}
.rir-classic-table th {
  background: #e5e7eb;
  color: #0f172a;
  padding: 7px 8px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 9px;
  border-right: 1px solid #64748b;
  border-bottom: 1px solid #334155;
}
/* Alinhamento igual ao PDF de referência: centro nas colunas curtas; esquerda em Código e Descrição */
.rir-classic-table thead th:nth-child(1),
.rir-classic-table thead th:nth-child(3),
.rir-classic-table thead th:nth-child(4),
.rir-classic-table thead th:nth-child(6) {
  text-align: center;
}
.rir-classic-table thead th:nth-child(2),
.rir-classic-table thead th:nth-child(5) {
  text-align: left;
}
.rir-classic-table th:last-child { border-right: none; }
.rir-classic-table td {
  padding: 7px 8px;
  vertical-align: top;
  border-right: 1px solid #94a3b8;
  border-bottom: 1px solid #94a3b8;
}
.rir-classic-table tbody td:nth-child(1),
.rir-classic-table tbody td:nth-child(3),
.rir-classic-table tbody td:nth-child(4),
.rir-classic-table tbody td:nth-child(6) {
  text-align: center;
}
.rir-classic-table tbody td:nth-child(2),
.rir-classic-table tbody td:nth-child(5) {
  text-align: left;
}
.rir-classic-table td:last-child { border-right: none; }
.rir-classic-table tbody tr:last-child td { border-bottom: none; }
.rir-c-item { width: 36px; font-weight: 700; }
.rir-c-q { font-variant-numeric: tabular-nums; width: 56px; }
.rir-c-desc { min-width: 200px; line-height: 1.45; word-break: break-word; }
.rir-c-cert { min-width: 88px; font-weight: 600; }
.rir-empty-row { text-align: center; color: #94a3b8; padding: 16px !important; font-style: italic; }
.rir-block {
  border: 1px solid #cbd5e1;
  padding: 10px 12px;
  margin: 8px 0;
  background: #fafafa;
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
}
.rir-block h3 { margin: 0 0 6px 0; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; }
.rir-laudo-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 8px; }
.rir-laudo-badge { padding: 10px 16px; border-radius: 8px; font-weight: 800; font-size: 12px; display: inline-block; }
.rir-laudo-badge.aprovado { background: #ecfdf5; color: #047857; border: 2px solid #34d399; }
.rir-laudo-badge.reprovado { background: #fef2f2; color: #b91c1c; border: 2px solid #f87171; }
.rir-laudo-badge.obs { background: #fffbeb; color: #b45309; border: 2px solid #fcd34d; }
.rir-laudo-note { font-size: 11px; color: #64748b; margin: 0; max-width: 480px; line-height: 1.45; }
.rir-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 28px; page-break-inside: avoid; }
.rir-sign > div { text-align: center; }
.rir-sign .line { border-top: 1px dashed #64748b; margin: 36px 8px 8px 8px; }
.rir-sign .role { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; font-weight: 800; }
.rir-sign .nome { font-size: 12px; margin-top: 6px; color: #0f172a; font-weight: 600; }
.rir-sign .data { font-size: 10px; color: #94a3b8; margin-top: 3px; }
.rir-foot {
  margin-top: 22px;
  padding-top: 10px;
  border-top: 1px solid #cbd5e1;
  font-size: 9px;
  color: #94a3b8;
  line-height: 1.45;
}
.rir-strip-mini {
  font-size: 10px;
  color: #475569;
  margin: 8px 0 0;
  padding: 6px 8px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
}
/* Fluxo em blocos (sem tabela externa): o Chrome imprime/PDF melhor do que com td unico envolvendo tudo. */
.rir-print-main { display: block; width: 100%; }
/* Mantém assinaturas + nota legal na mesma página (evita 2ª folha só com rodapé) */
.rir-print-sign-foot { display: block; }
@media print {
  @page {
    size: A4;
    margin: 12mm;
  }
  html,
  body.rir-print-body {
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    height: auto !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rir-doc--classic {
    background: #fff !important;
    padding: 0 !important;
    max-width: none !important;
    width: 100% !important;
    /* Mesma base tipográfica da pré-visualização (evita “encolher” no PDF) */
    font-size: 10.5pt !important;
    font-family: 'Segoe UI', 'Calibri', 'Helvetica Neue', Arial, system-ui, sans-serif !important;
    margin: 0 !important;
  }
  .rir-doc-inner {
    border: none !important;
    /* Mantém respiro como na tela; padding 0 deixava o PDF “espremido” e diferente da prévia */
    padding: 18px 16px 12px !important;
    box-shadow: none !important;
    width: 100% !important;
    max-width: none !important;
  }
  .rir-classic-top,
  .rir-meta-box,
  .rir-classic-bar,
  .rir-block,
  .rir-strip-mini,
  .rir-doc-campos,
  .rir-classic-table th,
  .rir-classic-table td,
  .rir-laudo-badge {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .rir-classic-grid {
    width: 100%;
  }
  /* Não forçar largura total: na tela usa max-width 32rem; no PDF tem que ser igual */
  .rir-doc-campos {
    max-width: 32rem;
    width: 100%;
  }
  .rir-classic-table tbody tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .rir-classic-table-wrap {
    overflow: visible !important;
  }
  /* Tabela: mesmas bordas e tipos da tela (sem recolher estilos no engine de impressão) */
  .rir-classic-table {
    width: 100% !important;
    border-collapse: separate !important;
    border-spacing: 0 !important;
    border: 1px solid #334155 !important;
    font-size: 10.5px !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* Menos “respiro” vertical no PDF: evita ultrapassar 1 página por poucos mm */
  .rir-classic-bar {
    margin: 10px 0 6px 0 !important;
    padding: 6px 8px !important;
  }
  .rir-block {
    margin: 6px 0 !important;
    padding: 8px 10px !important;
  }
  .rir-laudo-wrap {
    margin-top: 6px !important;
  }
  .rir-strip-mini {
    margin-top: 6px !important;
    padding: 4px 6px !important;
  }
  .rir-sign {
    margin-top: 14px !important;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .rir-sign .line {
    margin: 22px 8px 6px 8px !important;
  }
  .rir-foot {
    margin-top: 8px !important;
    padding-top: 8px !important;
    page-break-before: avoid !important;
    break-before: avoid !important;
  }
  .rir-print-sign-foot {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
}
</style>
<div class="rir-doc-inner">
  <header class="rir-classic-top">
    <div class="rir-brand">${logoBlock}</div>
    <div class="rir-title-block">
      <h1 class="rir-title-main">Relatorio de Inspecao de Recebimento (RIR)</h1>
      <p class="rir-title-sub">${escapeHtmlRelatorio(escopoLinha)}${localCfg ? ` · ${escapeHtmlRelatorio(localCfg)}` : ''}</p>
    </div>
    <div class="rir-meta-box">
      <div><strong>Nº RIR</strong>${escapeHtmlRelatorio(r.codigo)}</div>
      <div style="margin-top:8px;"><strong>Data</strong>${escapeHtmlRelatorio(formatDatePt(r.dataRegistro))}</div>
      <div style="margin-top:8px;"><strong>Emitido</strong>${escapeHtmlRelatorio(formatDateTimePt())}</div>
    </div>
  </header>
  <div class="rir-print-main">
  <div class="rir-classic-grid">
    <div class="rir-fld"><label>UO (Obra / Depto)</label><span>${escapeHtmlRelatorio(uoExibir) || '—'}</span></div>
    <div class="rir-fld"><label>Local</label><span>${escapeHtmlRelatorio(localExibir) || '—'}</span></div>
    <div class="rir-fld"><label>Contrato Nº</label><span>${escapeHtmlRelatorio(contratoExibir) || '—'}</span></div>
  </div>

  <div class="rir-ins-row">
    <span style="font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#475569;">Inspecao:</span>
    ${mkIns(!!r.inspecaoQuantitativa)} <span>Quantitativa</span>
    ${mkIns(!!r.inspecaoQualitativa)} <span>Qualitativa</span>
    ${mkIns(!!r.inspecaoDimensional)} <span>Dimensional</span>
  </div>

  <div class="rir-classic-bar">Documentos</div>
  <div class="rir-doc-campos">
    <div class="rir-fld rir-doc-campos__nf"><label>Nº Nota Fiscal</label><span>${escapeHtmlRelatorio(r.recebimentoNotaFiscal ?? '') || '—'}</span></div>
    <div class="rir-fld rir-doc-campos__forn"><label>Fornecedor</label><span>${escapeHtmlRelatorio(r.fornecedorNome)}</span></div>
    <div class="rir-fld rir-doc-campos__proc"><label>Nº Procedimento</label><span>${escapeHtmlRelatorio(r.procedimentoNumero)}</span></div>
    <div class="rir-fld rir-doc-campos__rom"><label>Nº Romaneio</label><span>${escapeHtmlRelatorio(r.recebimentoRomaneio ?? '') || '—'}</span></div>
    <div class="rir-fld rir-doc-campos__sol"><label>Sol. compra / Pack-list</label><span>${solCompra ? escapeHtmlRelatorio(solCompra) : '—'}</span></div>
    <div class="rir-fld rir-doc-campos__full"><label>Obs.</label><span>${escapeHtmlRelatorio(r.obsCurta) || '—'}</span></div>
  </div>

  <div class="rir-classic-bar">Material recebido (NF)</div>
  <div class="rir-classic-table-wrap">
    <table class="rir-classic-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>Codigo</th>
          <th>Qtde</th>
          <th>Unid.</th>
          <th>Descricao</th>
          <th>Certificado</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div class="rir-classic-bar">Inspecao de recebimento</div>
  <div class="rir-block">
    <h3>Observacoes da inspecao</h3>
    ${escapeHtmlRelatorio(r.observacoesQc || '—')}
  </div>

  <div class="rir-classic-bar">Laudo</div>
  <div class="rir-laudo-wrap">
    <span class="rir-laudo-badge ${laudo === 'reprovado' ? 'reprovado' : laudo === 'observacoes' ? 'obs' : 'aprovado'}">${escapeHtmlRelatorio(laudoTxt)}</span>
    <p class="rir-laudo-note">Em caso de reprovacao ou conforme observacoes, siga o procedimento interno (segregacao, nova conferencia, etc.).</p>
  </div>

  <div class="rir-strip-mini">
    <strong>Rastreio:</strong> ID recebimento ${refReceb} · ID RIR ${escapeHtmlRelatorio(r.id)} · Status: ${escapeHtmlRelatorio(statusTxt)} · Relatorio v${DOC_VERSION}
  </div>

  <div class="rir-classic-bar">Assinaturas</div>
  <div class="rir-print-sign-foot">
  <div class="rir-sign">
    <div><div class="line"></div><div class="role">Responsavel recebimento</div><div class="nome">${escapeHtmlRelatorio(r.assinaturaRecebimento.nome)}</div><div class="data">${r.assinaturaRecebimento.data ? formatDatePt(r.assinaturaRecebimento.data) : '—'}</div></div>
    <div><div class="line"></div><div class="role">Controle de qualidade</div><div class="nome">${escapeHtmlRelatorio(r.assinaturaCq.nome)}</div><div class="data">${r.assinaturaCq.data ? formatDatePt(r.assinaturaCq.data) : '—'}</div></div>
    <div><div class="line"></div><div class="role">Cliente</div><div class="nome">${escapeHtmlRelatorio(r.assinaturaCliente.nome)}</div><div class="data">${r.assinaturaCliente.data ? formatDatePt(r.assinaturaCliente.data) : '—'}</div></div>
  </div>
  <div class="rir-foot">
    Documento gerado eletronicamente pelo I.S.O PRO Desktop. Conteudo para arquivo e auditoria. Referencia: ${escapeHtmlRelatorio(r.codigo)}.
  </div>
  </div>
  </div>
</div>
</div>`;
}

function montarDocumentoHtmlImpressaoRir(registro: RirRegistro): string {
  const titulo = `I.S.O PRO — RIR ${(registro.codigo || '').trim() || '—'}`;
  const inner = montarHtmlRelatorioRirCompleto(registro);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtmlRelatorio(titulo)}</title>
</head>
<body class="rir-print-body">
${inner}
</body>
</html>`;
}

export function imprimirRirHtml(registro: RirRegistro): boolean {
  return abrirImpressaoHtmlRelatorio(montarDocumentoHtmlImpressaoRir(registro));
}
