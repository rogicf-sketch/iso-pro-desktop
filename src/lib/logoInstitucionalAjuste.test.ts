import { describe, expect, it } from 'vitest';
import {
  boundingBoxConteudoLogo,
  normalizarLogoInstitucionalZoomPct,
  pixelMargemLogo,
} from './logoInstitucionalAjuste';

describe('logoInstitucionalAjuste', () => {
  it('normaliza zoom entre 80 e 280', () => {
    expect(normalizarLogoInstitucionalZoomPct(undefined)).toBe(100);
    expect(normalizarLogoInstitucionalZoomPct(40)).toBe(80);
    expect(normalizarLogoInstitucionalZoomPct(400)).toBe(280);
    expect(normalizarLogoInstitucionalZoomPct(150)).toBe(150);
  });

  it('detecta margem branca e transparente', () => {
    expect(pixelMargemLogo(255, 255, 255, 255)).toBe(true);
    expect(pixelMargemLogo(0, 0, 0, 0)).toBe(true);
    expect(pixelMargemLogo(40, 40, 40, 255)).toBe(false);
    expect(pixelMargemLogo(230, 80, 40, 255)).toBe(false);
  });

  it('encontra caixa do conteudo com padding branco (caso Montcalm)', () => {
    const w = 10;
    const h = 10;
    const data = new Uint8ClampedArray(w * h * 4);
    // tudo branco
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
    // bloco escuro 3x3 no centro
    for (let y = 4; y <= 6; y++) {
      for (let x = 4; x <= 6; x++) {
        const i = (y * w + x) * 4;
        data[i] = 40;
        data[i + 1] = 40;
        data[i + 2] = 40;
        data[i + 3] = 255;
      }
    }
    const box = boundingBoxConteudoLogo(data, w, h);
    expect(box).not.toBeNull();
    expect(box!.w).toBeLessThan(w);
    expect(box!.h).toBeLessThan(h);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
  });
});
