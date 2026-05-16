import type { Recebimento } from '../../recebimentos/types/recebimento.types';
import type { RirItemLinha } from '../types/qualidade.types';

/**
 * Delimitadores para inserir/substituir o texto agregado sem duplicar ao mudar o recebimento no formulário.
 * Mantidos em ASCII para regex e cópias entre ambientes.
 */
export const RIR_OBS_ITENS_RECEBIMENTO_INICIO =
  '--- Observacoes por item (modulo Recebimentos / conferencia) ---';
export const RIR_OBS_ITENS_RECEBIMENTO_FIM = '--- Fim observacoes por item ---';

/** Monta o corpo (sem marcadores) só com itens que tenham `observacaoItem` preenchida. */
export function montarCorpoObservacoesItensRecebimento(rec: Recebimento): string {
  const blocos: string[] = [];
  (rec.itens ?? []).forEach((it, idx) => {
    const obs = String(it.observacaoItem ?? '').trim();
    if (!obs) return;
    const cod = String(it.codigoMaterial ?? '').trim() || `Linha ${idx + 1}`;
    const desc = String(it.descricaoMaterial ?? '').trim();
    const titulo = desc.length > 0 ? `${cod} — ${desc}` : cod;
    const obsIndent = obs
      .replace(/\r\n/g, '\n')
      .split('\n')
      .join('\n  ');
    blocos.push(`• ${titulo}\n  ${obsIndent}`);
  });
  return blocos.join('\n\n').trim();
}

/**
 * Remove um bloco anterior (se existir) e insere o novo no início de `observacoesQc`.
 * Se `corpoItens` estiver vazio, apenas remove o bloco (ex.: recebimento sem observações por linha).
 */
export function substituirBlocoObservacoesItensNoTexto(textoExistente: string, corpoItens: string): string {
  const start = RIR_OBS_ITENS_RECEBIMENTO_INICIO;
  const end = RIR_OBS_ITENS_RECEBIMENTO_FIM;
  const raw = String(textoExistente ?? '');
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${esc(start)}\\s*[\\s\\S]*?\\s*${esc(end)}\\s*`, 'm');
  const semBloco = raw.replace(re, '').replace(/\n{3,}/g, '\n\n').trim();

  const corpo = String(corpoItens ?? '').trim();
  if (!corpo) return semBloco;

  const bloco = `${start}\n${corpo}\n${end}`;
  return semBloco ? `${bloco}\n\n${semBloco}` : bloco;
}

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
