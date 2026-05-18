import JSZip from 'jszip';
import { escapeCsvCellSemicolon } from '../../../lib/csv';
import { abrirPreVisualizacaoHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import { montarExportacaoAtendimentosCsvItens } from '../../atendimento/services/atendimento.service';
import { montarExportacaoDocumentosCsvResumo } from '../../documentos/services/documentos.service';
import { montarExportacaoRecebimentosCsvResumo } from '../../recebimentos/services/recebimentos.service';
import { montarExportacaoRirCsvCompleto } from '../../qualidade/services/qualidade.service';
import {
  enriquecerRelatorioFinalObra,
  formatarDataRelatorioFinal,
  rotuloNumeroRelatorioFinalObra,
} from '../services/relatorioFinalObra.service';
import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';
import { montarHtmlRelatorioFinalObra } from './montarHtmlRelatorioFinalObra';

function descarregarBlob(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function linhaCsv(cells: string[]): string {
  return `${cells.map((c) => escapeCsvCellSemicolon(c)).join(';')}\n`;
}

function csvComBom(conteudo: string): string {
  return `\uFEFF${conteudo}`;
}

function montarCsvResumo(dados: RelatorioFinalObraDados): string {
  const { contexto, totais } = dados;
  let csv = linhaCsv(['Campo', 'Valor']);
  csv += linhaCsv(['Número do relatório', rotuloNumeroRelatorioFinalObra(contexto)]);
  csv += linhaCsv(['Gerado em', formatarDataRelatorioFinal(contexto.geradoEm)]);
  csv += linhaCsv(['Cliente', contexto.cliente]);
  csv += linhaCsv(['Projeto', contexto.projeto]);
  csv += linhaCsv(['Contrato', contexto.contrato]);
  csv += linhaCsv(['Local', contexto.local]);
  csv += linhaCsv(['', '']);
  csv += linhaCsv(['Indicador', 'Total', 'Observação']);
  csv += linhaCsv(['Documentos', String(totais.documentos), `${totais.documentosCancelados} cancelado(s)`]);
  csv += linhaCsv(['Recebimentos', String(totais.recebimentos), `${totais.recebimentosCancelados} cancelado(s)`]);
  csv += linhaCsv(['RIR', String(totais.rir), `${totais.rirCancelados} cancelado(s)`]);
  csv += linhaCsv(['RNC', String(totais.rnc), `${totais.rncCancelados} cancelado(s)`]);
  csv += linhaCsv(['Atendimentos', String(totais.atendimentos), `${totais.atendimentosEstornados} estornado(s)`]);
  csv += linhaCsv(['Inventários', String(totais.inventarios), `${totais.inventariosAbertos} aberto(s)`]);
  csv += linhaCsv(['Relatórios fotográficos', String(totais.relatoriosFotograficos), '']);
  csv += linhaCsv(['Materiais', String(totais.materiais), '']);
  csv += linhaCsv(['Colaboradores', String(totais.colaboradores), '']);
  csv += linhaCsv(['Fornecedores', String(totais.fornecedores), '']);
  return csvComBom(csv);
}

function montarCsvRelatoriosFotograficos(dados: RelatorioFinalObraDados): string {
  let csv = linhaCsv(['Nº RF', 'Título', 'Salvo em', 'Fotos']);
  for (const r of dados.relatoriosFotograficos) {
    csv += linhaCsv([r.numeroRelatorio, r.titulo, formatarDataRelatorioFinal(r.salvoEm), String(r.fotoCount)]);
  }
  return csvComBom(csv);
}

function montarCsvRnc(dados: RelatorioFinalObraDados): string {
  let csv = linhaCsv(['Código', 'Data', 'Status', 'NF', 'Material', 'Descrição', 'Responsável']);
  for (const r of dados.rnc) {
    csv += linhaCsv([
      r.codigo,
      formatarDataRelatorioFinal(r.dataRegistro),
      r.status,
      r.recebimentoNotaFiscal ?? '',
      r.materialCodigo,
      r.descricao,
      r.responsavel,
    ]);
  }
  return csvComBom(csv);
}

function montarHtmlWord(dados: RelatorioFinalObraDados): string {
  const html = montarHtmlRelatorioFinalObra(dados, { incluirBarraPreVisualizacao: false });
  return html.replace(
    '<html lang="pt-BR">',
    `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40" lang="pt-BR">`,
  ).replace(
    '<head>',
    `<head>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->`,
  );
}

function nomeBaseArquivo(dados: RelatorioFinalObraDados): string {
  const rotulo = rotuloNumeroRelatorioFinalObra(dados.contexto);
  const n = (dados.contexto.registrado ? dados.contexto.numeroRelatorio : `previa-${rotulo}`)
    .replace(/[^\w-]+/g, '_')
    .slice(0, 80);
  const stamp = dados.contexto.geradoEm.slice(0, 10);
  return `relatorio-final-obra-${n}-${stamp}`;
}

export async function preVisualizarRelatorioFinalObra(
  dados: RelatorioFinalObraDados,
): Promise<{ ok: true; dados: RelatorioFinalObraDados } | { ok: false; error: string }> {
  const limpo: RelatorioFinalObraDados = { ...dados, apresentacao: undefined, analiseEnriquecida: undefined };
  const enriquecido = await enriquecerRelatorioFinalObra(limpo);
  const html = montarHtmlRelatorioFinalObra(enriquecido);
  const res = await abrirPreVisualizacaoHtmlRelatorio(html);
  if (!res.ok) return res;
  return { ok: true, dados: enriquecido };
}

export async function exportarRelatorioFinalObraPdf(
  dados: RelatorioFinalObraDados,
): Promise<{ ok: true; dados: RelatorioFinalObraDados } | { ok: false; error: string }> {
  return preVisualizarRelatorioFinalObra(dados);
}

export async function exportarRelatorioFinalObraWord(dados: RelatorioFinalObraDados): Promise<RelatorioFinalObraDados> {
  const enriquecido = await enriquecerRelatorioFinalObra(dados);
  const html = montarHtmlWord(enriquecido);
  const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
  descarregarBlob(blob, `${nomeBaseArquivo(enriquecido)}.doc`);
  return enriquecido;
}

export async function exportarRelatorioFinalObraExcel(dados: RelatorioFinalObraDados): Promise<{ ok: boolean; avisos: string[] }> {
  const avisos: string[] = [];
  const entradas: Array<{ nome: string; conteudo: string }> = [];

  entradas.push({ nome: '00-resumo.csv', conteudo: montarCsvResumo(dados) });
  entradas.push({ nome: 'relatorios-fotograficos.csv', conteudo: montarCsvRelatoriosFotograficos(dados) });
  entradas.push({ nome: 'rnc.csv', conteudo: montarCsvRnc(dados) });

  const coletar = async (rotulo: string, fn: () => Promise<{ success: boolean; data?: { csv: string; fileName: string }; error?: string }>) => {
    try {
      const r = await fn();
      if (!r.success || !r.data?.csv) {
        avisos.push(`${rotulo}: ${r.error ?? 'indisponível'}`);
        return;
      }
      entradas.push({ nome: r.data.fileName.replace(/^.*[/\\]/, ''), conteudo: r.data.csv });
    } catch (e) {
      avisos.push(`${rotulo}: ${e instanceof Error ? e.message : 'erro'}`);
    }
  };

  await coletar('Documentos', () => montarExportacaoDocumentosCsvResumo());
  await coletar('Recebimentos', () => montarExportacaoRecebimentosCsvResumo());
  await coletar('RIR', () => montarExportacaoRirCsvCompleto());
  await coletar('Atendimentos', () => montarExportacaoAtendimentosCsvItens());

  const pasta = nomeBaseArquivo(dados);
  const zip = new JSZip();
  for (const e of entradas) {
    zip.file(`${pasta}/${e.nome}`, e.conteudo);
  }
  zip.file(
    `${pasta}/LEIA-ME.txt`,
    `Relatório Final de Obra — ${rotuloNumeroRelatorioFinalObra(dados.contexto)}\nGerado em: ${formatarDataRelatorioFinal(dados.contexto.geradoEm)}\n\nEste ZIP contém a LISTAGEM COMPLETA de registros (CSV).\nO PDF/Word na aplicação é o relatório EXECUTIVO (resumo + destaques + amostra).\nAbra os CSV no Excel (separador ; UTF-8).\n`,
  );

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  descarregarBlob(blob, `${pasta}.zip`);
  return { ok: true, avisos };
}
