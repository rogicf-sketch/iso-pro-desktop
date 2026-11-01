import { describe, expect, it } from 'vitest';
import {
  cssLogoInstitucionalImpressao,
  dimensoesLogoInstitucionalHtml,
  dimensoesLogoInstitucionalPdf,
  formatoQuadroPelaProporcao,
  LOGO_INSTITUCIONAL_TAMANHO_PADRAO,
  normalizarLogoInstitucionalTamanho,
  resolverFormatoQuadroEfetivo,
} from './logoInstitucionalTamanho';

describe('logoInstitucionalTamanho', () => {
  it('normaliza valores invalidos para auto', () => {
    expect(normalizarLogoInstitucionalTamanho(undefined)).toBe('auto');
    expect(normalizarLogoInstitucionalTamanho('')).toBe('auto');
    expect(normalizarLogoInstitucionalTamanho('gigante')).toBe('auto');
    expect(normalizarLogoInstitucionalTamanho('GRANDE')).toBe('grande');
  });

  it('escolhe formato pela proporcao (TECHGEAR ≈ 1:1 → quadrado)', () => {
    expect(formatoQuadroPelaProporcao(2.5)).toBe('horizontal');
    expect(formatoQuadroPelaProporcao(1.0)).toBe('quadrado');
    expect(formatoQuadroPelaProporcao(0.6)).toBe('vertical');
    expect(resolverFormatoQuadroEfetivo({ formato: 'auto', aspecto: 1.05 })).toBe('quadrado');
    expect(resolverFormatoQuadroEfetivo({ formato: 'horizontal' })).toBe('horizontal');
  });

  it('quadro quadrado e mais alto que o horizontal tipico', () => {
    const horiz = dimensoesLogoInstitucionalHtml({ formato: 'horizontal', tamanho: 'padrao' });
    const quad = dimensoesLogoInstitucionalHtml({ formato: 'quadrado', tamanho: 'padrao' });
    expect(quad.h).toBeGreaterThan(horiz.h);
    expect(quad.w).toBeLessThan(horiz.w);
    expect(LOGO_INSTITUCIONAL_TAMANHO_PADRAO).toBe('auto');
  });

  it('css define slot fixo e preenche a partir do centro', () => {
    const css = cssLogoInstitucionalImpressao({ formato: 'quadrado', tamanho: 'padrao' }, 130);
    expect(css).toContain('--iso-logo-slot-w:');
    expect(css).toContain('--iso-logo-slot-h:');
    expect(css).toContain('.rir-logo-img');
    expect(css).toContain('object-position: center center');
    expect(css).toContain('transform-origin: center center');
  });

  it('pdf e html usam dimensoes coerentes', () => {
    const html = dimensoesLogoInstitucionalHtml({ formato: 'horizontal', tamanho: 'grande' });
    const pdf = dimensoesLogoInstitucionalPdf({ formato: 'horizontal', tamanho: 'grande' });
    expect(html.w).toBeGreaterThan(100);
    expect(pdf.w).toBe(html.w);
  });
});

