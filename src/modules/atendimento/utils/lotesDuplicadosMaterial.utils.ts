import { codigoMaterialKey } from '../../estoque/saldoFromSnapshot';
import type { Atendimento } from '../types/atendimento.types';

export type AvisoLoteDuplicadoMaterial = {
  loteNumero: string;
  loteId: string;
  dataAtendimento: string;
  recebedor: string;
  codigoMaterial: string;
  documentoNumero: string;
  quantidadeAtendida: number;
  origem: Atendimento['origem'];
};

function documentoNumeroItem(at: Atendimento, documentoNumero?: string | null): string {
  const n = String(documentoNumero?.trim() || at.documentoNumero || '').trim();
  return n && n !== '-' ? n : '';
}

/** Outros lotes concluidos com o mesmo material no mesmo desenho (estorno parcial de um nao afeta o outro). */
export function encontrarOutrosLotesMesmoMaterialDocumento(
  historico: Atendimento[],
  alvo: Atendimento,
): AvisoLoteDuplicadoMaterial[] {
  const avisos: AvisoLoteDuplicadoMaterial[] = [];
  const vistos = new Set<string>();

  for (const item of alvo.itens) {
    if (Number(item.quantidadeAtendida) <= 0) continue;
    const docAlvo = documentoNumeroItem(alvo, item.documentoNumero);
    const codAlvo = codigoMaterialKey(item.codigoMaterial);
    if (!docAlvo || !codAlvo) continue;

    for (const outro of historico) {
      if (outro.id === alvo.id || outro.status === 'estornado') continue;
      for (const oit of outro.itens) {
        if (Number(oit.quantidadeAtendida) <= 0) continue;
        const docOutro = documentoNumeroItem(outro, oit.documentoNumero);
        if (docOutro !== docAlvo || codigoMaterialKey(oit.codigoMaterial) !== codAlvo) continue;

        const chave = `${outro.numero}|${codAlvo}|${docAlvo}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        avisos.push({
          loteNumero: outro.numero,
          loteId: outro.id,
          dataAtendimento: outro.dataAtendimento,
          recebedor: outro.recebedor,
          codigoMaterial: item.codigoMaterial,
          documentoNumero: docAlvo,
          quantidadeAtendida: Number(oit.quantidadeAtendida) || 0,
          origem: outro.origem,
        });
      }
    }
  }

  return avisos.sort((a, b) => b.dataAtendimento.localeCompare(a.dataAtendimento));
}
