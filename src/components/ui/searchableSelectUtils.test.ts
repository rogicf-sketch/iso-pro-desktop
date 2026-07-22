import { describe, expect, it } from 'vitest';
import {
  labelDocumentoNumero,
  labelMatchesSearch,
  resolveSearchableOption,
} from './searchableSelectUtils';

describe('searchableSelectUtils', () => {
  const options = [
    {
      value: 'id-above',
      label: 'E.RAZN010-IE6-00002-ABOVE Rev. A - LISTA DE CABOS GREENFIELD',
    },
    {
      value: 'id-under',
      label: 'E.RAZN010-IE6-00002-UNDER Rev. A - LISTA DE CABOS GREENFIELD',
    },
  ];

  it('resolve por numero do desenho sem precisar do label completo', () => {
    expect(resolveSearchableOption(options, 'E.RAZN010-IE6-00002-ABOVE')?.value).toBe('id-above');
    expect(labelDocumentoNumero(options[0]!.label)).toBe('E.RAZN010-IE6-00002-ABOVE');
  });

  it('nao resolve quando o numero e ambiguo', () => {
    expect(resolveSearchableOption(options, 'E.RAZN010-IE6-00002')).toBeUndefined();
  });

  it('labelMatchesSearch encontra trecho do numero', () => {
    expect(labelMatchesSearch(options[0]!.label, 'RAZN010-IE6-00002-ABOVE')).toBe(true);
  });
});
