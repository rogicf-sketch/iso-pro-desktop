import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ hasSupabaseConfig: () => true }));

import {
  contarRegistosArrayLocalStorage,
  mensagemSeSubstituirLocalPerderiaCadastros,
} from './localSnapshotWriteGuard';

const store: Record<string, string> = {};

describe('localSnapshotWriteGuard', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
      } as Storage,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(store)) delete store[k];
  });

  it('contarRegistosArrayLocalStorage retorna 0 para chave ausente', () => {
    expect(contarRegistosArrayLocalStorage('iso-pro-desktop-inexistente')).toBe(0);
  });

  it('contarRegistosArrayLocalStorage conta array valido', () => {
    store['k'] = JSON.stringify([{ a: 1 }, { b: 2 }]);
    expect(contarRegistosArrayLocalStorage('k')).toBe(2);
  });

  it('mensagem quando local tem mais registos que a gravacao', () => {
    store['iso-pro-x'] = JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const msg = mensagemSeSubstituirLocalPerderiaCadastros([
      { storageKey: 'iso-pro-x', tamanhoNovaLista: 1, nomeCurto: 'item(ns)' },
    ]);
    expect(msg).toMatch(/armazenamento deste navegador/i);
    expect(msg).toContain('3');
    expect(msg).toContain('1');
  });

  it('null quando contagens alinham', () => {
    store['iso-pro-y'] = JSON.stringify([{ id: 1 }]);
    expect(
      mensagemSeSubstituirLocalPerderiaCadastros([
        { storageKey: 'iso-pro-y', tamanhoNovaLista: 1, nomeCurto: 'item(ns)' },
      ]),
    ).toBeNull();
  });
});
