/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';

import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '../../../lib/logoInstitucional.constants';

import {

  ehLogoInstitucionalPadraoFabrica,

  extrairConfigReciboMobileParaSnapshot,

  logoInstitucionalLocalConfigurado,

  normalizarLogoInstitucionalParaSnapshotMobile,

  reciboConfigLocalPendenteEnvioNuvem,

} from './configReciboMobileSnapshot';



vi.mock('../../../lib/imageCompress', () => ({

  compressImageFileToJpeg: vi.fn(async (file: File) => ({

    blob: new Blob([await file.arrayBuffer()], { type: 'image/jpeg' }),

    width: 200,

    height: 80,

    originalSize: file.size,

  })),

}));



describe('configReciboMobileSnapshot', () => {

  it('identifica logo padrao de fabrica', () => {

    expect(ehLogoInstitucionalPadraoFabrica('')).toBe(true);

    expect(ehLogoInstitucionalPadraoFabrica(LOGO_INSTITUCIONAL_PADRAO_FABRICA)).toBe(true);

    expect(ehLogoInstitucionalPadraoFabrica('/logo-institutional-default.svg')).toBe(true);

    expect(ehLogoInstitucionalPadraoFabrica('data:image/png;base64,abc')).toBe(false);

  });



  it('identifica logo local personalizado', () => {

    expect(logoInstitucionalLocalConfigurado('data:image/png;base64,x')).toBe(true);

    expect(logoInstitucionalLocalConfigurado(LOGO_INSTITUCIONAL_PADRAO_FABRICA)).toBe(false);

  });



  it('extrai campos do recibo mobile para o snapshot', () => {

    expect(

      extrairConfigReciboMobileParaSnapshot(

        {

          documentoRodapeNome: 'Empresa X',

          documentoRodapeCnpj: '66.234.531/0001-57',

          cliente: 'Cliente A',

          projeto: 'Projeto B',

          contrato: 'CT-1',

          local: 'Obra',

        },

        'data:image/jpeg;base64,logo',

      ),

    ).toEqual({

      logoInstitucionalUrl: 'data:image/jpeg;base64,logo',

      documentoRodapeNome: 'Empresa X',

      documentoRodapeCnpj: '66.234.531/0001-57',

      cliente: 'Cliente A',

      projeto: 'Projeto B',

      contrato: 'CT-1',

      local: 'Obra',

    });

  });



  it('comprime data URL raster ao normalizar para snapshot mobile', async () => {

    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5]);

    const blob = new Blob([png], { type: 'image/png' });

    const dataUrl = await new Promise<string>((resolve) => {

      const fr = new FileReader();

      fr.onload = () => resolve(String(fr.result));

      fr.readAsDataURL(blob);

    });

    const out = await normalizarLogoInstitucionalParaSnapshotMobile(dataUrl);

    expect(out.startsWith('data:image/jpeg;base64,')).toBe(true);

  });



  it('mantem https externo sem comprimir', async () => {

    await expect(normalizarLogoInstitucionalParaSnapshotMobile('https://exemplo.com/logo.png')).resolves.toBe(

      'https://exemplo.com/logo.png',

    );

  });



  it('converte caminho relativo em data URL comprimida quando fetch funciona', async () => {

    const png = new Uint8Array([137, 80, 78, 71]);

    vi.stubGlobal(

      'fetch',

      vi.fn(async () => ({

        ok: true,

        blob: async () => new Blob([png], { type: 'image/png' }),

      })),

    );

    const out = await normalizarLogoInstitucionalParaSnapshotMobile('./meu-logo.png');

    expect(out.startsWith('data:image/jpeg;base64,')).toBe(true);

    vi.unstubAllGlobals();

  });



  it('usa logo padrao quando caminho relativo falha', async () => {

    vi.stubGlobal(

      'fetch',

      vi.fn(async () => ({

        ok: false,

        blob: async () => new Blob([]),

      })),

    );

    await expect(normalizarLogoInstitucionalParaSnapshotMobile('./inexistente.png')).resolves.toBe(

      LOGO_INSTITUCIONAL_PADRAO_FABRICA,

    );

    vi.unstubAllGlobals();

  });



  it('detecta logo/CNPJ locais pendentes na nuvem', () => {

    expect(

      reciboConfigLocalPendenteEnvioNuvem(

        {

          logoInstitucionalUrl: 'data:image/png;base64,x',

          documentoRodapeCnpj: '66.234.531/0001-57',

          cliente: '',

          projeto: '',

          contrato: '',

          local: '',

        },

        { logoInstitucionalUrl: LOGO_INSTITUCIONAL_PADRAO_FABRICA },

      ),

    ).toBe(true);



    expect(

      reciboConfigLocalPendenteEnvioNuvem(

        {

          logoInstitucionalUrl: 'data:image/png;base64,x',

          documentoRodapeCnpj: '66.234.531/0001-57',

          cliente: '',

          projeto: '',

          contrato: '',

          local: '',

        },

        {

          logoInstitucionalUrl: 'data:image/jpeg;base64,y',

          documentoRodapeCnpj: '66.234.531/0001-57',

        },

      ),

    ).toBe(false);

  });

});


