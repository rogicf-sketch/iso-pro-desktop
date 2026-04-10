import { buscarDocumentoPorId } from '../../documentos/services/documentos.service';
import type { Atendimento, DadosReciboAtendimento } from '../types/atendimento.types';

/** Monta dados completos do recibo a partir de um atendimento ja registrado (historico). */
export async function montarDadosReciboParaAtendimento(at: Atendimento): Promise<DadosReciboAtendimento> {
  const docResult = await buscarDocumentoPorId(at.documentoId);
  const doc = docResult.success && docResult.data ? docResult.data : null;

  const nomeAtendido =
    at.recebedorTipo === 'interno'
      ? at.recebedor.trim() || '-'
      : `${at.recebedor.trim()}${at.recebedorEmpresa.trim() ? ` — ${at.recebedorEmpresa.trim()}` : ''}`.trim() || '-';

  return {
    atendimento: at,
    documentoDescricao: doc?.descricao ?? '(Documento nao encontrado ou indisponivel.)',
    documentoRevisao: doc?.revisao ?? '—',
    documentoResponsavel: doc?.responsavel ?? '—',
    nomeAtendido,
    detalhesRetiradaExterna:
      at.recebedorTipo === 'externo'
        ? {
            documentoIdentificacao: at.recebedorDocumento,
            telefone: at.recebedorTelefone,
            autorizadorInterno: at.autorizadorInterno,
            motivoRetirada: at.motivoRetirada,
          }
        : undefined,
  };
}
