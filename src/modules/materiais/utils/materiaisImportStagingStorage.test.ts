/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { montarModeloCsvImportacaoMateriais } from '../services/materiais.service';
import {
  loadPersistedMateriaisImportStaging,
  MATERIAIS_IMPORT_STAGING_STORAGE_KEY,
  persistMateriaisImportStaging,
} from './materiaisImportStagingStorage';

describe('materiaisImportStagingStorage', () => {
  afterEach(() => {
    localStorage.removeItem(MATERIAIS_IMPORT_STAGING_STORAGE_KEY);
    vi.useRealTimers();
  });

  it('round-trip: persiste e restaura staging valido', () => {
    const { csv } = montarModeloCsvImportacaoMateriais();
    const staging = { fileName: 'test.csv', text: csv, linhaCount: 2 };
    persistMateriaisImportStaging(staging);
    const restored = loadPersistedMateriaisImportStaging();
    expect(restored).not.toBeNull();
    expect(restored?.fileName).toBe('test.csv');
    expect(restored?.text).toBe(csv);
    expect(restored?.linhaCount).toBeGreaterThan(0);
  });

  it('persist null remove a chave', () => {
    persistMateriaisImportStaging({ fileName: 'x.csv', text: 'codigo;descricao\nA;B', linhaCount: 1 });
    expect(localStorage.getItem(MATERIAIS_IMPORT_STAGING_STORAGE_KEY)).toBeTruthy();
    persistMateriaisImportStaging(null);
    expect(localStorage.getItem(MATERIAIS_IMPORT_STAGING_STORAGE_KEY)).toBeNull();
  });

  it('ignora payload expirado', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2020-01-01T12:00:00Z'));
    const { csv } = montarModeloCsvImportacaoMateriais();
    persistMateriaisImportStaging({ fileName: 'old.csv', text: csv, linhaCount: 2 });
    vi.setSystemTime(new Date('2020-01-20T12:00:00Z'));
    expect(loadPersistedMateriaisImportStaging()).toBeNull();
    expect(localStorage.getItem(MATERIAIS_IMPORT_STAGING_STORAGE_KEY)).toBeNull();
  });

  it('remove JSON invalido', () => {
    localStorage.setItem(MATERIAIS_IMPORT_STAGING_STORAGE_KEY, '{not json');
    expect(loadPersistedMateriaisImportStaging()).toBeNull();
  });
});
