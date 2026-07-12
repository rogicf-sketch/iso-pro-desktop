import { buscarColaboradorPorId, listarColaboradoresAtivos } from '../../colaboradores/services/colaboradores.service';
import type { Atendimento, DadosReciboAtendimento } from '../types/atendimento.types';
import { montarMetadadosDocumentoAtendimento } from './montarMetadadosDocumentoAtendimento';
import { resolverColaboradorPorTextoAtendente } from './resolverColaboradorPorTextoAtendente';

/** Monta dados completos do recibo a partir de um atendimento ja registrado (historico). */
export async function montarDadosReciboParaAtendimento(at: Atendimento): Promise<DadosReciboAtendimento> {
  const meta = await montarMetadadosDocumentoAtendimento(at);

  let atRecibo: Atendimento = { ...at };
  if (
    (!atRecibo.recebedorMatricula?.trim() || !atRecibo.recebedorFuncao?.trim()) &&
    atRecibo.recebedorColaboradorId?.trim()
  ) {
    const r = await buscarColaboradorPorId(atRecibo.recebedorColaboradorId.trim());
    if (r.success && r.data) {
      atRecibo = {
        ...atRecibo,
        recebedorMatricula: atRecibo.recebedorMatricula?.trim() || String(r.data.matricula ?? '').trim(),
        recebedorFuncao: atRecibo.recebedorFuncao?.trim() || String(r.data.funcao ?? '').trim(),
      };
    }
  }
  if ((!atRecibo.atendenteMatricula?.trim() || !atRecibo.atendenteFuncao?.trim()) && atRecibo.atendente.trim()) {
    const lista = await listarColaboradoresAtivos();
    const c = resolverColaboradorPorTextoAtendente(atRecibo.atendente, lista);
    if (c) {
      atRecibo = {
        ...atRecibo,
        atendenteMatricula: atRecibo.atendenteMatricula?.trim() || String(c.matricula ?? '').trim(),
        atendenteFuncao: atRecibo.atendenteFuncao?.trim() || String(c.funcao ?? '').trim(),
      };
    }
  }

  const nomeAtendido =
    at.recebedorTipo === 'interno'
      ? at.recebedor.trim() || '-'
      : `${at.recebedor.trim()}${at.recebedorEmpresa.trim() ? ` — ${at.recebedorEmpresa.trim()}` : ''}`.trim() || '-';

  return {
    atendimento: atRecibo,
    documentoDescricao: meta.documentoDescricao,
    documentoRevisao: meta.documentoRevisao,
    documentoResponsavel: meta.documentoResponsavel,
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
