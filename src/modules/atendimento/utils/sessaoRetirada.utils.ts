import type {
  AtendimentoDocumento,
  AtendimentoDocumentoLinha,
  AtendimentoRecebedorTipo,
  SessaoRetiradaLinha,
} from '../types/atendimento.types';

export function quantidadeMaximaLinhaDocumento(linha: AtendimentoDocumentoLinha): number {
  const pendente = Number(linha.quantidadePendente) || 0;
  const saldo = Number(linha.saldoDisponivel) || 0;
  return Math.max(0, Math.min(pendente, saldo));
}

export function adicionarOuAtualizarLinhaSessao(
  linhas: SessaoRetiradaLinha[],
  nova: SessaoRetiradaLinha,
  maxQuantidade: number,
): SessaoRetiradaLinha[] {
  const qCap = Math.min(Math.max(0, nova.quantidade), maxQuantidade);
  if (qCap <= 0) return linhas;
  const idx = linhas.findIndex(
    (l) => l.documentoId === nova.documentoId && l.documentoItemId === nova.documentoItemId,
  );
  if (idx === -1) {
    return [...linhas, { ...nova, quantidade: qCap }];
  }
  const merged = Math.min(linhas[idx].quantidade + qCap, maxQuantidade);
  const next = [...linhas];
  next[idx] = { ...next[idx], quantidade: merged };
  return next;
}

export function removerLinhaSessao(
  linhas: SessaoRetiradaLinha[],
  documentoId: string,
  documentoItemId: string,
): SessaoRetiradaLinha[] {
  return linhas.filter((l) => !(l.documentoId === documentoId && l.documentoItemId === documentoItemId));
}

export function agruparSessaoPorDocumento(linhas: SessaoRetiradaLinha[]): Map<string, SessaoRetiradaLinha[]> {
  const map = new Map<string, SessaoRetiradaLinha[]>();
  for (const linha of linhas) {
    const cur = map.get(linha.documentoId) ?? [];
    cur.push(linha);
    map.set(linha.documentoId, cur);
  }
  return map;
}

export function totalUnidadesSessao(linhas: SessaoRetiradaLinha[]): number {
  return linhas.reduce((acc, l) => acc + (Number(l.quantidade) || 0), 0);
}

export function montarPayloadDocumentosSessao(linhas: SessaoRetiradaLinha[]): Array<{
  documentoId: string;
  itens: Array<{ documentoItemId: string; quantidade: number }>;
}> {
  const grupos = agruparSessaoPorDocumento(linhas);
  return [...grupos.entries()].map(([documentoId, grupo]) => ({
    documentoId,
    itens: grupo.map((l) => ({ documentoItemId: l.documentoItemId, quantidade: l.quantidade })),
  }));
}

function obterLinhaDocumento(
  documentos: AtendimentoDocumento[],
  documentoId: string,
  documentoItemId: string,
): AtendimentoDocumentoLinha | null {
  const doc = documentos.find((d) => d.id === documentoId);
  return doc?.linhas.find((l) => l.documentoItemId === documentoItemId) ?? null;
}

/**
 * Valida cabecalho (atendente + retirante) e cada linha da sessao contra pendencia/saldo atuais.
 */
export function obterErroRegistroSessaoRetirada(
  linhas: SessaoRetiradaLinha[],
  documentos: AtendimentoDocumento[],
  atendente: string,
  recebedorTipo: AtendimentoRecebedorTipo,
  recebedorColaboradorId: string,
  recebedor: string,
  recebedorEmpresa: string,
  recebedorDocumento: string,
  recebedorTelefone: string,
  autorizadorInterno: string,
  motivoRetirada: string,
): string | null {
  if (!linhas.length) {
    return 'Nenhum material na sessao de retirada. Bipe os itens ou adicione manualmente antes de confirmar.';
  }

  if (!atendente.trim()) {
    return 'Informe o atendente responsavel.';
  }

  if (recebedorTipo === 'interno' && !recebedorColaboradorId.trim()) {
    return 'Selecione o colaborador interno que esta retirando o material.';
  }

  if (recebedorTipo === 'externo') {
    if (
      !recebedor.trim() ||
      !recebedorEmpresa.trim() ||
      !recebedorDocumento.trim() ||
      !autorizadorInterno.trim() ||
      !motivoRetirada.trim()
    ) {
      return 'Preencha nome, empresa, documento, autorizador interno e motivo para retirante externo.';
    }
    if (recebedorTelefone.replace(/\D/g, '').length < 8) {
      return 'Informe um telefone valido para o retirante externo.';
    }
  }

  const vistos = new Set<string>();

  for (const linha of linhas) {
    const chave = `${linha.documentoId}:${linha.documentoItemId}`;
    if (vistos.has(chave)) {
      return 'Sessao de retirada com linha duplicada. Remova o item repetido e tente novamente.';
    }
    vistos.add(chave);

    if (!Number.isFinite(linha.quantidade) || linha.quantidade <= 0) {
      return `Quantidade invalida para ${linha.codigoMaterial}.`;
    }

    const linhaDoc = obterLinhaDocumento(documentos, linha.documentoId, linha.documentoItemId);
    if (!linhaDoc) {
      return `Item ${linha.codigoMaterial} nao encontrado no documento ${linha.documentoNumero}. Atualize a lista e tente novamente.`;
    }

    const max = quantidadeMaximaLinhaDocumento(linhaDoc);
    if (linha.quantidade > max) {
      return `Quantidade de ${linha.codigoMaterial} excede pendente/saldo (max. ${max} ${linha.unidade}).`;
    }
  }

  const consumoPorCodigo = new Map<string, number>();
  const saldoPorCodigo = new Map<string, number>();
  for (const linha of linhas) {
    const codigo = linha.codigoMaterial.trim().toLowerCase();
    consumoPorCodigo.set(codigo, (consumoPorCodigo.get(codigo) ?? 0) + linha.quantidade);
    const linhaDoc = obterLinhaDocumento(documentos, linha.documentoId, linha.documentoItemId);
    if (linhaDoc && !saldoPorCodigo.has(codigo)) {
      saldoPorCodigo.set(codigo, linhaDoc.saldoDisponivel);
    }
  }
  for (const [codigo, total] of consumoPorCodigo) {
    const saldo = saldoPorCodigo.get(codigo) ?? 0;
    if (total > saldo) {
      const ref = linhas.find((l) => l.codigoMaterial.trim().toLowerCase() === codigo);
      return `Saldo insuficiente para ${ref?.codigoMaterial ?? codigo} (${total} solicitado, saldo ${saldo}).`;
    }
  }

  return null;
}
