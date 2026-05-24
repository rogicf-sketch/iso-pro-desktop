import {
  cssBarraPreVisualizacaoImpressaoHtml,
  escapeHtmlRelatorio,
  htmlBarraPreVisualizacaoImpressao,
  htmlBlocoLogoInstitucional,
  segmentoInstituicaoRodapeEletronico,
  scriptBarraPreVisualizacaoImpressao,
} from '../../../lib/htmlRelatorioInstitucional';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import {
  formatarDataRelatorioFinal,
  preverProximoNumeroRelatorioFinalObra,
  rotuloNumeroRelatorioFinalObra,
} from '../services/relatorioFinalObra.service';
import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';
import type { AnaliseSecaoModuloRfo, ResumoRirCertificados } from '../types/relatorioFinalObraApresentacao.types';
import { analisarRelatorioFinalObra, type ResumoStatusModulo } from './relatorioFinalObraAnalise';
import { montarApresentacaoRelatorioFinalObra } from './relatorioFinalObraInteligencia';

const esc = escapeHtmlRelatorio;

type SecaoRfo = { id: string; num: string; titulo: string; corpo: string };

function cssRelatorioFinalObra(): string {
  return `
    ${cssBarraPreVisualizacaoImpressaoHtml()}
    @page { margin: 18mm 16mm; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      margin: 0; padding: 0; color: #1e293b; font-size: 10.5pt; line-height: 1.55;
      background: #e8ecef;
    }
    .rfo-page { max-width: 210mm; margin: 0 auto; background: #fff; box-shadow: 0 2px 16px rgba(15,23,42,0.06); }
    .rfo-preview-strip {
      display: none;
    }
    @media screen {
      .rfo-preview-strip {
        display: flex; align-items: center; justify-content: space-between; gap: 16px;
        max-width: 210mm; margin: 0 auto; padding: 10px 16px;
        background: #fffbeb; border-bottom: 1px solid #fde68a;
      }
      .rfo-preview-strip__titulo { font-size: 10pt; font-weight: 600; color: #92400e; letter-spacing: 0.02em; }
      .rfo-preview-strip__cliente { font-size: 9pt; color: #64748b; text-align: right; max-width: 42%; line-height: 1.35; }
    }
    .rfo-capa {
      background: #fff; color: #1e293b;
      min-height: auto; box-sizing: border-box;
      display: flex; flex-direction: column;
      padding-bottom: 8px;
    }
    .rfo-capa-head {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;
      padding: 24px 40px 18px;
      border-bottom: 2px solid #16a34a;
    }
    .rfo-capa-brand { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
    .rfo-capa-brand .inst-logo-col { flex: none; min-height: 0; margin: 0; justify-content: flex-start; }
    .rfo-capa-brand .inst-logo-img { max-width: 160px; max-height: 72px; width: auto; height: auto; }
    .rfo-capa-brand .inst-logo-placeholder {
      width: 160px; min-height: 56px; padding: 10px 12px; margin: 0;
      border: 1px dashed #cbd5e1; background: #f8fafc; border-radius: 6px;
    }
    .rfo-capa-brand .inst-logo-hint { font-size: 7.5pt; color: #64748b; }
    .rfo-capa-brand .inst-logo-sub { font-size: 6.5pt; color: #94a3b8; }
    .rfo-capa-docref { text-align: right; flex-shrink: 0; padding-top: 4px; }
    .rfo-capa-docref__label {
      display: block; font-size: 7pt; font-weight: 600; letter-spacing: 0.14em;
      text-transform: uppercase; color: #64748b;
    }
    .rfo-capa-docref__num {
      display: block; margin-top: 6px; font-size: 13pt; font-weight: 700;
      letter-spacing: 0.03em; color: #0f172a;
    }
    .rfo-capa-intro {
      flex: 1; padding: 40px 44px 28px;
      display: flex; flex-direction: column; justify-content: center;
    }
    .rfo-capa-kicker {
      margin: 0 0 12px; font-size: 8pt; letter-spacing: 0.18em; text-transform: uppercase;
      font-weight: 600; color: #16a34a;
    }
    .rfo-capa h1 {
      margin: 0; padding: 0; border: none;
      font-size: 2rem; font-weight: 700; line-height: 1.18;
      letter-spacing: -0.015em; color: #111827;
    }
    .rfo-capa-lead {
      margin: 14px 0 0; max-width: 620px; font-size: 10.5pt; line-height: 1.55; color: #4b5563;
    }
    .rfo-capa-nota-previa {
      margin: 12px 0 0; font-size: 9pt; color: #92400e; font-style: italic;
    }
    .rfo-capa-ficha {
      margin: 0 44px 36px;
      display: grid; grid-template-columns: repeat(3, 1fr);
      border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
      background: #fff;
    }
    .rfo-capa-ficha-item {
      padding: 14px 16px; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;
    }
    .rfo-capa-ficha-item:nth-child(3n) { border-right: none; }
    .rfo-capa-ficha-item:nth-last-child(-n+3) { border-bottom: none; }
    .rfo-capa-ficha dt {
      margin: 0; font-size: 6.8pt; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.07em; color: #94a3b8;
    }
    .rfo-capa-ficha dd {
      margin: 5px 0 0; font-size: 10pt; font-weight: 600; line-height: 1.35; color: #0f172a;
    }
    .rfo-capa-foot {
      display: flex; justify-content: space-between; align-items: center; gap: 16px;
      padding: 14px 44px 28px; font-size: 8pt; color: #94a3b8;
      border-top: 1px solid #f1f5f9;
    }
    .rfo-capa-foot strong { color: #64748b; font-weight: 600; }
    .rfo-body { padding: 32px 40px 44px; }
    .rfo-sec { margin-bottom: 32px; }
    .rfo-sec-title {
      display: flex; align-items: baseline; gap: 10px;
      font-size: 1rem; font-weight: 700; color: #111827;
      margin: 0 0 12px; padding: 0 0 8px;
      border-bottom: 2px solid #111827;
    }
    .rfo-sec-num {
      flex: 0 0 auto; font-size: 9pt; font-weight: 700; color: #16a34a;
      letter-spacing: 0.06em;
    }
    .rfo-tabela {
      width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 4px 0 0;
    }
    .rfo-tabela th {
      background: #f9fafb; color: #374151; padding: 9px 12px; text-align: left;
      font-weight: 600; border-bottom: 2px solid #111827;
    }
    .rfo-tabela td {
      padding: 8px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; color: #1f2937;
    }
    .rfo-tabela tbody tr:nth-child(even) td { background: #fafafa; }
    .rfo-td-num { text-align: right; font-weight: 600; white-space: nowrap; }
    .rfo-td-modulo { font-weight: 600; vertical-align: top; background: #fff !important; }
    .rfo-td-modulo span { display: block; font-size: 8pt; font-weight: 500; color: #6b7280; margin-top: 2px; }
    .rfo-tabela--panorama td:first-child { width: 22%; }
    .rfo-sintese {
      background: #fafafa; border-left: 4px solid #16a34a;
      padding: 16px 20px; border-radius: 0 6px 6px 0; margin-bottom: 16px;
    }
    .rfo-sintese p { margin: 0 0 12px; text-align: justify; }
    .rfo-sintese p:last-child { margin-bottom: 0; }
    .rfo-modulos-ia { display: flex; flex-direction: column; gap: 14px; }
    .rfo-modulo-ia {
      border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 18px;
      background: linear-gradient(180deg, #fafbfc 0%, #fff 100%);
    }
    .rfo-modulo-ia h3 {
      margin: 0 0 10px; font-size: 10.5pt; font-weight: 700; color: #0f172a;
      padding-bottom: 6px; border-bottom: 2px solid #e0f2fe;
    }
    .rfo-modulo-ia p { margin: 0 0 10px; text-align: justify; font-size: 10pt; color: #334155; }
    .rfo-modulo-ia p:last-child { margin-bottom: 0; }
    .rfo-badge-ia {
      display: inline-block; font-size: 8.5pt; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.06em; color: #166534; background: #f0fdf4;
      padding: 4px 10px; border-radius: 4px; margin-bottom: 12px;
      border: 1px solid #bbf7d0;
    }
    .rfo-alertas { display: flex; flex-direction: column; gap: 8px; }
    .rfo-alerta {
      padding: 10px 14px; border-radius: 8px; font-size: 10pt; font-weight: 500;
    }
    .rfo-alerta--critico { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .rfo-alerta--atencao { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
    .rfo-alerta--ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
    .rfo-kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 8px; }
    .rfo-kpi {
      background: #fff;
      border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 12px; text-align: center;
      box-shadow: 0 1px 3px rgba(15,23,42,0.06);
    }
    .rfo-kpi strong { display: block; font-size: 1.55rem; color: #0f172a; font-weight: 800; line-height: 1.1; }
    .rfo-kpi span { display: block; font-size: 8.5pt; color: #64748b; margin-top: 4px; line-height: 1.3; }
    .rfo-mod-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .rfo-mod-card {
      border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; background: #fff;
    }
    .rfo-mod-card h4 { margin: 0 0 10px; font-size: 10pt; color: #475569; font-weight: 600; }
    .rfo-bar-row { margin-bottom: 8px; }
    .rfo-bar-label { display: flex; justify-content: space-between; font-size: 9pt; margin-bottom: 3px; color: #334155; }
    .rfo-bar-track { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
    .rfo-bar-fill { height: 100%; background: #16a34a; border-radius: 4px; }
    .rfo-rir-panel {
      display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px;
      background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px;
    }
    .rfo-rir-stat { text-align: center; padding: 12px; }
    .rfo-rir-stat strong { display: block; font-size: 1.6rem; color: #0f172a; }
    .rfo-rir-stat--ok strong { color: #059669; }
    .rfo-rir-stat--warn strong { color: #d97706; }
    .rfo-rir-stat span { font-size: 9pt; color: #64748b; }
    .rfo-destaque-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    .rfo-destaque-table th {
      background: #f8fafc; color: #334155; padding: 10px 12px; text-align: left; font-weight: 600;
      border-bottom: 2px solid #16a34a;
    }
    .rfo-destaque-table td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr.rfo-sev-critico td { background: #fef2f2; }
    tr.rfo-sev-atencao td { background: #fffbeb; }
    tr.rfo-sev-info td { background: #fafafa; }
    .rfo-rf-card {
      border: 1px solid #cbd5e1; border-radius: 12px; margin-bottom: 20px; overflow: hidden;
      page-break-inside: avoid;
    }
    .rfo-rf-head {
      background: #f8fafc; color: #0f172a; padding: 14px 18px;
      border-bottom: 1px solid #e2e8f0;
    }
    .rfo-rf-head h4 { margin: 0 0 6px; font-size: 11pt; }
    .rfo-rf-motivos { font-size: 9pt; opacity: 0.9; margin: 0; }
    .rfo-rf-motivos li { margin: 2px 0; }
    .rfo-rf-fotos {
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 14px; background: #fff;
    }
    .rfo-rf-foto img {
      width: 100%; max-height: 200px; object-fit: cover; border-radius: 6px; border: 1px solid #e2e8f0;
    }
    .rfo-rf-legenda { font-size: 8.5pt; color: #475569; margin: 6px 0 0; }
    .rfo-nota { font-size: 9pt; color: #64748b; margin: 8px 0 0; }
    .rfo-rodape {
      margin-top: 32px; padding-top: 14px; border-top: 2px solid #e2e8f0;
      font-size: 8.5pt; color: #64748b; text-align: center;
    }
    .rfo-aviso-excel {
      font-size: 9pt; background: #eff6ff; border: 1px solid #93c5fd;
      padding: 12px 14px; border-radius: 8px; margin-top: 20px;
    }
.rfo-vazio {
      padding: 10px 12px; border-radius: 8px; font-size: 9.5pt; color: #475569;
      background: #f8fafc; border: 1px dashed #cbd5e1; margin: 0;
    }
    .rfo-indice {
      margin-bottom: 26px; padding: 16px 18px;
      background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
      border: 1px solid #e2e8f0; border-radius: 12px;
      box-shadow: 0 1px 3px rgba(15,23,42,0.04);
    }
    .rfo-indice h2 {
      margin: 0 0 10px; font-size: 10pt; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; color: #64748b;
    }
    .rfo-indice ol { margin: 0; padding: 0 0 0 1.25rem; columns: 2; column-gap: 28px; }
    .rfo-indice li { margin: 4px 0; font-size: 9.5pt; break-inside: avoid; }
    .rfo-indice a { color: #111827; text-decoration: none; font-weight: 500; }
    .rfo-declaracao-box {
      padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fafbfc;
    }
    .rfo-assinatura { margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .rfo-assinatura-linha { border-top: 1px solid #334155; padding-top: 6px; font-size: 9pt; color: #334155; }
    @media print {
      body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .rfo-page { max-width: none; box-shadow: none; }
      .rfo-preview-strip { display: none !important; }
      .rfo-capa { page-break-after: always; break-after: page; padding-bottom: 0; }
      .rfo-sec { page-break-inside: auto; break-inside: auto; orphans: 3; widows: 3; }
      .rfo-sec-title { break-after: avoid; page-break-after: avoid; }
      .rfo-tabela, .rfo-rir-panel, .rfo-rf-card, .rfo-modulo-ia, .rfo-indice {
        break-inside: avoid; page-break-inside: avoid;
      }
      .rfo-tabela tr { break-inside: avoid; page-break-inside: avoid; }
      .rfo-destaque-table thead { display: table-header-group; }
      .rfo-destaque-table tr { break-inside: avoid; page-break-inside: avoid; }
    }
  `;
}

