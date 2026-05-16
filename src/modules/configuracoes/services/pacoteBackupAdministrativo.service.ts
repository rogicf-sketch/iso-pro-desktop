import JSZip from 'jszip';
import type { ServiceResult } from '../../../types/common.types';
import { montarExportacaoAtendimentosCsvItens } from '../../atendimento/services/atendimento.service';
import { montarExportacaoColaboradoresCsv } from '../../colaboradores/services/colaboradores.service';
import {
  montarExportacaoDocumentosCsvResumo,
  montarExportacaoDocumentosJson,
} from '../../documentos/services/documentos.service';
import { montarExportacaoEquipamentosCsv } from '../../equipamentos/services/equipamentos.service';
import type { EquipamentoFiltro } from '../../equipamentos/types/equipamento.types';
import { montarExportacaoFornecedoresCsv } from '../../fornecedores/services/fornecedores.service';
import { listarInventarios, montarExportacaoInventarioCsv } from '../../inventario/services/inventario.service';
import type { InventarioFiltro } from '../../inventario/types/inventario.types';
import { montarExportacaoMateriaisCsv } from '../../materiais/services/materiais.service';
import { readMateriaisDominiosListas } from '../../materiais/services/materiaisDominios.storage';
import {
  montarExportacaoRecebimentosCsvItens,
  montarExportacaoRecebimentosCsvResumo,
  montarExportacaoRecebimentosJson,
} from '../../recebimentos/services/recebimentos.service';
import { montarExportacaoRirCsvCompleto } from '../../qualidade/services/qualidade.service';

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

const filtroEquipamentosExportacao: EquipamentoFiltro = {
  busca: '',
  statusOperacao: 'todos',
  situacaoContrato: 'todos',
  page: 1,
  pageSize: 999999,
};

const filtroInventariosLista: InventarioFiltro = {
  busca: '',
  status: 'todos',
  page: 1,
  pageSize: 5000,
};

type EntradaZip = { nomeFicheiro: string; conteudo: string };

function nomeSeguroDentroDoZip(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'ficheiro';
  return base.replace(/\.\./g, '_').trim() || 'ficheiro';
}

/**
 * Gera um ZIP com os exportes (CSV/JSON) dos modulos e inicia **um** download no browser.
 * Nao apaga dados. Falhas parciais sao registadas em `avisos` sem interromper os restantes.
 *
 * Nota: o ZIP e montado em memoria; bases muito grandes podem consumir RAM durante a geracao.
 */
export async function descarregarPacoteBackupAdministrativo(): Promise<
  ServiceResult<{ ficheiros: number; avisos: string[] }>
> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { success: false, error: 'Ambiente invalido (sem browser).' };
  }

  const avisos: string[] = [];
  const entradas: EntradaZip[] = [];
  const stampPasta = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  const coletarCsv = async (rotulo: string, fn: () => Promise<ServiceResult<{ csv: string; fileName: string }>>) => {
    try {
      const r = await fn();
      if (!r.success || !r.data) {
        avisos.push(`${rotulo}: ${r.error ?? 'falha'}`);
        return;
      }
      const { fileName, csv } = r.data;
      if (!csv) {
        avisos.push(`${rotulo}: conteudo vazio.`);
        return;
      }
      entradas.push({ nomeFicheiro: nomeSeguroDentroDoZip(fileName), conteudo: csv });
    } catch (e) {
      avisos.push(`${rotulo}: ${e instanceof Error ? e.message : 'erro'}`);
    }
  };

  const coletarJson = async (rotulo: string, fn: () => Promise<ServiceResult<{ json: string; fileName: string }>>) => {
    try {
      const r = await fn();
      if (!r.success || !r.data) {
        avisos.push(`${rotulo}: ${r.error ?? 'falha'}`);
        return;
      }
      const { fileName, json } = r.data;
      if (!json) {
        avisos.push(`${rotulo}: conteudo vazio.`);
        return;
      }
      entradas.push({ nomeFicheiro: nomeSeguroDentroDoZip(fileName), conteudo: json });
    } catch (e) {
      avisos.push(`${rotulo}: ${e instanceof Error ? e.message : 'erro'}`);
    }
  };

  await coletarCsv('Materiais CSV', () => montarExportacaoMateriaisCsv());

  try {
    const dom = readMateriaisDominiosListas();
    entradas.push({
      nomeFicheiro: nomeSeguroDentroDoZip(`iso-pro-materiais-dominios-${stampPasta}.json`),
      conteudo: `${JSON.stringify(dom, null, 2)}\n`,
    });
  } catch (e) {
    avisos.push(`Materiais dominios: ${e instanceof Error ? e.message : 'erro'}`);
  }

  await coletarCsv('Documentos CSV', () => montarExportacaoDocumentosCsvResumo());
  await coletarJson('Documentos JSON', () => montarExportacaoDocumentosJson());
  await coletarCsv('Recebimentos CSV resumo', () => montarExportacaoRecebimentosCsvResumo());
  await coletarCsv('Recebimentos CSV itens', () => montarExportacaoRecebimentosCsvItens());
  await coletarJson('Recebimentos JSON', () => montarExportacaoRecebimentosJson());
  await coletarCsv('Fornecedores CSV', () => montarExportacaoFornecedoresCsv());
  await coletarCsv('Colaboradores CSV', () => montarExportacaoColaboradoresCsv());
  await coletarCsv('Equipamentos CSV', () => montarExportacaoEquipamentosCsv(filtroEquipamentosExportacao));
  await coletarCsv('Atendimentos CSV', () => montarExportacaoAtendimentosCsvItens());
  await coletarCsv('RIR CSV', () => montarExportacaoRirCsvCompleto());

  try {
    const inv = await listarInventarios(filtroInventariosLista);
    if (!inv.success || !inv.data) {
      avisos.push(`Inventarios: ${inv.error ?? 'lista indisponivel'}`);
    } else {
      for (const row of inv.data.items) {
        const r = await montarExportacaoInventarioCsv(row.id);
        if (!r.success || !r.data) {
          avisos.push(`Inventario ${row.codigo}: ${r.error ?? 'falha'}`);
          continue;
        }
        entradas.push({ nomeFicheiro: nomeSeguroDentroDoZip(r.data.fileName), conteudo: r.data.csv });
      }
    }
  } catch (e) {
    avisos.push(`Inventarios: ${e instanceof Error ? e.message : 'erro'}`);
  }

  if (entradas.length === 0) {
    return { success: false, error: 'Nenhum ficheiro foi gerado para o backup.' };
  }

  const nomeZip = `iso-pro-backup-${stampPasta}.zip`;
  const pastaDentro = `iso-pro-backup-${stampPasta}`;

  try {
    const zip = new JSZip();
    for (const e of entradas) {
      zip.file(`${pastaDentro}/${e.nomeFicheiro}`, e.conteudo);
    }
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    descarregarBlob(blob, nomeZip);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Falha ao criar o arquivo ZIP.',
    };
  }

  return { success: true, data: { ficheiros: entradas.length, avisos } };
}
