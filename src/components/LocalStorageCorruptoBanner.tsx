import { useCallback, useLayoutEffect, useState } from 'react';
import {
  ISO_PRO_LOCAL_STORAGE_INVALIDO_EVENT,
  ISO_PRO_LOCAL_STORAGE_REPARADO_EVENT,
  repararLocalStorageCorrupto,
  type LocalStorageInvalidoDetail,
  type LocalStorageReparadoDetail,
} from '@/lib/localStoragePreservacao';
import { OperationalNotice } from '@/components/ui/OperationalNotice';

type Item = LocalStorageInvalidoDetail & { id: string };

export function LocalStorageCorruptoBanner() {
  const [items, setItems] = useState<Item[]>([]);
  const [reparando, setReparando] = useState(false);

  const append = useCallback((detail: LocalStorageInvalidoDetail) => {
    if (!detail.storageKey?.trim()) return;
    setItems((prev) => {
      if (prev.some((x) => x.storageKey === detail.storageKey)) return prev;
      return [...prev, { ...detail, id: crypto.randomUUID() }];
    });
  }, []);

  useLayoutEffect(() => {
    const onInvalido = (e: Event) => {
      const ce = e as CustomEvent<LocalStorageInvalidoDetail>;
      if (ce.detail) append(ce.detail);
    };
    const onReparado = (e: Event) => {
      const ce = e as CustomEvent<LocalStorageReparadoDetail>;
      const key = ce.detail?.storageKey?.trim();
      if (!key) return;
      setItems((prev) => prev.filter((x) => x.storageKey !== key));
    };
    window.addEventListener(ISO_PRO_LOCAL_STORAGE_INVALIDO_EVENT, onInvalido as EventListener);
    window.addEventListener(ISO_PRO_LOCAL_STORAGE_REPARADO_EVENT, onReparado as EventListener);
    return () => {
      window.removeEventListener(ISO_PRO_LOCAL_STORAGE_INVALIDO_EVENT, onInvalido as EventListener);
      window.removeEventListener(ISO_PRO_LOCAL_STORAGE_REPARADO_EVENT, onReparado as EventListener);
    };
  }, [append]);

  const dispensar = (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const dispensarTodos = () => {
    setItems([]);
  };

  const repararERecarregar = (storageKey: string) => {
    setReparando(true);
    const ok = repararLocalStorageCorrupto(storageKey);
    if (ok) {
      window.location.reload();
      return;
    }
    setReparando(false);
  };

  const repararTodosERecarregar = () => {
    setReparando(true);
    for (const item of items) {
      repararLocalStorageCorrupto(item.storageKey);
    }
    window.location.reload();
  };

  if (!items.length) return null;

  return (
    <div className="local-storage-invalid-banner-stack" role="region" aria-label="Avisos de armazenamento local">
      {items.map((item) => (
        <OperationalNotice key={item.id} tone="critical">
          <p className="local-storage-invalid-banner-title">
            <strong>Armazenamento local com problema</strong> — {item.modulo}
          </p>
          <p className="local-storage-invalid-banner-body">
            A chave <code>{item.storageKey}</code> no navegador tem JSON ilegivel ou invalido (cache local
            corrompido — a nuvem continua intacta). O Planejamento pode mostrar lista vazia ou quantidades
            antigas ate limpar esta chave e voltar a carregar da nuvem.
            {item.detalhe ? ` ${item.detalhe}` : ''}
          </p>
          <div className="local-storage-invalid-banner-actions">
            <button
              type="button"
              className="primary-button"
              disabled={reparando}
              onClick={() => repararERecarregar(item.storageKey)}
            >
              {reparando ? 'A reparar…' : 'Reparar com a nuvem'}
            </button>
            <button type="button" className="ghost-button" disabled={reparando} onClick={() => dispensar(item.id)}>
              Dispensar este aviso
            </button>
          </div>
        </OperationalNotice>
      ))}
      {items.length > 1 ? (
        <div className="local-storage-invalid-banner-actions">
          <button type="button" className="primary-button" disabled={reparando} onClick={repararTodosERecarregar}>
            Reparar todos e recarregar ({items.length})
          </button>
          <button type="button" className="ghost-button" disabled={reparando} onClick={dispensarTodos}>
            Dispensar todos
          </button>
        </div>
      ) : null}
    </div>
  );
}
