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

function cssRelatorioFinalObra(): string {
  return `
    ${cssBarraPreVisualizacaoImpressaoHtml()}
    @page { margin: 18mm 16mm; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      margin: 0; padding: 0; color: #0f172a; font-size: 10.5pt; line-height: 1.55;
      background: #f1f5f9;
    }
    .rfo-page { max-width: 210mm; margin: 0 auto; background: #fff; }
    .rfo-capa {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 55%, #0c4a6e 100%);
      color: #f8fafc; padding: 36px 40px 32px; border-radius: 0 0 12px 12px;
    }
    .rfo-capa-kicker { font-size: 9pt; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.85; margin: 0 0 8px; }
    .rfo-capa h1 { font-size: 1.75rem; font-weight: 700; margin: 0 0 8px; border: none; color: #fff; }
    .rfo-capa-sub { font-size: 11pt; opacity: 0.9; margin: 0 0 20px; max-width: 520px; }
    .rfo-capa-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 28px; font-size: 10pt; }
    .rfo-capa-meta dt { font-weight: 600; opacity: 0.75; margin: 0; }
    .rfo-capa-meta dd { margin: 2px 0 0; font-weight: 500; }
    .rfo-capa-numero {
      display: inline-block; margin-top: 18px; padding: 8px 16px;
      background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.25);
      border-radius: 8px; font-size: 11pt; font-weight: 600;
    }
    .rfo-body { padding: 28px 36px 40px; }
    .rfo-sec { margin-bottom: 28px; }
    .rfo-sec-title {
      font-size: 1.05rem; font-weight: 700; color: #0f172a;
      margin: 0 0 12px; padding-bottom: 8px; border-bottom: 3px solid #0284c7;
    }
    .rfo-sec-num { color: #0284c7; margin-right: 6px; }
    .rfo-sintese {
      background: #f8fafc; border-left: 4px solid #0284c7;
      padding: 16px 20px; border-radius: 0 8px 8px 0; margin-bottom: 16px;
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
      letter-spacing: 0.06em; color: #0369a1; background: #e0f2fe;
      padding: 4px 10px; border-radius: 999px; margin-bottom: 12px;
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
      background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
      border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 12px; text-align: center;
    }
    .rfo-kpi strong { display: block; font-size: 1.5rem; color: #0284c7; font-weight: 700; }
    .rfo-kpi span { display: block; font-size: 8.5pt; color: #64748b; margin-top: 4px; line-height: 1.3; }
    .rfo-mod-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .rfo-mod-card {
      border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; background: #fff;
    }
    .rfo-mod-card h4 { margin: 0 0 10px; font-size: 10pt; color: #475569; font-weight: 600; }
    .rfo-bar-row { margin-bottom: 8px; }
    .rfo-bar-label { display: flex; justify-content: space-between; font-size: 9pt; margin-bottom: 3px; color: #334155; }
    .rfo-bar-track { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
    .rfo-bar-fill { height: 100%; background: linear-gradient(90deg, #0284c7, #38bdf8); border-radius: 4px; }
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
      background: #0f172a; color: #f8fafc; padding: 10px 12px; text-align: left; font-weight: 600;
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
      background: #0f172a; color: #f8fafc; padding: 14px 18px;
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
    @media print {
      body { background: #fff; }
      .rfo-page { max-width: none; }
      .rfo-sec { page-break-inside: avoid; }
      .rfo-sec--quebra { page-break-before: always; }
    }
  `;
}