function htmlTabelaIndicadores(
  kpis: { v: number; l: string; s: string }[],
): string {
  const rows = kpis
    .map(
      (k) =>
        `<tr><td>${esc(k.l)}</td><td class="rfo-td-num">${k.v}</td><td>${esc(k.s)}</td></tr>`,
    )
    .join('');
  return `<table class="rfo-tabela rfo-tabela--indicadores">
    <thead><tr><th>Indicador</th><th>Quantidade</th><th>Observação</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function htmlTabelaPanorama(mods: ResumoStatusModulo[]): string {
  const ativos = mods.filter((m) => m.total > 0);
  if (ativos.length === 0) {
    return '<p class="rfo-vazio">Sem registros operacionais para resumo neste projeto.</p>';
  }
  const rows = ativos
    .flatMap((mod) =>
      mod.linhas.map(
        (l, idx) =>
          `<tr>
            ${idx === 0 ? `<td rowspan="${mod.linhas.length}" class="rfo-td-modulo">${esc(mod.modulo)}<br /><span>${mod.total} reg.</span></td>` : ''}
            <td>${esc(l.rotulo)}</td>
            <td class="rfo-td-num">${l.quantidade}</td>
            <td class="rfo-td-num">${l.percentual}%</td>
          </tr>`,
      ),
    )
    .join('');
  return `<table class="rfo-tabela rfo-tabela--panorama">
    <thead><tr><th>Módulo</th><th>Situação</th><th>Qtd.</th><th>%</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}


