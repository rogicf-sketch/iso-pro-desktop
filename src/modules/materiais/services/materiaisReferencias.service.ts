import type { ServiceResult } from '../../../types/common.types';
import { listarHistoricoAtendimentos } from '../../atendimento/services/atendimento.service';
import { carregarTodosDocumentosOrdenados } from '../../documentos/services/documentos.service';
import { codigoMaterialKey } from '../../estoque/saldoFromSnapshot';
import { carregarRecebimentosCompletos } from '../../recebimentos/services/recebimentos.service';
import { obterMapeamentoCodigoPorIdMaterial } from './materiais.service';

export type UsoMaterialNosModulos = {
  codigo: string;
  recebimentos: boolean;
  documentos: boolean;
  atendimento: boolean;
};

type FlagsUso = { r: boolean; d: boolean; a: boolean };

function mapaUsoPorCodigoNormalizado(): Map<string, FlagsUso> {
  return new Map();
}

/**
 * Indica em quais modulos o codigo do material aparece (recebimentos, documentacao, atendimento),
 * com base nos dados carregados neste ambiente (local e/ou snapshot Supabase).
 */
export async function analisarUsoMateriaisPorIds(ids: string[]): Promise<ServiceResult<UsoMaterialNosModulos[]>> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return { success: true, data: [] };

  const mapResult = await obterMapeamentoCodigoPorIdMaterial(unique);
  if (!mapResult.success || !mapResult.data) {
    return { success: false, error: mapResult.error ?? 'Falha ao ler materiais.' };
  }
  const codigoPorId = mapResult.data;

  const usoPorKey = mapaUsoPorCodigoNormalizado();

  function marcar(key: string, patch: Partial<FlagsUso>) {
    if (!key) return;
    const cur = usoPorKey.get(key) ?? { r: false, d: false, a: false };
    usoPorKey.set(key, {
      r: cur.r || Boolean(patch.r),
      d: cur.d || Boolean(patch.d),
      a: cur.a || Boolean(patch.a),
    });
  }

  try {
    const [recebimentos, docResult, atendimentos] = await Promise.all([
      carregarRecebimentosCompletos(),
      carregarTodosDocumentosOrdenados(),
      listarHistoricoAtendimentos(),
    ]);

    if (!docResult.success || !docResult.data) {
      return { success: false, error: docResult.error ?? 'Falha ao carregar documentos.' };
    }
    const documentos = docResult.data;

    for (const rec of recebimentos) {
      for (const it of rec.itens) {
        marcar(codigoMaterialKey(it.codigoMaterial), { r: true });
      }
    }

    for (const doc of documentos) {
      for (const it of doc.itens) {
        marcar(codigoMaterialKey(it.codigoMaterial), { d: true });
      }
    }

    for (const at of atendimentos) {
      for (const it of at.itens) {
        marcar(codigoMaterialKey(it.codigoMaterial), { a: true });
      }
    }

    const result: UsoMaterialNosModulos[] = unique.map((id) => {
      const codigo = codigoPorId[id] ?? id;
      const k = codigoMaterialKey(codigo);
      const u = usoPorKey.get(k) ?? { r: false, d: false, a: false };
      return {
        codigo,
        recebimentos: u.r,
        documentos: u.d,
        atendimento: u.a,
      };
    });

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Falha ao analisar uso dos materiais.',
    };
  }
}

/** Texto multilinha para mensagens de erro ou aviso (use com white-space: pre-line). */
export function formatarUsoMateriaisResumoTexto(rows: UsoMaterialNosModulos[]): string {
  const comUso = rows.filter((r) => r.recebimentos || r.documentos || r.atendimento);
  if (!comUso.length) return '';
  const linhas = comUso.map((r) => {
    const p: string[] = [];
    if (r.recebimentos) p.push('Recebimentos');
    if (r.documentos) p.push('Documentacao');
    if (r.atendimento) p.push('Atendimento');
    return `- ${r.codigo}: ${p.join(', ')}`;
  });
  return `Uso detetado neste ambiente (codigo → modulos):\n${linhas.join('\n')}`;
}
