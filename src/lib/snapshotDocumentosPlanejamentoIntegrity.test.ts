import { describe, expect, it } from 'vitest';
import { mensagemSePlanejamentoIncompativelComRefsAtendimento } from './snapshotDocumentosPlanejamentoIntegrity';

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
});
