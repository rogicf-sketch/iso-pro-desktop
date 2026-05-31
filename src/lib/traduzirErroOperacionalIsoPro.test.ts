import { describe, expect, it } from 'vitest';
import { MSG_ERRO_LEITURA_NUVEM, traduzirErroOperacionalIsoPro } from './traduzirErroOperacionalIsoPro';

describe('traduzirErroOperacionalIsoPro', () => {
  it('preserva mensagens operacionais da aplicacao', () => {
    const msg = 'Gravacao bloqueada: referencias de atendimento na nuvem nao batem com o planejamento a gravar.';
    expect(traduzirErroOperacionalIsoPro(msg)).toBe(msg);
  });

  it('traduz duplicate key de codigo por tenant', () => {
    expect(
      traduzirErroOperacionalIsoPro(
        'duplicate key value violates unique constraint "materiais_tenant_id_codigo_lower_uidx"',
      ),
    ).toContain('codigo nesta empresa');
  });

  it('traduz materiais_pkey', () => {
    expect(traduzirErroOperacionalIsoPro('duplicate key value violates unique constraint "materiais_pkey"')).toContain(
      'ID de material',
    );
  });

  it('traduz falhas de rede', () => {
    expect(traduzirErroOperacionalIsoPro('TypeError: Failed to fetch')).toBe(MSG_ERRO_LEITURA_NUVEM);
  });
});