function htmlPainelRir(rc: ResumoRirCertificados): string {
  const pct =
    rc.linhasTotal > 0 ? Math.round((rc.linhasComCertificado / rc.linhasTotal) * 100) : 0;
  return `
    <div class="rfo-rir-panel">
      <div>
        <div class="rfo-rir-stat rfo-rir-stat--ok">
          <strong>${rc.linhasComCertificado}</strong>
          <span>linhas com certificado (${pct}%)</span>
        </div>
        <div class="rfo-rir-stat rfo-rir-stat--warn" style="margin-top:12px">
          <strong>${rc.linhasSemCertificado}</strong>
          <span>linhas sem certificado / N/A</span>
        </div>
        <p class="rfo-nota" style="margin-top:14px;text-align:center">
          ${rc.rirComTodosItensCertificados} RIR com certificado em todos os itens ·
          ${rc.rirComLacunaCertificado} com lacuna
        </p>
      </div>
      <div>
        <div class="rfo-bar-row">
          <div class="rfo-bar-label"><span>Laudo aprovado</span><span>${rc.laudoAprovado}</span></div>
          <div class="rfo-bar-track"><div class="rfo-bar-fill" style="width:${rc.rirTotal ? (rc.laudoAprovado / rc.rirTotal) * 100 : 0}%"></div></div>
        </div>
        <div class="rfo-bar-row">
          <div class="rfo-bar-label"><span>Com observações</span><span>${rc.laudoObservacoes}</span></div>
          <div class="rfo-bar-track"><div class="rfo-bar-fill" style="width:${rc.rirTotal ? (rc.laudoObservacoes / rc.rirTotal) * 100 : 0}%;background:linear-gradient(90deg,#d97706,#fbbf24)"></div></div>
        </div>
        <div class="rfo-bar-row">
          <div class="rfo-bar-label"><span>Reprovado</span><span>${rc.laudoReprovado}</span></div>
          <div class="rfo-bar-track"><div class="rfo-bar-fill" style="width:${rc.rirTotal ? (rc.laudoReprovado / rc.rirTotal) * 100 : 0}%;background:linear-gradient(90deg,#dc2626,#f87171)"></div></div>
        </div>
        <p class="rfo-nota">${rc.rirTotal} RIR no projeto (${rc.rirCancelados} cancelado(s)) · ${rc.linhasTotal} linhas de material inspecionadas</p>
      </div>
    </div>
  `;
}

