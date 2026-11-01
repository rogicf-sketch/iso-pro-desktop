import { imprimirRelatorioProfissional, nomeArquivoRelatorioPdf } from '../../../lib/relatorioProfissional';
import { montarDocumentoHtmlInstitucionalPaged } from '../../../lib/relatorioPagedDocument';
import type { RelatorioPdfMeta } from '../../../lib/relatorioPdfMeta';
import { escapeHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import {
  cssLogoInstitucionalImpressaoDaConfig,
  resolverUrlLogoInstitucionalParaHtmlImpresso,
} from '../../../lib/logoInstitucional';
import {
  cssRodapeInstitucionalControle,
  dataUrlQrDocumentoControle,
  htmlRodapeInstitucionalControle,
} from '../../../lib/relatorioDocControle';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { hydrateRncRegistro } from './rncFotoIdb';
import { formatarQuantidadeRir } from './rirDescricaoCompacta';
import type {
  RncAssinaturaBloco,
  RncEncerramentoParecer,
  RncEvidencias,
  RncItemLinha,
  RncPlanoAcaoLinha,
  RncRegistro,
  RncTiposOcorrencia,
} from '../types/qualidade.types';

const DOC_VERSION = '7';

const STATUS_LABEL: Record<RncRegistro['status'], string> = {
  aberto: 'Aberto',
  em_tratativa: 'Em tratativa',
  concluido: 'Fechado',
  cancelado: 'Cancelado',
};

const LOCAL_LABEL: Record<Exclude<RncRegistro['localArmazenagem'], ''>, string> = {
  almoxarifado: 'Almoxarifado',
  quarentena: 'Área de quarentena',
  outro: 'Outro',
};

const ACAO_IMEDIATA_LABEL: Record<Exclude<NonNullable<RncRegistro['acaoImediataTipo']>, ''>, string> = {
  devolvido_transportador: 'Material devolvido ao transportador',
  quarentena_bloqueado: 'Material segregado em quarentena (etiqueta BLOQUEADO)',
  parcial_item_defeito: 'Recebimento parcial (rejeitado apenas o item com defeito)',
};

const PARECER_LABEL: Record<Exclude<RncEncerramentoParecer, ''>, string> = {
  aceito_desvio: 'Aceito (com desvio)',
  rejeitado: 'Rejeitado',
  reclassificado: 'Reclassificado',
};

const TIPO_OCORRENCIA_LABEL: Array<[Exclude<keyof RncTiposOcorrencia, 'outro' | 'outroTexto'>, string]> = [
  ['avariaFisica', 'Avaria física / dano'],
  ['quantidadeIncorreta', 'Quantidade incorreta'],
  ['materialIncorreto', 'Material incorreto'],
  ['documentacaoFaltante', 'Documentação / certificado faltante'],
  ['validadeExpirada', 'Validade expirada ou curta'],
];

export function temConteudoUtil(valor: unknown): boolean {
  return String(valor ?? '').trim().length > 0;
}

export function itensNcIncluidos(registro: RncRegistro): RncItemLinha[] {
  return (registro.itensRnc ?? []).filter((linha) => linha.incluir);
}

export function tiposOcorrenciaActivos(tipos?: RncTiposOcorrencia | null): string[] {
  if (!tipos) return [];
  const activos: string[] = [];
  for (const [chave, rotulo] of TIPO_OCORRENCIA_LABEL) {
    if (tipos[chave]) activos.push(rotulo);
  }
  if (tipos.outro) {
    const detalhe = tipos.outroTexto.trim();
    activos.push(detalhe ? `Outro: ${detalhe}` : 'Outro');
  }
  return activos;
}

export function linhasPlanoPreenchidas(linhas?: RncPlanoAcaoLinha[] | null): RncPlanoAcaoLinha[] {
  return (linhas ?? []).filter(
    (linha) => temConteudoUtil(linha.acao) || temConteudoUtil(linha.responsavel) || temConteudoUtil(linha.prazo),
  );
}

export function evidenciasObjectivasActivas(ev?: RncEvidencias | null, observacao?: string): string[] {
  const activos: string[] = [];
  if (ev?.copiaPedido) activos.push('Cópia do pedido / especificação');
  if (ev?.copiaNf) activos.push('Cópia da NF');
  if (ev?.laudoConferencia) activos.push('Laudo de conferência');
  if (temConteudoUtil(observacao)) activos.push(observacao!.trim());
  return activos;
}

export function deveIncluirParecerEncerramento(registro: RncRegistro): boolean {
  return registro.status === 'concluido' || temConteudoUtil(registro.encerramentoParecer);
}

export function legendaEvidenciaRnc(_item: RncItemLinha, indice: number): string {
  return `Figura ${indice + 1}`;
}

function formatDatePt(iso: string): string {
  if (!iso.trim()) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function formatDateTimePt(): string {
  return new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatQty(q: number | string): string {
  return formatarQuantidadeRir(q);
}

function textBlock(valor: string): string {
  return escapeHtmlRelatorio(valor).replace(/\n/g, '<br>');
}

function joinFacts(parts: Array<string | undefined | null>): string {
  return parts
    .map((p) => String(p ?? '').trim())
    .filter((s) => s.length > 0)
    .join(' · ');
}

function localSegregacao(registro: RncRegistro): string {
  if (registro.localArmazenagem === 'outro') {
    const extra = registro.localArmazenagemOutro.trim();
    return extra ? `Outro: ${extra}` : 'Outro';
  }
  if (registro.localArmazenagem === 'almoxarifado' || registro.localArmazenagem === 'quarentena') {
    return LOCAL_LABEL[registro.localArmazenagem];
  }
  return '';
}

function acaoImediataResumo(registro: RncRegistro): string {
  const tipo = registro.acaoImediataTipo;
  const rotulo =
    tipo === 'devolvido_transportador' || tipo === 'quarentena_bloqueado' || tipo === 'parcial_item_defeito'
      ? ACAO_IMEDIATA_LABEL[tipo]
      : '';
  const obs = registro.acaoImediataObservacoes.trim();
  return [rotulo, obs].filter(Boolean).join('\n');
}

function parecerTexto(registro: RncRegistro): string {
  if (!deveIncluirParecerEncerramento(registro)) return '';
  const key = registro.encerramentoParecer;
  if (key && key in PARECER_LABEL) return PARECER_LABEL[key as Exclude<RncEncerramentoParecer, ''>];
  return key;
}

function montarLogoBlockRnc(): string {
  const texto = `<div class="rnc-logo-badge"><span class="rnc-logo-iso">I · S · O <span class="rnc-logo-sep">|</span> <span class="rnc-logo-pro">PRO</span></span><small class="rnc-logo-sub">GESTÃO DE MATERIAIS</small></div>`;
  const logo = resolverUrlLogoInstitucionalParaHtmlImpresso();
  if (logo) {
    return `<div class="rnc-logo-badge rnc-logo-badge--img"><img class="rnc-logo-img" src="${escapeHtmlRelatorio(logo)}" alt="Logo" decoding="async" /></div>`;
  }
  return texto;
}

function statusPillHtml(status: RncRegistro['status']): string {
  const cls =
    status === 'concluido'
      ? 'rnc-st-pill--ok'
      : status === 'em_tratativa'
        ? 'rnc-st-pill--warn'
        : status === 'cancelado'
          ? 'rnc-st-pill--muted'
          : 'rnc-st-pill--open';
  return `<span class="rnc-st-pill ${cls}">${escapeHtmlRelatorio(STATUS_LABEL[status])}</span>`;
}

function montarFaixaTituloRnc(registro: RncRegistro, emitidoEm: string): string {
  return `<header class="rnc-hdr">
    <div class="rnc-hdr-logo">${montarLogoBlockRnc()}</div>
    <div class="rnc-hdr-title">
      <p class="rnc-hdr-eyebrow">Qualidade · Recebimento</p>
      <h1>Relatório de não conformidade</h1>
      <p class="rnc-hdr-sub">Documento oficial de registo e tratamento de NC</p>
    </div>
    <div class="rnc-hdr-meta">
      <div class="rnc-hdr-code">${escapeHtmlRelatorio(registro.codigo)}</div>
      <div class="rnc-hdr-date">${statusPillHtml(registro.status)}</div>
      <div class="rnc-hdr-date">Registo ${escapeHtmlRelatorio(formatDatePt(registro.dataRegistro) || registro.dataRegistro)}</div>
      <div class="rnc-hdr-date rnc-hdr-emit">Emitido ${escapeHtmlRelatorio(emitidoEm)}</div>
    </div>
  </header>`;
}

function montarLinhaContexto(registro: RncRegistro): string {
  const nf = (registro.recebimentoNotaFiscal ?? '').trim();
  const facts = joinFacts([
    registro.recebimentoFornecedor,
    nf,
    formatDatePt(registro.recebimentoData ?? '') || registro.recebimentoData,
    temConteudoUtil(registro.pedidoCompra) ? `Pedido ${registro.pedidoCompra.trim()}` : '',
    registro.recebimentoRomaneio,
    registro.setor,
    registro.responsavel && registro.responsavel.trim() !== registro.setor.trim() ? registro.responsavel : '',
    localSegregacao(registro),
  ]);
  if (!facts) return '';
  return `<div class="rnc-context-wrap">
    <span class="rnc-context-label">Contexto operacional</span>
    <p class="rnc-context">${escapeHtmlRelatorio(facts)}</p>
  </div>`;
}

type ItemImpressao = {
  codigo: string;
  descricao: string;
  unidade: string;
  qtdRecebida: number;
  qtdRejeitada: number;
  certificado?: string;
  disciplina?: string;
  localizacao?: string;
  tipos: string[];
  desvio: string;
  fotos: string[];
  fotosDeclaradasSemArquivo: boolean;
};

function itensParaImpressao(registro: RncRegistro): ItemImpressao[] {
  const incl = itensNcIncluidos(registro);
  if (incl.length > 0) {
    return incl.map((it) => ({
      codigo: it.codigoMaterial,
      descricao: it.descricaoMaterial,
      unidade: it.unidade,
      qtdRecebida: it.quantidadeRecebida,
      qtdRejeitada: it.quantidadeRejeitada,
      certificado: it.certificado,
      disciplina: it.disciplina,
      localizacao: it.localizacao,
      tipos: tiposOcorrenciaActivos(it.tiposOcorrencia),
      desvio: it.descricaoDetalhada.trim() || registro.descricaoDetalhada.trim() || registro.descricao.trim(),
      fotos: it.fotosDataUrls ?? [],
      fotosDeclaradasSemArquivo: it.fotosDeclaradasSemArquivo,
    }));
  }
  const codigo = registro.materialCodigo.trim();
  const descricao = registro.materialDescricao.trim();
  if (!codigo && !descricao && !temConteudoUtil(registro.descricaoDetalhada) && !temConteudoUtil(registro.descricao)) {
    return [];
  }
  return [
    {
      codigo,
      descricao,
      unidade: '',
      qtdRecebida: registro.quantidadeRecebidaRef,
      qtdRejeitada: registro.quantidadeRejeitada,
      tipos: tiposOcorrenciaActivos(registro.tiposOcorrencia),
      desvio: registro.descricaoDetalhada.trim() || registro.descricao.trim(),
      fotos: [],
      fotosDeclaradasSemArquivo: false,
    },
  ];
}

function resumoQuantidades(it: ItemImpressao): string {
  const un = temConteudoUtil(it.unidade) ? ` ${it.unidade.trim()}` : '';
  const pluralRej = Number(it.qtdRejeitada) === 1 ? 'rejeitada' : 'rejeitadas';
  const pluralRec = Number(it.qtdRecebida) === 1 ? 'recebida' : 'recebidas';
  return `${formatQty(it.qtdRejeitada)}${un} ${pluralRej} · ${formatQty(it.qtdRecebida)} ${pluralRec}`;
}

function linhaMetaItem(it: ItemImpressao): string {
  const cert =
    temConteudoUtil(it.certificado) && it.certificado!.trim().toUpperCase() !== 'N/A' ? it.certificado!.trim() : '';
  const linha = joinFacts([it.disciplina, it.localizacao, cert]);
  if (!linha) return '';
  return `<p class="rnc-item-meta">${escapeHtmlRelatorio(linha)}</p>`;
}

function htmlFotos(it: ItemImpressao): string {
  if (it.fotos.length > 0) {
    const figura = it.fotos
      .map((url, fi) => {
        const caption = `Figura ${fi + 1}`;
        return `<figure class="rnc-photo">
  <div class="rnc-photo-frame"><img src="${escapeHtmlRelatorio(url)}" alt="${escapeHtmlRelatorio(caption)}" /></div>
  <figcaption>${escapeHtmlRelatorio(caption)}</figcaption>
</figure>`;
      })
      .join('');
    return `<div class="rnc-photos">${figura}</div>`;
  }
  if (it.fotosDeclaradasSemArquivo) {
    return '<p class="rnc-note">Evidência fotográfica declarada fora do sistema.</p>';
  }
  return '';
}

function montarDossieMaterial(itens: ItemImpressao[]): string {
  if (itens.length === 0) return '';
  return itens
    .map((it, idx) => {
      const kicker = itens.length > 1 ? `<p class="rnc-kicker">Item ${idx + 1}</p>` : '';
      const tipo = it.tipos.length > 0 ? `<p class="rnc-tipo">${escapeHtmlRelatorio(it.tipos.join(' · '))}</p>` : '';
      const desvio = temConteudoUtil(it.desvio) ? `<p class="rnc-prose">${textBlock(it.desvio)}</p>` : '';
      return `<article class="rnc-dossie">
      ${kicker}
      <h2 class="rnc-codigo">${escapeHtmlRelatorio(it.codigo || '—')}</h2>
      <p class="rnc-descricao">${escapeHtmlRelatorio(it.descricao || '—')}</p>
      <p class="rnc-qtd">${escapeHtmlRelatorio(resumoQuantidades(it))}</p>
      ${linhaMetaItem(it)}
      <div class="rnc-finding">
        ${tipo}
        ${desvio}
      </div>
      ${htmlFotos(it)}
    </article>`;
    })
    .join('');
}

function montarFecho(opts: { disposicao: string; parecer: string; evidencias: string[] }): string {
  const linhas: string[] = [];
  if (temConteudoUtil(opts.disposicao)) {
    linhas.push(
      `<p><span class="rnc-fecho-k">Disposição</span> ${textBlock(opts.disposicao.replace(/\n/g, ' — '))}</p>`,
    );
  }
  if (temConteudoUtil(opts.parecer)) {
    linhas.push(`<p><span class="rnc-fecho-k">Parecer</span> ${escapeHtmlRelatorio(opts.parecer)}</p>`);
  }
  if (opts.evidencias.length > 0) {
    linhas.push(`<p><span class="rnc-fecho-k">Anexos</span> ${escapeHtmlRelatorio(opts.evidencias.join(' · '))}</p>`);
  }
  if (linhas.length === 0) return '';
  return `<div class="rnc-fecho">${linhas.join('')}</div>`;
}

function htmlAssinatura(role: string, bloco: RncAssinaturaBloco): string {
  return `<div class="rnc-sign-card">
    <div class="rnc-sign-space"></div>
    <div class="rnc-sign-line"></div>
    <div class="rnc-sign-role">${escapeHtmlRelatorio(role)}</div>
    <div class="rnc-sign-name">${escapeHtmlRelatorio(bloco.nome)}</div>
    <div class="rnc-sign-date">${bloco.data ? formatDatePt(bloco.data) : '—'}</div>
  </div>`;
}

function montarAssinaturas(registro: RncRegistro, rodapeInstitucionalHtml: string): string {
  const contraparte = temConteudoUtil(registro.assinaturaFornecedor.nome)
    ? htmlAssinatura('Contraparte', registro.assinaturaFornecedor)
    : '';
  const cols = contraparte ? ' rnc-signatures--3' : '';
  return `<section class="rnc-assin">
    <div class="rnc-signatures${cols}">
      ${htmlAssinatura('Materiais', registro.assinaturaResponsavelRnc)}
      ${htmlAssinatura('Qualidade', registro.assinaturaQualidade)}
      ${contraparte}
    </div>
    ${rodapeInstitucionalHtml}
  </section>`;
}

function cssEstilosRelatorioRnc(): string {
  return `
${cssLogoInstitucionalImpressaoDaConfig()}
${cssRodapeInstitucionalControle()}
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@page { size: A4; margin: 11mm 13mm 13mm 13mm; }
body.rnc-print-body,
body.rnc-print-body.iso-report-native-body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100%;
  font-family: 'Noto Sans', Arial, Helvetica, sans-serif;
  color: #1c1917;
  font-size: 10pt;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
}
.rnc-doc {
  width: 100%;
  margin: 0;
  padding: 0;
  max-width: 182mm;
  position: relative;
}
.rnc-doc::before {
  content: '';
  display: block;
  height: 3px;
  margin: 0 0 12px;
  border-radius: 2px;
  background: linear-gradient(90deg, #047857 0%, #86efac 42%, #1c1917 100%);
}
.rnc-doc * { box-sizing: border-box; }
.rnc-hdr {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid #d6d3d1;
  box-shadow: 0 1px 0 0 #fafaf9;
}
.rnc-hdr-logo { flex: 0 0 auto; max-width: 150px; }
.rnc-logo-badge {
  display: inline-block;
  background: linear-gradient(135deg, #1c1917 0%, #292524 100%);
  border-radius: 3px;
  padding: 7px 11px 6px;
  line-height: 1.1;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  box-shadow: 0 1px 0 rgba(255,255,255,0.08) inset;
}
.rnc-logo-badge--img { background: transparent; padding: 0; box-shadow: none; }
.rnc-logo-iso { color: #fff; font-weight: 800; font-size: 10pt; letter-spacing: 0.08em; white-space: nowrap; }
.rnc-logo-pro { color: #86efac; }
.rnc-logo-sep { color: #a8a29e; margin: 0 2px; font-weight: 600; }
.rnc-logo-sub { display: block; color: #86efac; font-size: 6.5pt; font-weight: 700; margin-top: 3px; letter-spacing: 0.06em; }
.rnc-logo-img { display: block; width: auto; height: auto; max-width: var(--iso-logo-slot-w, 178px); max-height: var(--iso-logo-slot-h, 68px); object-fit: contain; }
.rnc-hdr-title { flex: 1 1 auto; text-align: center; min-width: 0; padding-top: 0; }
.rnc-hdr-eyebrow {
  margin: 0 0 5px;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #047857;
}
.rnc-hdr-title h1 {
  margin: 0;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 12pt;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #1c1917;
  line-height: 1.22;
}
.rnc-hdr-sub {
  margin: 5px 0 0;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 7.5pt;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: #78716c;
}
.rnc-hdr-meta {
  flex: 0 0 auto;
  text-align: right;
  min-width: 124px;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
}
.rnc-hdr-code {
  font-weight: 800;
  font-size: 12.5pt;
  color: #1c1917;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.rnc-hdr-date { font-size: 7.5pt; color: #78716c; margin-top: 4px; line-height: 1.35; }
.rnc-hdr-emit { color: #a8a29e; font-size: 7pt; }
.rnc-st-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: 1px solid transparent;
}
.rnc-st-pill--open { color: #9f1239; background: #fff1f2; border-color: #fecdd3; }
.rnc-st-pill--warn { color: #b45309; background: #fffbeb; border-color: #fde68a; }
.rnc-st-pill--ok { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
.rnc-st-pill--muted { color: #57534e; background: #f5f5f4; border-color: #e7e5e4; }
.rnc-context-wrap {
  margin: 0 0 16px;
  padding: 10px 12px;
  background: #fafaf9;
  border: 1px solid #e7e5e4;
  border-radius: 4px;
}
.rnc-context-label {
  display: block;
  margin: 0 0 4px;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #a8a29e;
}
.rnc-context {
  margin: 0;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 9.5pt;
  color: #44403c;
  line-height: 1.5;
}
.rnc-dossie {
  margin: 0 0 5mm;
  padding: 0 0 0 12px;
  border-left: 3px solid #9f1239;
}
.rnc-kicker {
  margin: 0 0 4px;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #a8a29e;
}
.rnc-codigo {
  margin: 0;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 15pt;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #1c1917;
  line-height: 1.15;
  word-break: break-word;
}
.rnc-descricao {
  margin: 7px 0 0;
  font-size: 10.5pt;
  line-height: 1.52;
  color: #44403c;
}
.rnc-qtd {
  margin: 8px 0 0;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 9.5pt;
  font-weight: 700;
  color: #9f1239;
  letter-spacing: 0.01em;
}
.rnc-item-meta {
  margin: 5px 0 0;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 8pt;
  color: #78716c;
}
.rnc-finding {
  margin: 12px 0 0;
  padding: 10px 12px;
  border: none;
  border-radius: 4px;
  background: #fafaf9;
}
.rnc-tipo {
  margin: 0 0 6px;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 8.5pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #9f1239;
  text-transform: uppercase;
}
.rnc-prose { margin: 0; font-size: 10.5pt; line-height: 1.58; color: #292524; }
.rnc-note { margin: 8px 0 0; font-size: 9pt; color: #78716c; font-style: italic; }
.rnc-photos {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin: 14px 0 0;
}
.rnc-photo { margin: 0; break-inside: auto; page-break-inside: auto; }
.rnc-photo-frame {
  border: 1px solid #e7e5e4;
  border-radius: 3px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 1px 2px rgba(28,25,23,0.06);
}
.rnc-photo img {
  display: block;
  width: 100%;
  height: 132px;
  object-fit: contain;
  background: #f5f5f4;
}
.rnc-photo figcaption {
  margin-top: 4px;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 7.5pt;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #78716c;
  text-align: center;
}
.rnc-fecho {
  margin: 14px 0 0;
  padding: 12px 0 0;
  border-top: 1px solid #d6d3d1;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 9.5pt;
  color: #292524;
}
.rnc-fecho p { margin: 0 0 6px; line-height: 1.45; }
.rnc-fecho-k {
  display: inline-block;
  min-width: 82px;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #047857;
}
.rnc-block { margin: 14px 0 0; padding-top: 2px; }
.rnc-block > h2 {
  margin: 0 0 8px;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #047857;
}
.rnc-plano { margin: 0; padding: 0; list-style: none; counter-reset: rnc-plano; }
.rnc-plano li {
  padding: 6px 0 6px 28px;
  position: relative;
  border-bottom: 1px solid #f5f5f4;
}
.rnc-plano li:last-child { border-bottom: none; }
.rnc-plano li::before {
  counter-increment: rnc-plano;
  content: counter(rnc-plano);
  position: absolute;
  left: 0;
  top: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ecfdf5;
  color: #047857;
  font-family: 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 7pt;
  font-weight: 800;
  line-height: 20px;
  text-align: center;
}
.rnc-plano-acao { display: block; font-size: 10pt; font-weight: 600; color: #1c1917; }
.rnc-plano-meta { display: block; font-size: 8pt; color: #78716c; margin-top: 2px; }
.rnc-assin {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid #e7e5e4;
}
.rnc-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 8px; }
.rnc-signatures--3 { grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
.rnc-sign-card { text-align: center; padding: 0 6px; }
.rnc-sign-space { min-height: 28px; }
.rnc-sign-line { width: 85%; border-top: 1.5px solid #1c1917; margin: 0 auto 8px; }
.rnc-sign-role {
  font-size: 7pt;
  font-weight: 700;
  color: #44403c;
  margin-bottom: 4px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rnc-sign-name { font-weight: 700; font-size: 10pt; color: #1c1917; margin-bottom: 3px; }
.rnc-sign-date { font-size: 7.5pt; color: #78716c; }
.rnc-list { margin: 0; padding-left: 16px; }
.rnc-prose { font-family: 'Noto Sans', Arial, Helvetica, sans-serif; }
@media print {
  .rnc-hdr { break-after: avoid; }
  .rnc-dossie { break-inside: avoid; page-break-inside: avoid; }
  .rnc-photo { break-inside: auto; page-break-inside: auto; }
  .rnc-assin { break-inside: auto; page-break-inside: auto; }
}
`;
}

function montarPdfMetaRnc(registro: RncRegistro): RelatorioPdfMeta {
  return {
    headerTitle: 'Relatório de não conformidade',
    headerSub: 'Recebimento de materiais',
    headerCode: (registro.codigo || '').trim() || 'RNC',
    footerPrefix: 'Folha',
    footerOnly: true,
  };
}

function montarSecaoOpcional(titulo: string, corpoHtml: string): string {
  if (!corpoHtml.trim()) return '';
  return `<section class="rnc-block"><h2>${escapeHtmlRelatorio(titulo)}</h2>${corpoHtml}</section>`;
}

async function montarConteudoRnc(registro: RncRegistro): Promise<string> {
  const cfg = readConfiguracoes();
  const emitidoEm = formatDateTimePt();
  const itens = itensParaImpressao(registro);
  const evidencias = evidenciasObjectivasActivas(registro.evidencias, registro.evidenciasObservacao);
  const plano = linhasPlanoPreenchidas(registro.planoAcaoLinhas);
  const planoTexto = registro.planoAcao.trim();
  const qrDataUrl = await dataUrlQrDocumentoControle({
    tipo: 'RNC',
    codigo: registro.codigo,
    emitidoEm: new Date().toISOString(),
    versaoDoc: DOC_VERSION,
  });
  const rodapeInstitucionalHtml = htmlRodapeInstitucionalControle({
    nomeEmpresa: cfg.documentoRodapeNome,
    cnpj: cfg.documentoRodapeCnpj,
    codigo: registro.codigo,
    versaoDoc: DOC_VERSION,
    qrDataUrl,
  });

  const planoHtmlParts: string[] = [];
  if (plano.length > 0) {
    planoHtmlParts.push(
      `<ol class="rnc-plano">${plano
        .map(
          (l) =>
            `<li><strong class="rnc-plano-acao">${escapeHtmlRelatorio(l.acao)}</strong><span class="rnc-plano-meta">${escapeHtmlRelatorio(
              [l.responsavel, l.prazo].filter((x) => temConteudoUtil(x)).join(' · '),
            )}</span></li>`,
        )
        .join('')}</ol>`,
    );
  }
  if (planoTexto) {
    planoHtmlParts.push(`<p class="rnc-prose">${textBlock(planoTexto)}</p>`);
  }

  return `<div class="iso-report-sheet rnc-doc" lang="pt-BR">
  ${montarFaixaTituloRnc(registro, emitidoEm)}
  ${montarLinhaContexto(registro)}
  ${montarDossieMaterial(itens)}
  ${montarFecho({
    disposicao: acaoImediataResumo(registro),
    parecer: parecerTexto(registro),
    evidencias,
  })}
  ${montarSecaoOpcional('Análise da causa', temConteudoUtil(registro.analiseCausaRaiz) ? `<p class="rnc-prose">${textBlock(registro.analiseCausaRaiz)}</p>` : '')}
  ${montarSecaoOpcional('Plano de ação', planoHtmlParts.join(''))}
  ${montarSecaoOpcional('Observações', temConteudoUtil(registro.observacoes) ? `<p class="rnc-prose">${textBlock(registro.observacoes)}</p>` : '')}
  ${montarAssinaturas(registro, rodapeInstitucionalHtml)}
</div>`;
}

export async function montarHtmlRnc(registro: RncRegistro, opts?: { paraPdf?: boolean }): Promise<string> {
  const codigo = (registro.codigo || '').trim() || 'RNC';
  return montarDocumentoHtmlInstitucionalPaged({
    title: `I.S.O PRO — RNC ${codigo}`,
    bodyClass: 'rnc-print-body',
    reportStyles: cssEstilosRelatorioRnc(),
    contentHtml: await montarConteudoRnc(registro),
    usePagedJs: false,
    includeToolbar: opts?.paraPdf !== true,
    pdfMeta: montarPdfMetaRnc(registro),
  });
}

export function imprimirRncHtml(registro: RncRegistro): boolean {
  void imprimirRncHtmlAsync(registro);
  return true;
}

/** Hidrata fotos em IndexedDB antes de montar o HTML (impressão a partir da lista). */
export async function imprimirRncHtmlAsync(registro: RncRegistro): Promise<boolean> {
  const h = await hydrateRncRegistro(registro);
  const html = await montarHtmlRnc(h);
  const fileName = nomeArquivoRelatorioPdf(h.codigo, 'RNC');
  return imprimirRelatorioProfissional({ html, fileName, tipoNuvem: 'rnc' });
}
