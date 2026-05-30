import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import {
  AtendimentoOperacaoGuardContext,
  type GuardRegistration,
} from './atendimentoOperacaoGuard.hooks';

export function AtendimentoOperacaoGuardProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<GuardRegistration | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const pendingProceedRef = useRef<(() => void) | null>(null);
  const blockedByRouterRef = useRef(false);

  const isActive = Boolean(registration && registration.itemCount > 0);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isActive && currentLocation.pathname !== nextLocation.pathname,
  );

  const register = useCallback((next: GuardRegistration | null) => {
    setRegistration(next);
  }, []);

  const openModal = useCallback((opts?: { routerBlocked?: boolean; onProceed?: () => void }) => {
    blockedByRouterRef.current = opts?.routerBlocked ?? false;
    pendingProceedRef.current = opts?.onProceed ?? null;
    setModalOpen(true);
  }, []);

  const requestLeaveConfirm = useCallback(
    (onProceed: () => void) => {
      if (!isActive) {
        onProceed();
        return;
      }
      openModal({ onProceed });
    },
    [isActive, openModal],
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      openModal({ routerBlocked: true });
    }
  }, [blocker.state, blocker.location, openModal]);

  useEffect(() => {
    if (!isActive) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isActive]);

  const fecharModal = useCallback(() => {
    setModalOpen(false);
    pendingProceedRef.current = null;
    if (blockedByRouterRef.current && blocker.state === 'blocked') {
      blocker.reset();
    }
    blockedByRouterRef.current = false;
  }, [blocker]);

  const continuarAtendimento = useCallback(() => {
    fecharModal();
  }, [fecharModal]);

  const descartarESair = useCallback(() => {
    registration?.onDescartar();
    const proceed = pendingProceedRef.current;
    const routerBlocked = blockedByRouterRef.current;
    setModalOpen(false);
    pendingProceedRef.current = null;
    blockedByRouterRef.current = false;
    if (routerBlocked && blocker.state === 'blocked') {
      blocker.proceed();
    } else {
      proceed?.();
    }
  }, [blocker, registration]);

  const irConfirmarRetirada = useCallback(() => {
    fecharModal();
    registration?.onConfirmarRetirada();
  }, [fecharModal, registration]);

  const api = useMemo(
    () => ({
      isActive,
      resumo: registration,
      register,
      requestLeaveConfirm,
    }),
    [isActive, registration, register, requestLeaveConfirm],
  );

  return (
    <AtendimentoOperacaoGuardContext.Provider value={api}>
      {children}
      <Modal onClose={continuarAtendimento} open={modalOpen} title="Retirada em andamento — confirmar saida" wide>
        {registration ? (
          <div className="editor-block stack-grid">
            <OperationalNotice tone="warning">
              Voce ainda tem uma <strong>sessao de retirada em andamento</strong> no modulo Atendimento (
              <strong>{registration.documentoCount}</strong> desenho(s), <strong>{registration.itemCount}</strong>{' '}
              item(ns), <strong>{registration.totalUnidades}</strong> unidade(s)). Nao e possivel mudar de modulo sem
              escolher uma opcao abaixo — os materiais bipados ainda nao foram confirmados no sistema.
            </OperationalNotice>
            <p className="panel-copy">Deseja continuar o atendimento, confirmar a retirada ou descartar e sair?</p>
            <div className="form-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
              <Button onClick={continuarAtendimento} type="button">
                Continuar atendimento
              </Button>
              <Button onClick={irConfirmarRetirada} type="button" variant="ghost">
                Confirmar retirada agora
              </Button>
              <Button onClick={descartarESair} type="button" variant="ghost">
                Descartar sessao e sair
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </AtendimentoOperacaoGuardContext.Provider>
  );
}
