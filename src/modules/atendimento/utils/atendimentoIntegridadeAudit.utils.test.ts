import { describe, expect, it } from 'vitest';
import { auditarIntegridadeAtendimentoSnapshot } from './atendimentoIntegridadeAudit.utils';

describe('atendimentoIntegridadeAudit', () => {
  it('detecta lote duplicado mesmo material e desenho (/UT-187)', () => {
    const rel = auditarIntegridadeAtendimentoSnapshot({
      documentos: [
        {
          id: 'd1',
          numero: '/UT-187',
          revisao: 'D',
          itens: [
            { id: 'i1', codigo: 'C9CBD01Q003F49-7928708', quantidade: 3, quantidadeAtendida: 3 },
            { id: 'i2', codigo: 'TUB08A1200AT25-7988014', quantidade: 2.7, quantidadeAtendida: 2.7 },
          ],
        },
      ],
      atendimentos: [
        {
          id: 'a1',
          numero: 'ATD-20260707-00073',
          documentoNumero: '/UT-187',
          recebedor: 'Caua',
          status: 'concluido',
          dataAtendimento: '2026-07-07T12:48:00Z',
          itens: [
            { codigoMaterial: 'C9CBD01Q003F49-7928708', documentoNumero: '/UT-187', quantidadeAtendida: 1 },
            { codigoMaterial: 'TUB08A1200AT25-7988014', documentoNumero: '/UT-187', quantidadeAtendida: 1.7 },
          ],
        },
        {
          id: 'a2',
          numero: 'ATD-20260708-00074',
          documentoNumero: '/UT-187',
          recebedor: 'Romario',
          status: 'concluido',
          dataAtendimento: '2026-07-08T21:20:00Z',
          itens: [
            { codigoMaterial: 'C9CBD01Q003F49-7928708', documentoNumero: '/UT-187', quantidadeAtendida: 1 },
            { codigoMaterial: 'TUB08A1200AT25-7988014', documentoNumero: '/UT-187', quantidadeAtendida: 1.7 },
          ],
        },
      ],
    });

    expect(rel.resumo.criticos).toBeGreaterThanOrEqual(2);
    expect(rel.achados.some((a) => a.codigo === 'LOTE_DUPLICADO_MATERIAL_DESENHO')).toBe(true);
    expect(rel.achados.some((a) => a.codigo === 'DESENHO_MULTIPLOS_ATENDIMENTOS' && a.documentoNumero === '/UT-187')).toBe(
      true,
    );
  });

  it('detecta excede planejamento', () => {
    const rel = auditarIntegridadeAtendimentoSnapshot({
      documentos: [
        {
          numero: 'DOC-A',
          revisao: 'A',
          itens: [{ codigo: 'M1', quantidade: 2, quantidadeAtendida: 3 }],
        },
      ],
    });
    expect(rel.achados.some((a) => a.codigo === 'EXCEDE_PLANEJAMENTO')).toBe(true);
  });

  it('nao alerta desenho com um unico lote', () => {
    const rel = auditarIntegridadeAtendimentoSnapshot({
      documentos: [{ numero: 'DOC-B', itens: [{ codigo: 'M2', quantidade: 5, quantidadeAtendida: 2 }] }],
      atendimentos: [
        {
          numero: 'ATD-1',
          recebedor: 'Joao',
          status: 'concluido',
          itens: [{ codigoMaterial: 'M2', documentoNumero: 'DOC-B', quantidadeAtendida: 2 }],
        },
      ],
    });
    expect(rel.achados.filter((a) => a.codigo === 'LOTE_DUPLICADO_MATERIAL_DESENHO')).toHaveLength(0);
  });
});
