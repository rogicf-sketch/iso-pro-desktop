import { describe, expect, it } from 'vitest';
import {
  extrairDisciplinaCodigoRir,
  extrairDisciplinaProcedimento,
  formatarDisciplinaExibicaoRir,
  resolverDisciplinaRir,
} from './rirDisciplina';

describe('rirDisciplina', () => {
  it('extrai sigla do procedimento', () => {
    expect(extrairDisciplinaProcedimento('PE-TUB-003 REV.2')).toBe('TUB');
  });

  it('extrai sigla do codigo RIR', () => {
    expect(extrairDisciplinaCodigoRir('RIR-TUB-02')).toBe('TUB');
  });

  it('prioriza disciplina manual', () => {
    expect(
      resolverDisciplinaRir({
        disciplinaManual: 'CIV',
        procedimentoNumero: 'PE-TUB-003 REV.2',
        codigo: 'RIR-TUB-02',
      }),
    ).toBe('CIV');
  });

  it('formata sigla para nome completo no relatorio', () => {
    expect(formatarDisciplinaExibicaoRir('TUB')).toBe('Tubulação');
    expect(formatarDisciplinaExibicaoRir('mec')).toBe('Mecânica');
    expect(formatarDisciplinaExibicaoRir('INS')).toBe('Instrumentação');
    expect(formatarDisciplinaExibicaoRir('ele')).toBe('Elétrica');
    expect(formatarDisciplinaExibicaoRir('Tubulação')).toBe('Tubulação');
  });

  it('usa procedimento, codigo e itens como fallback', () => {
    expect(resolverDisciplinaRir({ procedimentoNumero: 'PE-ELE-001' })).toBe('ELE');
    expect(resolverDisciplinaRir({ codigo: 'RIR-MEC-01' })).toBe('MEC');
    expect(
      resolverDisciplinaRir({
        itensRir: [{ disciplina: 'Tub' }, { disciplina: 'Tub' }, { disciplina: 'Ele' }],
      }),
    ).toBe('Tub');
  });
});
