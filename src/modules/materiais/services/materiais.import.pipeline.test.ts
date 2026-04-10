import { describe, expect, it } from 'vitest';
import { construirDocumentoStagingImportacaoMateriais, serializarDocumentoStagingMateriais } from './materiais.import.pipeline';

describe('construirDocumentoStagingImportacaoMateriais', () => {
  it('produz documento JSON com linhas validas e invalidas', () => {
    const csv = ['codigo,descricao,disciplina,unidade', 'OK-1,Descricao ok,Tubulacao,UN', ',Faltou codigo,Tubulacao,UN'].join(
      '\n',
    );
    const { documento, erroEstrutural } = construirDocumentoStagingImportacaoMateriais(csv);
    expect(erroEstrutural).toBeNull();
    expect(documento?.linhas).toHaveLength(2);
    expect(documento?.linhas[0].erros).toHaveLength(0);
    expect(documento?.linhas[1].erros.length).toBeGreaterThan(0);
  });

  it('serializa documento staging como JSON legivel', () => {
    const csv = 'codigo,descricao,disciplina,unidade\nX,Y,Z,UN\n';
    const { documento } = construirDocumentoStagingImportacaoMateriais(csv);
    expect(documento).not.toBeNull();
    const json = serializarDocumentoStagingMateriais(documento!);
    expect(json).toContain('"schemaVersion": 1');
    expect(json).toContain('"fonte": "excel_csv"');
  });
});
