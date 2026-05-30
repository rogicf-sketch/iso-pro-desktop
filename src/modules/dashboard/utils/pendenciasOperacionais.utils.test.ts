import { describe, expect, it } from 'vitest';
import type { RecebimentoListItem } from '../../recebimentos/types/recebimento.types';
import type { RirRegistro, RncRegistro } from '../../qualidade/types/qualidade.types';
import {
  contarConferenciaPendente,
  listarRirReprovadosSemRnc,
  montarMenuBadgeCounts,
} from './pendenciasOperacionais.utils';

function recebimento(over: Partial<RecebimentoListItem>): RecebimentoListItem {
  return {
    id: 'r1',
    fornecedor: 'F',
    dataRecebimento: '2026-05-01',
    notaFiscal: 'NF',
    romaneio: '',
    conferente: '',
    modoRecebimento: 'aguardando_conferencia',
    status: 'aguardando_conferencia',
    totalItens: 1,
    quantidadeRecebidaTotal: 1,
    quantidadeConferidaTotal: 0,
    conferenciaItensDivergentes: 0,
    ...over,
  };
}

describe('pendenciasOperacionais.utils', () => {
  it('conta conferencias pendentes no menu', () => {
    expect(
      contarConferenciaPendente([
        recebimento({ status: 'aguardando_conferencia' }),
        recebimento({ id: 'r2', status: 'conferido', modoRecebimento: 'aguardando_conferencia' }),
        recebimento({ id: 'r3', status: 'divergente' }),
      ]),
    ).toBe(2);
  });

  it('detecta RIR reprovado sem RNC no recebimento', () => {
    const rir: RirRegistro[] = [
      {
        id: 'rir-1',
        codigo: 'RIR-1',
        dataRegistro: '2026-05-01',
        recebimentoId: 'rec-a',
        uo: '',
        localObra: '',
        contratoNumero: '',
        fornecedorNome: '',
        inspecaoQuantitativa: true,
        inspecaoQualitativa: false,
        inspecaoDimensional: false,
        procedimentoNumero: '',
        solCompraPackList: '',
        obsCurta: '',
        itensRir: [],
        instrumentos: '',
        documentosQc: '',
        observacoesQc: '',
        laudo: 'reprovado',
        assinaturaRecebimento: { nome: '', data: '' },
        assinaturaCq: { nome: '', data: '' },
        assinaturaCliente: { nome: '', data: '' },
        origem: '',
        responsavel: 'Ana',
        descricao: '',
        status: 'aberto',
        acaoImediata: '',
        observacoes: '',
      },
    ];
    const rnc: RncRegistro[] = [
      {
        id: 'rnc-1',
        codigo: 'RNC-1',
        dataRegistro: '2026-05-02',
        setor: '',
        responsavel: '',
        descricao: '',
        status: 'aberto',
        planoAcao: '',
        observacoes: '',
        recebimentoId: 'rec-b',
        pedidoCompra: '',
        materialCodigo: '',
        materialDescricao: '',
        quantidadeRejeitada: 0,
        quantidadeRecebidaRef: 0,
        localArmazenagem: '',
        localArmazenagemOutro: '',
        tiposOcorrencia: {
          avariaFisica: false,
          quantidadeIncorreta: false,
          materialIncorreto: false,
          documentacaoFaltante: false,
          validadeExpirada: false,
          outro: false,
          outroTexto: '',
        },
        descricaoDetalhada: '',
        evidencias: { fotosAnexadas: false, copiaPedido: false, copiaNf: false, laudoConferencia: false },
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
    ];
    const lista = listarRirReprovadosSemRnc(rir, rnc);
    expect(lista).toHaveLength(1);
    expect(lista[0]?.codigo).toBe('RIR-1');
  });

  it('monta contagens do menu', () => {
    const badges = montarMenuBadgeCounts({
      recebimentos: [recebimento({})],
      rir: [],
      rnc: [],
      inventarios: [],
    });
    expect(badges.conferencia).toBe(1);
    expect(badges.recebimentos).toBe(1);
  });
});
