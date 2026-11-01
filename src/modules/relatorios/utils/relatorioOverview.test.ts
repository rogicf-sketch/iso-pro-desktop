import { describe, expect, it } from 'vitest';
import { RELATORIO_CATEGORIA_LABEL, resumoSegurancaExigeAlerta, tomPorContagem } from './relatorioOverview';

describe('relatorioOverview', () => {
  it('rotula categorias em português', () => {
    expect(RELATORIO_CATEGORIA_LABEL.seguranca).toBe('Segurança');
    expect(RELATORIO_CATEGORIA_LABEL.recebimento).toBe('Recebimento');
  });

  it('tom ok quando contagem é zero', () => {
    expect(tomPorContagem(0)).toBe('ok');
  });

  it('tom warning/danger conforme limiar', () => {
    expect(tomPorContagem(3)).toBe('warning');
    expect(tomPorContagem(12, { dangerAt: 10 })).toBe('danger');
  });

  it('alerta de segurança só com números > 0', () => {
    expect(resumoSegurancaExigeAlerta('0 licença(s) expiradas, 0 expirando e 0 sem nome.')).toBe(false);
    expect(resumoSegurancaExigeAlerta('2 licença(s) expiradas, 0 expirando e 0 sem nome.')).toBe(true);
  });
});
