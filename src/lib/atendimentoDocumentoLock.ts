import {
  claimResourceLock,
  isResourceLockHeldByOther,
  releaseResourceLock,
  type ResourceLockClaim,
} from './resourceLock';

export type AtendimentoLockClaim = ResourceLockClaim;

/** Outro posto detém o desenho — atendimento deve ficar bloqueado. */
export function isAtendimentoLockHeldByOther(claim: AtendimentoLockClaim): boolean {
  return isResourceLockHeldByOther(claim);
}

export function mensagemAtendimentoLockBloqueado(claim: AtendimentoLockClaim): string {
  const quem = (claim.holderLabel || claim.holderLogin || 'outro posto').trim();
  return `Desenho em uso por ${quem}. Atendimento bloqueado neste documento até o outro posto libertar.`;
}

export async function claimAtendimentoDocumentoLock(input: {
  documentoId: string;
  holderLogin: string;
  holderLabel?: string;
  ttlSeconds?: number;
}): Promise<AtendimentoLockClaim> {
  return claimResourceLock({
    kind: 'atendimento',
    resourceId: input.documentoId,
    holderLogin: input.holderLogin,
    holderLabel: input.holderLabel,
    ttlSeconds: input.ttlSeconds,
  });
}

export async function releaseAtendimentoDocumentoLock(input: {
  documentoId: string;
  holderLogin: string;
}): Promise<void> {
  return releaseResourceLock({
    kind: 'atendimento',
    resourceId: input.documentoId,
    holderLogin: input.holderLogin,
  });
}