function htmlRfDestaques(dados: RelatorioFinalObraDados): string {
  const rf = dados.apresentacao?.rfDestaques ?? [];
  if (rf.length === 0) {
    if (dados.totais.relatoriosFotograficos === 0) {
      return '<p class="rfo-vazio">Nenhum relatório fotográfico registrado neste projeto.</p>';
    }
    return '<p class="rfo-vazio">Relatórios fotográficos existentes, porém sem evidências classificadas como críticas para esta apresentação. Consulte os RF individuais no sistema.</p>';
  }
  return rf
    .map((r) => {
      const fotosHtml = r.fotos.length
        ? `<div class="rfo-rf-fotos">${r.fotos
            .map(
              (f) =>
                `<div><img src="${esc(f.dataUrl)}" alt="" /><p class="rfo-rf-legenda">${esc(f.legenda)}</p></div>`,
            )
            .join('')}</div>`
        : '<p class="rfo-nota" style="padding:14px">Sem imagens carregadas para exibição neste relatório.</p>';
      const motivos = r.motivos.map((m) => `<li>${esc(m)}</li>`).join('');
      return `
        <article class="rfo-rf-card">
          <header class="rfo-rf-head">
            <h4>${esc(r.numeroRelatorio)} — ${esc(r.titulo)}</h4>
            <p class="rfo-rf-motivos"><ul>${motivos}</ul></p>
            <p class="rfo-nota" style="color:#cbd5e1;margin-top:8px">${esc(r.fornecedor || '—')} · NF ${esc(r.notaFiscal || '—')} · ${esc(formatarDataRelatorioFinal(r.salvoEm))}</p>
          </header>
          ${fotosHtml}
        </article>`;
    })
    .join('');
}

