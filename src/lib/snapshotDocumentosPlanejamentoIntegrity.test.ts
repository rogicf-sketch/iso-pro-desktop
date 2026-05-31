import { describe, expect, it } from 'vitest';
import {
  limparRefsAtendimentoIncompativeisComPlanejamento,
  mensagemSePlanejamentoIncompativelComRefsAtendimento,
} from './snapshotDocumentosPlanejamentoIntegrity';

describe('mensagemSePlanejamentoIncompativelComRefsAtendimento', () => {
  it('permite quando nao ha referencias de atendimento', () => {
    expect(
      mensagemSePlanejamentoIncompativelComRefsAtendimento(
        { documentos: [{ id: 'd1', numero: 'DOC-1' }] },
        [{ id: 'd1', numero: 'DOC-1' }],
      ),
    ).toBeNull();
  });

  it('permite quando todas as referencias estao cobertas pelo proximo planejamento', () => {
    const payload = {
      documentos: [{ id: 'd1', numero: 'DOC-1' }],
      atendimentoHistorico: [{ documentoId: 'd1', documento: 'DOC-1' }],
    };
    expect(mensagemSePlanejamentoIncompativelComRefsAtendimento(payload, [{ id: 'd1', numero: 'DOC-1' }])).toBeNull();
  });

  it('bloqueia quando remove desenho ainda referenciado no estado anterior', () => {
    const payload = {
      documentos: [
        { id: 'd1', numero: 'DOC-1' },
        { id: 'd2', numero: 'DOC-2' },
      ],
      atendimentoHistorico: [{ documentoId: 'd2', documento: 'doc-2' }],
    };
    const msg = mensagemSePlanejamentoIncompativelComRefsAtendimento(payload, [{ id: 'd1', numero: 'DOC-1' }]);
    expect(msg).toContain('Gravacao bloqueada');
    expect(msg).toContain('d2');
  });

  it('bloqueia quando ha mais chaves distintas do que desenhos a gravar (estado incoerente)', () => {
    const payload = {
      documentos: [
        { id: 'a', numero: 'A' },
        { id: 'b', numero: 'B' },
      ],
      atendimentoHistorico: [
        { documento: 'X' },
        { documento: 'Y' },
        { documento: 'Z' },
      ],
    };
    const msg = mensagemSePlanejamentoIncompativelComRefsAtendimento(payload, [{ id: 'a', numero: 'A' }]);
    expect(msg).toContain('referencia(s) distintas');
  });

  it('bloqueia historico orfao (ref nao esta no planejamento anterior nem no novo)', () => {
    const payload = {
      documentos: [{ id: 'd1', numero: 'DOC-1' }],
      atendimentoHistorico: [{ documentoId: 'orphan-id', documento: 'DESENHO-ANTIGO' }],
    };
    const nextDocs = Array.from({ length: 551 }, (_, i) => ({
      id: `new-${i}`,
      numero: `DOC-${i}`,
    }));
    const msg = mensagemSePlanejamentoIncompativelComRefsAtendimento(payload, nextDocs);
    expect(msg).toContain('Gravacao bloqueada');
    expect(msg).toContain('orphan-id');
  });

  it('dispensar validacao ignora bloqueio (exclusao definitiva controlada)', () => {
    const payload = {
      documentos: [
        { id: 'd1', numero: 'DOC-1' },
        { id: 'd2', numero: 'DOC-2' },
      ],
      atendimentoHistorico: [{ documentoId: 'd2', documento: 'DOC-2' }],
    };
    expect(
      mensagemSePlanejamentoIncompativelComRefsAtendimento(payload, [{ id: 'd1', numero: 'DOC-1' }], {
        dispensarValidacao: true,
      }),
    ).toBeNull();
  });

  it('limparRefs remove historico orfao e permite gravacao', () => {
    const payload = {
      documentos: [{ id: 'd1', numero: 'DOC-1' }],
      atendimentoHistorico: [{ documentoId: 'orphan-id', documento: 'DESENHO-ANTIGO' }],
      atendimentos: [{ documentoId: 'orphan-id', documentoNumero: 'DESENHO-ANTIGO' }],
    };
    const nextDocs = [{ id: 'new-1', numero: 'NOVO-001' }];
    const limpo = limparRefsAtendimentoIncompativeisComPlanejamento(payload, nextDocs);
    expect(limpo.removidosHistorico).toBe(1);
    expect(limpo.removidosAtendimentos).toBe(1);
    expect(
      mensagemSePlanejamentoIncompativelComRefsAtendimento(
        { ...payload, atendimentoHistorico: limpo.atendimentoHistorico, atendimentos: limpo.atendimentos },
        nextDocs,
      ),
    ).toBeNull();
  });
});
