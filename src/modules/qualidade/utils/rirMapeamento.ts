import type { Recebimento } from '../../recebimentos/types/recebimento.types';
import type { RirItemLinha } from '../types/qualidade.types';

function certificadoRirDeRecebimento(cert: string | undefined): string {
  const t = String(cert ?? '').trim();
  return t || 'N/A';
}

export function mapRecebimentoItensParaRirItens(rec: Recebimento): RirItemLinha[] {
  return rec.itens.map((it) => ({
    id: it.id,
    codigoMaterial: it.codigoMaterial,
    quantidade: it.quantidadeRecebida,
    unidade: it.unidade,
    descricaoMaterial: it.descricaoMaterial,
    certificado: certificadoRirDeRecebimento(it.certificado),
    linhaOrigemRecebimento: true,
    disciplina: it.disciplina,
    localizacao: it.localizacao,
    quantidadeConferida: it.quantidadeConferida,
  }));
}
