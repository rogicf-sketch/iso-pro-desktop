import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ISO_PRO_CLOUD_CONNECTION_KEY_BASE,
  migrarCloudConnectionLegadoTenantSeNecessario,
  readIsoProCloudConnection,
  writeIsoProCloudConnection,
} from './isoProCloudConnection';

describe('isoProCloudConnection', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          store = {};
        },
        key: (index: number) => Object.keys(store)[index] ?? null,
        get length() {
          return Object.keys(store).length;
        },
      } as Storage,
    );
  });

  it('grava e le credenciais ao nivel da instalacao', () => {
    writeIsoProCloudConnection({
      supabaseUrl: 'https://proj.supabase.co',
      supabaseAnonKey: 'key-123',
      materiaisNuvem: true,
    });

    const read = readIsoProCloudConnection();
    expect(read?.supabaseUrl).toBe('https://proj.supabase.co');
    expect(read?.supabaseAnonKey).toBe('key-123');
    expect(read?.materiaisNuvem).toBe(true);
    expect(store[ISO_PRO_CLOUD_CONNECTION_KEY_BASE]).toBeTruthy();
  });

  it('migra credenciais de chave legada tenant-scoped', () => {
    store['iso-pro-desktop-configuracoes-sistema::tenant:00000000-0000-0000-0000-000000000002'] =
      JSON.stringify({
        supabaseUrl: 'https://legado.supabase.co',
        supabaseAnonKey: 'legado-key',
        materiaisNuvem: false,
      });

    migrarCloudConnectionLegadoTenantSeNecessario();

    const read = readIsoProCloudConnection();
    expect(read?.supabaseUrl).toBe('https://legado.supabase.co');
    expect(read?.supabaseAnonKey).toBe('legado-key');
  });
});
