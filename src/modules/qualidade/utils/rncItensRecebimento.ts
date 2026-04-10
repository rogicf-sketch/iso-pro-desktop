import type { RecebimentoItem } from '../../recebimentos/types/recebimento.types';
import type { RncItemLinha } from '../types/qualidade.types';
import { defaultRncTiposOcorrencia } from '../types/qualidade.types';

export function mergeItensRncComRecebimento(recItens: RecebimentoItem[], existing: RncItemLinha[]): RncItemLinha[] {
  return recItens.map((it) => {
    const prev = existing.find((x) => x.recebimentoItemId === it.id);
    const snap = {
      codigoMaterial: it.codigoMaterial ?? '',
      descricaoMaterial: it.descricaoMaterial ?? '',
      unidade: it.unidade ?? '',
      disciplina: it.disciplina ?? '',
      localizacao: it.localizacao ?? '',
      quantidadeRecebida: typeof it.quantidadeRecebida === 'number' && Number.isFinite(it.quantidadeRecebida) ? it.quantidadeRecebida : 0,
      quantidadeConferida: typeof it.quantidadeConferida === 'number' && Number.isFinite(it.quantidadeConferida) ? it.quantidadeConferida : 0,
      pesoUnitario: typeof it.pesoUnitario === 'number' && Number.isFinite(it.pesoUnitario) ? it.pesoUnitario : 0,
      pesoTotal: typeof it.pesoTotal === 'number' && Number.isFinite(it.pesoTotal) ? it.pesoTotal : 0,
      certificado: (it.certificado ?? '').trim(),
    };
    if (prev) {
      return {
        ...prev,
        ...snap,
      };
    }
    return {
      recebimentoItemId: it.id,
      incluir: false,
      ...snap,
      quantidadeRejeitada: 0,
      tiposOcorrencia: defaultRncTiposOcorrencia(),
      descricaoDetalhada: '',
      fotosDataUrls: [],
      fotosDeclaradasSemArquivo: false,
    };
  });
}

export function rncLinhaTemConteudoOcorrencia(linha: RncItemLinha): boolean {
  const t = linha.tiposOcorrencia ?? defaultRncTiposOcorrencia();
  const anyTipo =
    t.avariaFisica ||
    t.quantidadeIncorreta ||
    t.materialIncorreto ||
    t.documentacaoFaltante ||
    t.validadeExpirada ||
    t.outro;
  return anyTipo || Boolean(linha.descricaoDetalhada?.trim());
}
