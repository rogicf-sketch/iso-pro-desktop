import { describe, expect, it } from 'vitest';
import { formatDocumentoNumeroDisplay } from './formatDocumentoNumeroDisplay';

describe('formatDocumentoNumeroDisplay', () => {
  it('preserva aspas retos de polegadas', () => {
    expect(formatDocumentoNumeroDisplay('AG-6"-UT-245-CS11-NI')).toBe('AG-6"-UT-245-CS11-NI');
  });

  it('repara mojibake de aspas tipograficas', () => {
    expect(formatDocumentoNumeroDisplay('AG-6â€œ-UT-245')).toBe('AG-6"-UT-245');
    expect(formatDocumentoNumeroDisplay('AG-6â€-UT-245')).toBe('AG-6"-UT-245');
  });

  it('repara truncamento â€ entre digito e hifen', () => {
    expect(formatDocumentoNumeroDisplay('AG-6â€-UT-245-CS11-NI')).toBe('AG-6"-UT-245-CS11-NI');
  });

  it('normaliza aspas unicode', () => {
    expect(formatDocumentoNumeroDisplay('AG-6”-UT')).toBe('AG-6"-UT');
  });
});
