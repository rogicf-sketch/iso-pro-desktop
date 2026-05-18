import { describe, expect, it } from 'vitest';
import type { RirRegistro } from '../../qualidade/types/qualidade.types';
import type { RelatorioFotograficoPayload } from '../types/relatorioFotografico.types';
import {
  analisarRirCertificados,
  certificadoRirInformado,
  montarDestaquesRf,
  pontuarRelatorioFotografico,
} from './relatorioFinalObraInteligencia';

describe('certificadoRirInformado', () => {
  it('trata N/A como sem certificado', () => {
    expect(certificadoRirInformado('N/A')).toBe(false);
    expect(certificadoRirInformado('CERT-123')).toBe(true);
  });
});

describe('analisarRirCertificados', () => {
  it('conta linhas com e sem certificado', () => {
    const rir = [
      {
        status: 'tratado',
        laudo: 'aprovado',
        itensRir: [
          { certificado: 'C-1' },
          { certificado: 'N/A' },
        ],
      },
    ] as unknown as RirRegistro[];
    const r = analisarRirCertificados(rir);
    expect(r.linhasComCertificado).toBe(1);
    expect(r.linhasSemCertificado).toBe(1);
    expect(r.rirComLacunaCertificado).toBe(1);
  });
});

describe('pontuarRelatorioFotografico', () => {
  it('pontua alto com termo de ocorrencia', () => {
    const p = {
      titulo: 'RNC material avariado',
      observacoes: '',
      recebimentoId: '',
      rirCodigo: '',
      fotos: [{ id: '1' }],
    } as unknown as RelatorioFotograficoPayload;
    const { pontuacao, motivos } = pontuarRelatorioFotografico(p, {
      recebimentos: new Map(),
      rirPorCodigo: new Map(),
      rncPorRecebimento: new Map(),
    });
    expect(pontuacao).toBeGreaterThan(0);
    expect(motivos.length).toBeGreaterThan(0);
  });
});

describe('montarDestaquesRf', () => {
  it('retorna ate 3 destaques', () => {
    const payloads = [1, 2, 3, 4].map((i) => ({
      reportId: `rf-${i}`,
      numeroRelatorio: `RF-${i}`,
      titulo: `T${i}`,
      salvoEm: '2026-01-01',
      observacoes: '',
      recebimentoId: '',
      rirCodigo: '',
      fornecedor: '',
      notaFiscal: '',
      fotos: [],
    })) as unknown as RelatorioFotograficoPayload[];
    const ranqueados = payloads.map((payload, i) => ({
      payload,
      pontuacao: 10 - i,
      motivos: ['teste'],
    }));
    expect(montarDestaquesRf(ranqueados)).toHaveLength(3);
  });
});
