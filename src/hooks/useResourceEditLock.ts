import { useCallback, useEffect, useRef, useState } from 'react';
import {
  claimResourceLock,
  forceReleaseResourceLock,
  isResourceLockHeldByOther,
  mensagemResourceLockBloqueado,
  releaseResourceLock,
  type ResourceLockKind,
} from '../lib/resourceLock';

const HEARTBEAT_MS = 45_000;
const TTL_SECONDS = 120;

export type UseResourceEditLockOptions = {
  kind: ResourceLockKind;
  /** Id do registo em edicao; vazio = nao reclama (criacao). */
  resourceId?: string | null;
  /** false = so visualizacao sem claim. */
  enabled?: boolean;
  holderLogin?: string | null;
  holderLabel?: string | null;
  /** Mostra botao forcar libertar (admin). */
  canForceRelease?: boolean;
};

export type UseResourceEditLockResult = {
  bloqueado: boolean;
  aviso: string;
  forcing: boolean;
  ensureClaim: () => Promise<boolean>;
  forceRelease: () => Promise<boolean>;
};

/**
 * Lock de edicao estilo ERP: claim ao abrir, heartbeat, release no cleanup.
 * Fail-open se RPC ausente (claim.ok); hard-block so com reason === 'held'.
 */
export function useResourceEditLock(options: UseResourceEditLockOptions): UseResourceEditLockResult {
  const kind = options.kind;
  const resourceId = (options.resourceId ?? '').trim();
  const enabled = options.enabled !== false && Boolean(resourceId);
  const login = (options.holderLogin ?? '').trim();
  const label = (options.holderLabel ?? login).trim();
  const canForce = Boolean(options.canForceRelease);

  const [bloqueado, setBloqueado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [forcing, setForcing] = useState(false);
  const heldIdRef = useRef('');
  const bloqueadoRef = useRef(false);

  const applyClaim = useCallback(
    async (id: string): Promise<boolean> => {
      if (!id || !login) {
        setBloqueado(false);
        setAviso('');
        bloqueadoRef.current = false;
        return true;
      }
      const claim = await claimResourceLock({
        kind,
        resourceId: id,
        holderLogin: login,
        holderLabel: label,
        ttlSeconds: TTL_SECONDS,
      });
      if (isResourceLockHeldByOther(claim)) {
        const msg = mensagemResourceLockBloqueado(kind, claim);
        setAviso(msg);
        setBloqueado(true);
        bloqueadoRef.current = true;
        heldIdRef.current = '';
        return false;
      }
      setAviso('');
      setBloqueado(false);
      bloqueadoRef.current = false;
      if (claim.ok) heldIdRef.current = id;
      return true;
    },
    [kind, label, login],
  );

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      const prev = heldIdRef.current;
      if (prev && (!enabled || prev !== resourceId) && login) {
        void releaseResourceLock({ kind, resourceId: prev, holderLogin: login });
        heldIdRef.current = '';
      }
      if (!enabled || !resourceId || !login) {
        if (!cancelled) {
          setBloqueado(false);
          setAviso('');
          bloqueadoRef.current = false;
        }
        return;
      }
      const ok = await applyClaim(resourceId);
      if (cancelled) return;
      void ok;
    }

    void sync();
    const heartbeat = setInterval(() => {
      void sync();
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      const held = heldIdRef.current;
      if (held && login) {
        void releaseResourceLock({ kind, resourceId: held, holderLogin: login });
        heldIdRef.current = '';
      }
    };
  }, [applyClaim, enabled, kind, login, resourceId]);

  const ensureClaim = useCallback(async () => {
    if (!enabled || !resourceId || !login) return true;
    return applyClaim(resourceId);
  }, [applyClaim, enabled, login, resourceId]);

  const forceRelease = useCallback(async () => {
    if (!canForce || !resourceId || !login) return false;
    setForcing(true);
    try {
      const res = await forceReleaseResourceLock({
        kind,
        resourceId,
        actorLogin: login,
      });
      if (!res.ok) {
        setAviso(
          res.reason === 'forbidden'
            ? 'Sem permissao de administrador para forcar libertar o lock.'
            : `Nao foi possivel forcar libertar (${res.reason ?? 'erro'}).`,
        );
        return false;
      }
      return applyClaim(resourceId);
    } finally {
      setForcing(false);
    }
  }, [applyClaim, canForce, kind, login, resourceId]);

  return { bloqueado, aviso, forcing, ensureClaim, forceRelease };
}
