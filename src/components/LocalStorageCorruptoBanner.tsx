import { useCallback, useLayoutEffect, useState } from 'react';
import {
  ISO_PRO_LOCAL_STORAGE_INVALIDO_EVENT,
  type LocalStorageInvalidoDetail,
} from '@/lib/localStoragePreservacao';
import { OperationalNotice } from '@/components/ui/OperationalNotice';

type Item = LocalStorageInvalidoDetail & { id: string };

export function LocalStorageCorruptoBanner() {
  const [items, setItems] = useState<Item[]>([]);

  const append = useCallback((detail: LocalStorageInvalidoDetail) => {
    if (!detail.storageKey?.trim()) return;
    setItems((prev) => {
      if (prev.some((x) => x.storageKey === detail.storageKey)) return prev;
      return [...prev, { ...detail, id: crypto.randomUUID() }];
    });
  }, []);

  useLayoutEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<LocalStorageInvalidoDetail>;
      if (ce.detail) append(ce.detail);
    };
    window.addEventListener(ISO_PRO_LOCAL_STORAGE_INVALIDO_EVENT, handler as EventListener);
    return () => window.removeEventListener(ISO_PRO_LOCAL_STORAGE_INVALIDO_EVENT, handler as EventListener);
  }, [append]);

  const dispensar = (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  const dispensarTodos = () => {
    setItems([]);
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
            A chave <code>{item.storageKey}</code> no navegador tem JSON ilegivel ou invalido. O valor bruto{' '}
            <strong>nao foi substituido</strong> por dados de exemplo; este modulo pode mostrar lista vazia ou
            valores por omissao ate recuperar backup ou corrigir os dados. Em caso de duvida, use Ferramentas de
            programador (F12) → Application → Local Storage para inspecionar ou exportar a chave antes de alterar.
            {item.detalhe ? ` ${item.detalhe}` : ''}
          </p>
          <div className="local-storage-invalid-banner-actions">
            <button type="button" className="ghost-button" onClick={() => dispensar(item.id)}>
              Dispensar este aviso
            </button>
          </div>
        </OperationalNotice>
      ))}
      {items.length > 1 ? (
        <div className="local-storage-invalid-banner-actions">
          <button type="button" className="ghost-button" onClick={dispensarTodos}>
            Dispensar todos ({items.length})
          </button>
        </div>
      ) : null}
    </div>
  );
}
