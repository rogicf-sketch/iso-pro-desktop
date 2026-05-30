import { describe, expect, it } from 'vitest';
import type { InventarioListItem } from '../../inventario/types/inventario.types';
import type { RecebimentoListItem } from '../../recebimentos/types/recebimento.types';
import type { RirRegistro, RncRegistro } from '../../qualidade/types/qualidade.types';
import {
  deveEnviarAlertaOperacional,
  diasCorridosDesde,
  listarConferenciasEmAtraso,
  listarRirEmAtraso,
  listarRncEmAtraso,
  montarAlertaOperacionalRelatorio,
  montarAssuntoAlertaOperacional,
  montarCorpoTextoAlertaOperacional,
  montarFingerprintAlertaOperacional,
} from './alertaOperacional.utils';

const ref = new Date('2026-05-24T12:00:00');

function recebimento(over: Partial<RecebimentoListItem>): RecebimentoListItem {
  return {
    id: 'rec-1',
    fornecedor: 'Fornecedor A',
    dataRecebimento: '2026-05-20',
    notaFiscal: 'NF-100',
    romaneio: 'ROM-1',
    conferente: '',
    modoRecebimento: 'aguardando_conferencia',
    status: 'aguardando_conferencia',
    totalItens: 1,
    quantidadeRecebidaTotal: 10,
    quantidadeConferidaTotal: 0,
    conferenciaItensDivergentes: 0,
    ...over,
  };
}

function rir(over: Partial<RirRegistro>): RirRegistro {
  return {
    id: 'rir-1',
    codigo: 'RIR-001',
    dataRegistro: '2026-05-15',
    recebimentoId: 'rec-1',
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
    laudo: 'aprovado',
    assinaturaRecebimento: { nome: '', data: '' },
    assinaturaCq: { nome: '', data: '' },
    assinaturaCliente: { nome: '', data: '' },
    origem: '',
    responsavel: 'Joao',
    descricao: '',
    status: 'aberto',
    acaoImediata: '',
    observacoes: '',
    ...over,
  };
}

function rnc(over: Partial<RncRegistro>): RncRegistro {
  return {
    id: 'rnc-1',
    codigo: 'RNC-001',
    dataRegistro: '2026-05-10',
    setor: '',
    responsavel: 'Maria',
    descricao: '',
    status: 'aberto',
    planoAcao: '',
    observacoes: '',
    recebimentoId: 'rec-1',
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
    planoAcaoLinhas: [{ acao: '', responsavel: '', prazo: '' }],
    encerramentoParecer: '',
    assinaturaResponsavelRnc: { nome: '', data: '' },
    assinaturaQualidade: { nome: '', data: '' },
    assinaturaFornecedor: { nome: '', data: '' },
    itensRnc: [],
    ...over,
  };
}

describe('alertaOperacional.utils', () => {
  it('calcula dias corridos desde data ISO', () => {
    expect(diasCorridosDesde('2026-05-20', ref)).toBe(4);
    expect(diasCorridosDesde('2026-05-24', ref)).toBe(0);
  });

  it('lista conferencias apos prazo de 2 dias', () => {
    const ok = listarConferenciasEmAtraso([recebimento({ dataRecebimento: '2026-05-22' })], 2, ref);
    expect(ok).toHaveLength(1);
    expect(ok[0]?.diasEmAberto).toBe(2);

    const cedo = listarConferenciasEmAtraso([recebimento({ dataRecebimento: '2026-05-23' })], 2, ref);
    expect(cedo).toHaveLength(0);
  });

  it('prioriza RIR reprovado na ordenacao', () => {
    const lista = listarRirEmAtraso(
      [
        rir({ id: 'a', codigo: 'RIR-A', laudo: 'aprovado', dataRegistro: '2026-05-01' }),
        rir({ id: 'b', codigo: 'RIR-B', laudo: 'reprovado', dataRegistro: '2026-05-01' }),
      ],
      5,
      ref,
    );
    expect(lista[0]?.codigo).toBe('RIR-B');
  });

  it('inclui RNC com plano de acao vencido mesmo abaixo do prazo de abertura', () => {
    const lista = listarRncEmAtraso(
      [
        rnc({
          dataRegistro: '2026-05-20',
          planoAcaoLinhas: [{ acao: 'Corrigir', responsavel: 'X', prazo: '2026-05-22' }],
        }),
      ],
      30,
      ref,
    );
    expect(lista).toHaveLength(1);
    expect(lista[0]?.motivo).toBe('plano_acao_vencido');
  });

  it('monta relatorio e fingerprint', () => {
    const rel = montarAlertaOperacionalRelatorio({
      recebimentos: [recebimento({ id: 'r1' })],
      rir: [rir({ id: 'i1' })],
      rnc: [],
      inventarios: [] as InventarioListItem[],
      params: {
        conferenciaHabilitado: true,
        conferenciaPrazoDias: 2,
        rirHabilitado: true,
        rirPrazoDias: 5,
        rncHabilitado: false,
        rncPrazoDias: 7,
        inventarioHabilitado: false,
        inventarioPrazoDias: 7,
        intervaloMinimoHoras: 24,
      },
      ref,
    });
    expect(rel.conferencias).toHaveLength(1);
    expect(rel.rir).toHaveLength(1);
    const fp = montarFingerprintAlertaOperacional(rel);
    expect(fp).toContain('c:r1');
    expect(fp).toContain('r:i1');
  });

  it('deduplica envio por fingerprint e intervalo', () => {
    const fp = 'c:1|r:2';
    expect(
      deveEnviarAlertaOperacional(fp, { lastNotifiedFingerprint: 'outro', lastSentAt: '2026-05-24T00:00:00' }, 24, true, ref),
    ).toBe(true);
    expect(
      deveEnviarAlertaOperacional(fp, { lastNotifiedFingerprint: fp, lastSentAt: '2026-05-24T10:00:00' }, 24, true, ref),
    ).toBe(false);
    expect(
      deveEnviarAlertaOperacional(fp, { lastNotifiedFingerprint: fp, lastSentAt: '2026-05-23T10:00:00' }, 24, true, ref),
    ).toBe(true);
  });

  it('monta assunto e corpo', () => {
    const rel = montarAlertaOperacionalRelatorio({
      recebimentos: [recebimento({ notaFiscal: 'NF-999' })],
      rir: [],
      rnc: [],
      inventarios: [],
      params: {
        conferenciaHabilitado: true,
        conferenciaPrazoDias: 2,
        rirHabilitado: false,
        rirPrazoDias: 5,
        rncHabilitado: false,
        rncPrazoDias: 7,
        inventarioHabilitado: false,
        inventarioPrazoDias: 7,
        intervaloMinimoHoras: 24,
      },
      ref,
    });
    expect(montarAssuntoAlertaOperacional(1, 'Obra X')).toContain('Obra X');
    const texto = montarCorpoTextoAlertaOperacional(rel, { cliente: 'Cliente', projeto: 'Obra X' });
    expect(texto).toContain('NF-999');
    expect(texto).toContain('Cliente');
  });
});