function resolverAnaliseDestaques(dados: RelatorioFinalObraDados) {
  return dados.analiseEnriquecida ?? analisarRelatorioFinalObra(dados);
}

function htmlAnalisePorModulo(secoes: AnaliseSecaoModuloRfo[]): string {
  if (secoes.length === 0) return '';
  const blocos = secoes
    .map((s) => {
      const ps = s.paragrafos.map((p) => `<p>${esc(p)}</p>`).join('');
      return `<article class="rfo-modulo-ia"><h3>${esc(s.titulo)}</h3>${ps}</article>`;
    })
    .join('');
  return `<div class="rfo-modulos-ia">${blocos}</div>`;
}

function htmlDestaquesTabela(dados: RelatorioFinalObraDados): string {
  const analise = resolverAnaliseDestaques(dados);
  const dest = analise.destaques;
  if (dest.length === 0) {
    return '<p class="rfo-vazio">Nenhuma ocorrência crítica automática identificada no período analisado.</p>';
  }
  const rows = dest
    .map((d) => {
      const cls = d.severidade === 'critico' ? 'rfo-sev-critico' : d.severidade === 'atencao' ? 'rfo-sev-atencao' : 'rfo-sev-info';
      return `<tr class="${cls}">
        <td>${esc(formatarDataRelatorioFinal(d.dataIso))}</td>
        <td>${esc(d.modulo)}</td>
        <td>${esc(d.referencia)}</td>
        <td>${esc(d.motivo)}</td>
      </tr>`;
    })
    .join('');
  return `<table class="rfo-destaque-table"><thead><tr>
    <th>Data</th><th>Módulo</th><th>Referência</th><th>Ocorrência</th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function htmlIndiceRfo(secoes: SecaoRfo[]): string {
  const itens = secoes.map((x) => `<li><a href="#${x.id}">${esc(x.num)} — ${esc(x.titulo)}</a></li>`).join('');
  return `<nav class="rfo-indice" aria-label="Índice"><h2>Índice</h2><ol>${itens}</ol></nav>`;
}

function htmlSecoesRfo(secoes: SecaoRfo[]): string {
  return secoes
    .map(
      (x) => `
        <section class="rfo-sec" id="${x.id}">
          <h2 class="rfo-sec-title"><span class="rfo-sec-num">${esc(x.num)}</span>${esc(x.titulo)}</h2>
          ${x.corpo}
        </section>`,
    )
    .join('');
}

export function montarHtmlRelatorioFinalObra(dados: RelatorioFinalObraDados, opts?: { incluirBarraPreVisualizacao?: boolean }): string {
  const cfg = readConfiguracoes();
  const logo = resolverUrlLogoInstitucionalParaHtmlImpresso(cfg.logoInstitucionalUrl);
  const segRodape = segmentoInstituicaoRodapeEletronico(dados.contexto.rodapeNome, dados.contexto.rodapeCnpj);
  const geradoFmt = formatarDataRelatorioFinal(dados.contexto.geradoEm);
  const barra = opts?.incluirBarraPreVisualizacao !== false ? htmlBarraPreVisualizacaoImpressao() : '';
  const scriptBarra = opts?.incluirBarraPreVisualizacao !== false ? scriptBarraPreVisualizacaoImpressao() : '';
  const { contexto, totais } = dados;
  const ap = dados.apresentacao ?? montarApresentacaoRelatorioFinalObra(dados, []);
  const analise = resolverAnaliseDestaques(dados);
  const iaUsada = ap.ia?.utilizada === true;
  const badgeIa = iaUsada
    ? `Análise assistida · ${ap.ia?.modelo ?? 'IA'}`
    : ap.ia?.erro
      ? 'Análise automática I.S.O PRO (IA indisponível — regras locais)'
      : 'Análise automática I.S.O PRO';
  const notaDestaques = iaUsada
    ? 'Destaques priorizados pela análise assistida e regras do sistema (máx. ' + analise.destaques.length + ' registros).'
    : `Selecionadas automaticamente: cancelamentos, divergências, NC, estornos e pendências (máx. ${analise.destaques.length} registros).`;
  const rotuloNumero = rotuloNumeroRelatorioFinalObra(contexto);
  const proximoOficial = preverProximoNumeroRelatorioFinalObra();
  const numeroCapa = contexto.registrado
    ? `Nº ${rotuloNumero}`
    : `${rotuloNumero} · próximo oficial: ${proximoOficial}`;
  const badgeDocLabel = contexto.registrado ? '✓ Documento executivo' : 'Pré-visualização';
  const badgeDocNum = contexto.registrado ? rotuloNumero : proximoOficial;

  const kpis = [
    { v: totais.documentos, l: 'Planejamento', s: `${totais.documentosCancelados} cancel.` },
    { v: totais.recebimentos, l: 'Recebimentos', s: `${totais.recebimentosCancelados} cancel.` },
    { v: totais.rir, l: 'RIR', s: `${ap.rirCertificados.laudoReprovado} reprov.` },
    { v: totais.rnc, l: 'RNC', s: `${totais.rnc - totais.rncCancelados} ativas` },
    { v: totais.atendimentos, l: 'Atendimentos', s: `${totais.atendimentosEstornados} estorn.` },
    { v: totais.inventarios, l: 'Inventários', s: `${totais.inventariosAbertos} abertos` },
    { v: totais.relatoriosFotograficos, l: 'Rel. fotográficos', s: `${ap.rfDestaques.length} em destaque` },
    { v: totais.materiais, l: 'Materiais', s: 'cadastro' },
  ];

  const kpiHtml = htmlTabelaIndicadores(kpis);

  const sinteseParagrafos = ap.sintese.paragrafos.map((p) => `<p>${esc(p)}</p>`).join('');
  const alertasHtml = ap.sintese.alertas
    .map((a) => `<div class="rfo-alerta rfo-alerta--${a.nivel}">${esc(a.texto)}</div>`)
    .join('');

  const panoramaHtml = htmlTabelaPanorama(analise.resumosStatus);

  const secoesModulo = ap.secoesModulo ?? [];
  const htmlSecoesModulo = htmlAnalisePorModulo(secoesModulo);
  const temAnalisePorArea = htmlSecoesModulo.length > 0;
  const numSec = (() => {
    let i = 0;
    return () => {
      i += 1;
      return String(i).padStart(2, '0');
    };
  })();

  const secoes: SecaoRfo[] = [
    {
      id: 'rfo-sintese',
      num: numSec(),
      titulo: 'Síntese executiva',
      corpo: `
        <span class="rfo-badge-ia">${esc(badgeIa)}</span>
        ${ap.ia?.notaAnalise ? `<p class="rfo-nota">${esc(ap.ia.notaAnalise)}</p>` : ''}
        <div class="rfo-sintese">${sinteseParagrafos}</div>
        <div class="rfo-alertas">${alertasHtml}</div>`,
    },
  ];

  if (temAnalisePorArea) {
    secoes.push({
      id: 'rfo-analise-area',
      num: numSec(),
      titulo: 'Análise por área',
      corpo: `<p class="rfo-nota">Comentários por módulo (recebimentos, RIR, RNC, atendimentos, etc.).</p>${htmlSecoesModulo}`,
    });
  }

  secoes.push(
    {
      id: 'rfo-indicadores',
      num: numSec(),
      titulo: 'Indicadores da obra',
      corpo: kpiHtml,
    },
    {
      id: 'rfo-panorama',
      num: numSec(),
      titulo: 'Panorama por módulo',
      corpo: panoramaHtml,
    },
    {
      id: 'rfo-rir',
      num: numSec(),
      titulo: 'RIR — certificados e laudos',
      corpo: htmlPainelRir(ap.rirCertificados),
    },
    {
      id: 'rfo-destaques',
      num: numSec(),
      titulo: 'Ocorrências em destaque',
      corpo: `<p class="rfo-nota">${esc(notaDestaques)}</p>${htmlDestaquesTabela(dados)}`,
    },
    {
      id: 'rfo-fotos',
      num: numSec(),
      titulo: 'Evidências fotográficas prioritárias',
      corpo: `<p class="rfo-nota">Relatórios fotográficos ranqueados por relevância (RNC, divergências, laudo RIR e termos de ocorrência).</p>${htmlRfDestaques(dados)}`,
    },
    {
      id: 'rfo-declaracao',
      num: numSec(),
      titulo: 'Declaração de encerramento',
      corpo: `
        <div class="rfo-declaracao-box">
          <p>Este relatório certifica o encerramento documental do projeto com base nos dados do I.S.O PRO. O documento tem caráter <strong>executivo</strong>, elaborado para apresentação ao cliente. A trilha completa permanece no sistema e no export <strong>Excel (ZIP)</strong>.</p>
          <p class="rfo-aviso-excel">Listagem integral de todas as linhas: exporte o pacote Excel na tela do Relatório Final de Obra.</p>
          <div class="rfo-assinatura">
            <div><div class="rfo-assinatura-linha">Responsável técnico / empresa</div></div>
            <div><div class="rfo-assinatura-linha">Cliente / fiscalização — data: ___/___/______</div></div>
          </div>
        </div>`,
    },
  );

  const chromeCliente = esc(contexto.cliente || contexto.projeto || '—');
  const logoCapa = logo ? htmlBlocoLogoInstitucional(logo, false) : '';
  const previewStrip =
    opts?.incluirBarraPreVisualizacao !== false && !contexto.registrado
      ? `<div class="rfo-preview-strip" aria-hidden="true">
          <span class="rfo-preview-strip__titulo">Pré-visualização — documento ainda não registrado</span>
          <span class="rfo-preview-strip__cliente">${chromeCliente}</span>
        </div>`
      : '';

  const corpo = `
    ${barra}
    ${previewStrip}
    <div class="rfo-page">
      <header class="rfo-capa">
        <div class="rfo-capa-head">
          <div class="rfo-capa-brand">${logoCapa}</div>
          <div class="rfo-capa-docref">
            <span class="rfo-capa-docref__label">${esc(badgeDocLabel)}</span>
            <span class="rfo-capa-docref__num">${esc(badgeDocNum)}</span>
          </div>
        </div>
        <div class="rfo-capa-intro">
          <p class="rfo-capa-kicker">Documento executivo · encerramento de obra</p>
          <h1>Relatório Final de Obra</h1>
          <p class="rfo-capa-lead">Apresentação institucional ao cliente — síntese da operação, indicadores de desempenho e evidências relevantes do projeto.</p>
          ${!contexto.registrado ? `<p class="rfo-capa-nota-previa">${esc(numeroCapa)}</p>` : ''}
        </div>
        <dl class="rfo-capa-ficha">
          <div class="rfo-capa-ficha-item"><dt>Cliente / UO</dt><dd>${esc(contexto.cliente || '—')}</dd></div>
          <div class="rfo-capa-ficha-item"><dt>Projeto</dt><dd>${esc(contexto.projeto || '—')}</dd></div>
          <div class="rfo-capa-ficha-item"><dt>Contrato / CNPJ</dt><dd>${esc(contexto.contrato || '—')}</dd></div>
          <div class="rfo-capa-ficha-item"><dt>Local</dt><dd>${esc(contexto.local || '—')}</dd></div>
          <div class="rfo-capa-ficha-item"><dt>Emitido em</dt><dd>${esc(geradoFmt)}</dd></div>
          <div class="rfo-capa-ficha-item"><dt>Modo</dt><dd>${analise.usarModoResumido ? 'Executivo (alto volume)' : 'Completo'}</dd></div>
        </dl>
        <div class="rfo-capa-foot">
          <span><strong>I.S.O PRO</strong> · Gestão de Materiais</span>
          <span>${esc(geradoFmt)}${segRodape}</span>
        </div>
      </header>

      <main class="rfo-body">
        ${htmlIndiceRfo(secoes)}
        ${htmlSecoesRfo(secoes)}
        <footer class="rfo-rodape">
          <p>I.S.O PRO · Relatório Final de Obra · ${esc(rotuloNumero)} · ${esc(geradoFmt)}${segRodape}</p>
        </footer>
      </main>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório Final de Obra — ${esc(rotuloNumero)}</title>
  <style>${cssRelatorioFinalObra()}</style>
</head>
<body>
${corpo}
${scriptBarra}
</body>
</html>`;
}

