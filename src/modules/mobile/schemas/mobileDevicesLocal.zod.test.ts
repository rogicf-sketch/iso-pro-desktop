import { describe, expect, it } from 'vitest';
import { parseMobileDevicesLocal } from './mobileDevicesLocal.zod';

const row = {
  id: 'mob-1',
  deviceId: 'd1',
  nomeAparelho: 'Phone',
  usuarioLogin: 'u',
  usuarioNome: 'U',
  plataforma: 'android' as const,
  modelo: 'M',
  versaoApp: '1',
  status: 'pendente' as const,
  ultimoAcessoEm: '2026-01-01T00:00:00.000Z',
  criadoEm: '2026-01-01T00:00:00.000Z',
};

describe('parseMobileDevicesLocal', () => {
  it('aceita array de dispositivos validos', () => {
    expect(parseMobileDevicesLocal([row])).toEqual([row]);
  });

  it('aceita array vazio', () => {
    expect(parseMobileDevicesLocal([])).toEqual([]);
  });

  it('rejeita item com plataforma invalida', () => {
    expect(parseMobileDevicesLocal([{ ...row, plataforma: 'windows' }])).toBeNull();
  });

  it('rejeita nao-array', () => {
    expect(parseMobileDevicesLocal({})).toBeNull();
  });
});
