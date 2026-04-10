import { describe, expect, it } from 'vitest';
import {
  digitoVerificadorEan13,
  extrairSequenciaCodigoBarrasInterno,
  gerarProximoCodigoBarrasEan13,
} from './gerarCodigoBarrasEan13';

describe('gerarCodigoBarrasEan13', () => {
  it('calcula digito verificador EAN-13 (exemplo prefixo interno)', () => {
    expect(digitoVerificadorEan13('789999900001')).toBe('5');
    expect(digitoVerificadorEan13('789999900002')).toBe('2');
  });

  it('gera primeiro codigo quando nao ha materiais', () => {
    expect(gerarProximoCodigoBarrasEan13([])).toBe('7899999000015');
  });

  it('incrementa sequencia pelo maior prefixo interno existente', () => {
    expect(
      gerarProximoCodigoBarrasEan13([{ codigoBarras: '7899999000015' }, { codigoBarras: '7899999000053' }]),
    ).toBe('7899999000060');
  });

  it('extrai sequencia de codigo interno', () => {
    expect(extrairSequenciaCodigoBarrasInterno('7899999000015')).toBe(1);
    expect(extrairSequenciaCodigoBarrasInterno('7899999000128')).toBe(12);
    expect(extrairSequenciaCodigoBarrasInterno('')).toBeNull();
    expect(extrairSequenciaCodigoBarrasInterno('123')).toBeNull();
  });
});
