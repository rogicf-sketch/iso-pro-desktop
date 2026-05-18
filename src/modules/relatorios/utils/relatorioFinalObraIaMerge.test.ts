import { describe, expect, it } from 'vitest';
import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';
import { analisarRelatorioFinalObra } from './relatorioFinalObraAnalise';
import { aplicarRespostaIaNaApresentacao, mesclarDestaquesComIa } from './relatorioFinalObraIaMerge';
import { montarApresentacaoRelatorioFinalObra } from './relatorioFinalObraInteligencia';

function dadosMinimos(): RelatorioFinalObraDados {
  return {
    contexto: {
      numeroRelatorio: '',
      registrado: false,
      geradoEm: '2026-05-16T12:00:00.000Z',
      cliente: 'Cliente X',
      projeto: 'Obra Y',
      contrato: '',
      local: '',
      rodapeNome: '',
      rodapeCnpj: '',
    },
    totais: {
      documentos: 0,
      documentosCancelados: 0,
      recebimentos: 1,
      recebimentosCancelados: 0,
      rir: 0,
      rirCancelados: 0,
      rnc: 1,
      rncCancelados: 0,
      atendimentos: 0,
      atendimentosEstornados: 0,
      inventarios: 0,
      inventariosAbertos: 0,
      relatoriosFotograficos: 0,
      materiais: 0,
      colaboradores: 0,
      fornecedores: 0,
    },
    documentos: [],
    recebimentos: [
      {
        id: 'rec-1',
        fornecedor: 'F',
        dataRecebimento: '2026-01-01',
        notaFiscal: 'NF-99',
        romaneio: '',
        conferente: '',
        modoRecebimento: 'direto',
        status: 'divergente',
        totalItens: 1,
        quantidadeRecebidaTotal: 10,
        quantidadeConferidaTotal: 5,
        conferenciaItensDivergentes: 1,
      },
    ],
    rir: [],
    rnc: [
      {
        id: 'rnc-1',
        codigo: 'RNC-2026-00001',
        dataRegistro: '2026-02-01',
        setor: '',
        responsavel: '',
        descricao: 'Avaria',
        status: 'aberto',
        planoAcao: '',
        observacoes: '',
        recebimentoId: 'rec-1',
        pedidoCompra: '',
        materialCodigo: '',
        materialDescricao: '',
        quantidadeRejeitada: 1,
        quantidadeRecebidaRef: 10,
        localArmazenagem: '',
        localArmazenagemOutro: '',
        tiposOcorrencia: { avariaFisica: true, quantidadeIncorreta: false, materialIncorreto: false, documentacaoFaltante: false, validadeExpirada: false, outro: false, outroTexto: '' },
        descricaoDetalhada: 'Material danificado com fotos',
        evidencias: { fotosAnexadas: true, copiaPedido: false, copiaNf: false, laudoConferencia: false },
        evidenciasObservacao: '',
        acaoImediataTipo: '',
        acaoImediataObservacoes: '',
        analiseCausaRaiz: '',
        planoAcaoLinhas: [],
        encerramentoParecer: '',
        assinaturaResponsavelRnc: { nome: '', data: '' },
        assinaturaQualidade: { nome: '', data: '' },
        assinaturaFornecedor: { nome: '', data: '' },
        itensRnc: [],
      },
    ],
    atendimentos: [],
    inventarios: [],
    relatoriosFotograficos: [],
  };
}

describe('mesclarDestaquesComIa', () => {
  it('coloca destaques da IA antes dos automáticos e deduplica referência', () => {
    const dados = dadosMinimos();
    const analise = analisarRelatorioFinalObra(dados);
    const merged = mesclarDestaquesComIa(dados, analise, {
      paragrafos: [],
      alertas: [],
      destaques: [
        {
          modulo: 'RNC',
          referencia: 'RNC-2026-00001',
          motivo: 'Avaria com evidência fotográfica — prioridade encerramento',
          severidade: 'critico',
          prioridade: 1,
        },
      ],
    });
    expect(merged[0].motivo).toContain('evidência fotográfica');
    expect(merged.filter((d) => d.referencia === 'RNC-2026-00001')).toHaveLength(1);
  });

  it('aplica secoesModulo na apresentação', () => {
    const dados = dadosMinimos();
    const ap = montarApresentacaoRelatorioFinalObra(dados, []);
    const { apresentacao } = aplicarRespostaIaNaApresentacao(
      dados,
      ap,
      {
        paragrafos: ['Síntese.'],
        alertas: [],
        destaques: [],
        secoes: [{ modulo: 'rnc', paragrafos: ['RNC com evidências fotográficas relevantes.'] }],
      },
      [],
      'gpt-4o-mini',
    );
    expect(apresentacao.secoesModulo?.[0].modulo).toBe('rnc');
    expect(apresentacao.secoesModulo?.[0].paragrafos[0]).toContain('fotográficas');
  });
});