function htmlBarrasResumo(mod: ResumoStatusModulo): string {
  if (mod.total === 0) return '<p class="rfo-nota">Sem registros.</p>';
  const max = Math.max(...mod.linhas.map((l) => l.quantidade), 1);
  const bars = mod.linhas
    .map((l) => {
      const w = Math.round((l.quantidade / max) * 100);
      return `<div class="rfo-bar-row">
        <div class="rfo-bar-label"><span>${esc(l.rotulo)}</span><span>${l.quantidade} (${l.percentual}%)</span></div>
        <div class="rfo-bar-track"><div class="rfo-bar-fill" style="width:${w}%"></div></div>
      </div>`;
    })
    .join('');
  return `<div class="rfo-mod-card"><h4>${esc(mod.modulo)} · ${mod.total} registro(s)</h4>${bars}</div>`;
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
      return '<p class="rfo-nota">Nenhum relatório fotográfico registrado neste projeto.</p>';
    }
    return '<p class="rfo-nota">Relatórios fotográficos existentes, porém sem evidências classificadas como críticas para esta apresentação. Consulte os RF individuais no sistema.</p>';
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
    return '<p class="rfo-nota">Nenhuma ocorrência crítica automática identificada.</p>';
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
  const numeroCapa = contexto.registrado
    ? `Nº ${rotuloNumero}`
    : `${rotuloNumero} · próximo oficial: ${preverProximoNumeroRelatorioFinalObra()}`;

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

  const kpiHtml = kpis
    .map((k) => `<div class="rfo-kpi"><strong>${k.v}</strong><span>${esc(k.l)}</span><span>${esc(k.s)}</span></div>`)
    .join('');

  const sinteseParagrafos = ap.sintese.paragrafos.map((p) => `<p>${esc(p)}</p>`).join('');
  const alertasHtml = ap.sintese.alertas
    .map((a) => `<div class="rfo-alerta rfo-alerta--${a.nivel}">${esc(a.texto)}</div>`)
    .join('');

  const modCards = analise.resumosStatus
    .filter((m) => m.total > 0)
    .map(htmlBarrasResumo)
    .join('');

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
  const nSintese = numSec();
  const nAnaliseArea = temAnalisePorArea ? numSec() : null;
  const nKpi = numSec();
  const nPanorama = numSec();
  const nRir = numSec();
  const nDestaques = numSec();
  const nRf = numSec();
  const nDeclaracao = numSec();

  const secaoAnalisePorArea = temAnalisePorArea
    ? `
        <section class="rfo-sec rfo-sec--quebra">
          <h2 class="rfo-sec-title"><span class="rfo-sec-num">${nAnaliseArea}</span>Análise por área</h2>
          <p class="rfo-nota">Comentários por módulo elaborados pela análise assistida (recebimentos, RIR, RNC, atendimentos, etc.).</p>
          ${htmlSecoesModulo}
        </section>`
    : '';

  const corpo = `
    ${barra}
    <div class="rfo-page">
      <header class="rfo-capa">
        <div style="display:flex;gap:24px;align-items:flex-start;justify-content:space-between">
          ${logo ? `<div style="flex:0 0 140px">${htmlBlocoLogoInstitucional(logo)}</div>` : ''}
          <div style="flex:1">
            <p class="rfo-capa-kicker">I.S.O PRO · Gestão de materiais</p>
            <h1>Relatório Final de Obra</h1>
            <p class="rfo-capa-sub">Documento executivo para apresentação ao cliente — síntese inteligente da operação e evidências relevantes</p>
            <span class="rfo-capa-numero">${esc(numeroCapa)}</span>
          </div>
        </div>
        <dl class="rfo-capa-meta" style="margin-top:24px">
          <div><dt>Cliente / UO</dt><dd>${esc(contexto.cliente || '—')}</dd></div>
          <div><dt>Projeto</dt><dd>${esc(contexto.projeto || '—')}</dd></div>
          <div><dt>Contrato</dt><dd>${esc(contexto.contrato || '—')}</dd></div>
          <div><dt>Local</dt><dd>${esc(contexto.local || '—')}</dd></div>
          <div><dt>Emitido em</dt><dd>${esc(geradoFmt)}</dd></div>
          <div><dt>Modo</dt><dd>${analise.usarModoResumido ? 'Executivo (alto volume)' : 'Completo'}</dd></div>
        </dl>
      </header>

      <main class="rfo-body">
        <section class="rfo-sec">
          <h2 class="rfo-sec-title"><span class="rfo-sec-num">${nSintese}</span>Síntese executiva</h2>
          <span class="rfo-badge-ia">${esc(badgeIa)}</span>
          ${ap.ia?.notaAnalise ? `<p class="rfo-nota">${esc(ap.ia.notaAnalise)}</p>` : ''}
          <div class="rfo-sintese">${sinteseParagrafos}</div>
          <div class="rfo-alertas">${alertasHtml}</div>
        </section>
        ${secaoAnalisePorArea}

        <section class="rfo-sec">
          <h2 class="rfo-sec-title"><span class="rfo-sec-num">${nKpi}</span>Indicadores da obra</h2>
          <div class="rfo-kpi-row">${kpiHtml}</div>
        </section>

        <section class="rfo-sec rfo-sec--quebra">
          <h2 class="rfo-sec-title"><span class="rfo-sec-num">${nPanorama}</span>Panorama por módulo</h2>
          <div class="rfo-mod-grid">${modCards}</div>
        </section>

        <section class="rfo-sec">
          <h2 class="rfo-sec-title"><span class="rfo-sec-num">${nRir}</span>RIR — certificados e laudos</h2>
          ${htmlPainelRir(ap.rirCertificados)}
        </section>

        <section class="rfo-sec rfo-sec--quebra">
          <h2 class="rfo-sec-title"><span class="rfo-sec-num">${nDestaques}</span>Ocorrências em destaque</h2>
          <p class="rfo-nota">${esc(notaDestaques)}</p>
          ${htmlDestaquesTabela(dados)}
        </section>

        <section class="rfo-sec rfo-sec--quebra">
          <h2 class="rfo-sec-title"><span class="rfo-sec-num">${nRf}</span>Evidências fotográficas prioritárias</h2>
          <p class="rfo-nota">Relatórios fotográficos ranqueados por relevância (vínculo a RNC, divergências, laudo RIR e termos de ocorrência).</p>
          ${htmlRfDestaques(dados)}
        </section>

        <section class="rfo-sec">
          <h2 class="rfo-sec-title"><span class="rfo-sec-num">${nDeclaracao}</span>Declaração de encerramento</h2>
          <p>Este relatório certifica o encerramento documental do projeto com base nos dados do I.S.O PRO Desktop. O presente documento tem caráter <strong>executivo</strong>, elaborado para apresentação. A trilha completa de registros permanece no sistema e no export <strong>Excel (ZIP)</strong>.</p>
          <p class="rfo-aviso-excel">Listagem integral de todas as linhas (milhares de registros, se aplicável): exporte o pacote Excel na tela do Relatório Final de Obra.</p>
        </section>

        <footer class="rfo-rodape">
          <p>I.S.O PRO Desktop · Relatório Final de Obra · ${esc(rotuloNumero)} · ${esc(geradoFmt)}${segRodape}</p>
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

