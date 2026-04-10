import { describe, expect, it } from 'vitest';
import {
  colaboradorRowToFormData,
  montarModeloCsvImportacaoColaboradores,
  previewImportacaoColaboradoresCsv,
} from './colaboradores.import.csv';

describe('colaboradores.import.csv', () => {
  it('preview aceita CSV com cabecalho e uma linha', () => {
    const csv = 'nome;tipo;matricula\nJoao;interno;1\n';
    const r = previewImportacaoColaboradoresCsv(csv);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.linhaCount).toBe(1);
  });

  it('preview rejeita arquivo vazio', () => {
    const r = previewImportacaoColaboradoresCsv('nome\n');
    expect(r.ok).toBe(false);
  });

  it('colaboradorRowToFormData preenche interno com empresa padrao', () => {
    const form = colaboradorRowToFormData({
      nome: ' Teste ',
      tipo: 'interno',
      matricula: '1',
      funcao: 'Op',
      empresa: '',
      documento: '',
      telefone: '',
      observacao: '',
      ativo: 'sim',
    });
    expect(form.nome).toBe('Teste');
    expect(form.tipo).toBe('interno');
    expect(form.empresa).toBe('ISO PRO');
    expect(form.ativo).toBe(true);
  });

  it('montarModeloCsv inclui BOM e nome de arquivo', () => {
    const { csv, fileName } = montarModeloCsvImportacaoColaboradores();
    expect(fileName).toContain('colaboradores');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('nome');
    expect(csv).toContain('Maria Exemplo');
  });
});
