import { createContext, useContext, useEffect, useRef } from 'react';
import type { AtendimentoOperacaoGuardResumo } from './atendimentoOperacaoGuard.types';

export type GuardRegistration = AtendimentoOperacaoGuardResumo & {
  onDescartar: () => void;
  onConfirmarRetirada: () => void;
};

export type AtendimentoOperacaoGuardContextValue = {
  isActive: boolean;
  resumo: AtendimentoOperacaoGuardResumo | null;
  register: (registration: GuardRegistration | null) => void;
  requestLeaveConfirm: (onProceed: () => void) => void;
};

export const AtendimentoOperacaoGuardContext = createContext<AtendimentoOperacaoGuardContextValue | null>(null);

export function useAtendimentoOperacaoGuard() {
  return useContext(AtendimentoOperacaoGuardContext);
}

/** Regista sessao de retirada activa para bloquear navegacao acidental. */
export function useRegistrarAtendimentoOperacaoGuard(opts: {
  ativa: boolean;
  itemCount: number;
  documentoCount: number;
  totalUnidades: number;
  onDescartar: () => void;
  onConfirmarRetirada: () => void;
}) {
  const ctx = useAtendimentoOperacaoGuard();
  const optsRef = useRef(opts);

  useEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    if (!ctx) return;
    const cur = optsRef.current;
    if (!cur.ativa || cur.itemCount <= 0) {
      ctx.register(null);
      return;
    }
    ctx.register({
      itemCount: cur.itemCount,
      documentoCount: cur.documentoCount,
      totalUnidades: cur.totalUnidades,
      onDescartar: () => optsRef.current.onDescartar(),
      onConfirmarRetirada: () => optsRef.current.onConfirmarRetirada(),
    });
    return () => ctx.register(null);
  }, [ctx, opts.ativa, opts.itemCount, opts.documentoCount, opts.totalUnidades]);
}
