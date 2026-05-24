import type { Atendimento, DadosReciboSessaoConsolidada, ReciboSessaoSecaoDocumento } from '../types/atendimento.types';

export function montarDadosReciboSessaoConsolidada(
  atendimentos: Atendimento[],
  secoes: ReciboSessaoSecaoDocumento[],
  nomeAtendido: string,
  detalhesRetiradaExterna?: DadosReciboSessaoConsolidada['detalhesRetiradaExterna'],
): DadosReciboSessaoConsolidada {
  const ordenados = [...atendimentos].sort((a, b) => a.documentoNumero.localeCompare(b.documentoNumero, 'pt-BR'));
  const primeiro = ordenados[0];
  const numerosLotes = ordenados.map((a) => a.numero);
  const referencia =
    numerosLotes.length === 1
      ? numerosLotes[0]
      : `${numerosLotes[0]} (+${numerosLotes.length - 1} lote${numerosLotes.length > 2 ? 's' : ''})`;

  return {
    referencia,
    dataAtendimento: primeiro.dataAtendimento,
    atendente: primeiro.atendente,
    atendenteMatricula: primeiro.atendenteMatricula,
    atendenteFuncao: primeiro.atendenteFuncao,
    recebedorTipo: primeiro.recebedorTipo,
    recebedor: primeiro.recebedor,
    recebedorMatricula: primeiro.recebedorMatricula,
    recebedorFuncao: primeiro.recebedorFuncao,
    nomeAtendido,
    numerosLotes,
    secoes,
    detalhesRetiradaExterna,
  };
}
