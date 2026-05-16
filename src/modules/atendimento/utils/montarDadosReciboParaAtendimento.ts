import { buscarColaboradorPorId, listarColaboradoresAtivos } from '../../colaboradores/services/colaboradores.service';
import { buscarDocumentoPorIdOuNumero } from '../../documentos/services/documentos.service';
import type { Atendimento, DadosReciboAtendimento } from '../types/atendimento.types';
import { resolverColaboradorPorTextoAtendente } from './resolverColaboradorPorTextoAtendente';

async function montarMetadadosDocumentoRecibo(at: Atendimento): Promise<{
  documentoDescricao: string;
  documentoRevisao: string;
  documentoResponsavel: string;
}> {
  const placeholder = '(Documento nao encontrado ou indisponivel.)';

  const docPrincipal = await buscarDocumentoPorIdOuNumero(at.documentoId, at.documentoNumero);
  const doc = docPrincipal.success && docPrincipal.data ? docPrincipal.data : null;
  if (doc) {
    return {
      documentoDescricao: doc.descricao?.trim() || placeholder,
      documentoRevisao: doc.revisao || '—',
      documentoResponsavel: doc.responsavel || '—',
    };
  }

  const numerosLinha = [
    ...new Set(
      at.itens
        .map((it) => it.documentoNumero?.trim())
        .filter((x): x is string => Boolean(x)),
    ),
  ];

  if (numerosLinha.length === 1) {
    const r = await buscarDocumentoPorIdOuNumero('', numerosLinha[0]);
    if (r.success && r.data) {
      return {
        documentoDescricao: r.data.descricao?.trim() || placeholder,
        documentoRevisao: r.data.revisao || '—',
        documentoResponsavel: r.data.responsavel || '—',
      };
    }
  }

  if (numerosLinha.length > 1) {
    const partes: string[] = [];
    for (const num of numerosLinha) {
      const r = await buscarDocumentoPorIdOuNumero('', num);
      if (r.success && r.data?.descricao) {
        partes.push(`${num}: ${r.data.descricao}`);
      } else {
        partes.push(num);
      }
    }
    if (partes.length) {
      return {
        documentoDescricao: partes.join(' · '),
        documentoRevisao: '—',
        documentoResponsavel: '—',
      };
    }
  }

  return {
    documentoDescricao: placeholder,
    documentoRevisao: '—',
    documentoResponsavel: '—',
  };
}

/** Monta dados completos do recibo a partir de um atendimento ja registrado (historico). */
export async function montarDadosReciboParaAtendimento(at: Atendimento): Promise<DadosReciboAtendimento> {
  const meta = await montarMetadadosDocumentoRecibo(at);

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
