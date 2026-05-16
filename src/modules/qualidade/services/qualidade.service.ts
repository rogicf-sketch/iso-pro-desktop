import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { avisarPreservacaoLocalStorageCorrupto } from '../../../lib/localStoragePreservacao';
import { escapeCsvCellSemicolon, formatDecimalExcelPtBr } from '../../../lib/csv';
import { MEDIA_REF_PREFIX } from '../../../lib/mediaBlobStore';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  commitIsoProSnapshotWrite,
  readIsoProSnapshotPayload,
  readIsoProSnapshotPayloadForWrite,
} from '../../../lib/isoProSnapshot';
import { mensagemSeSubstituirLocalPerderiaCadastros } from '../../../lib/localSnapshotWriteGuard';
import { executeWrite, withLocalFallback } from '../../../lib/service-result';
import { whenBusinessWriteBlockedResult } from '../../../lib/writePolicy';
import type { PaginatedResult, ServiceResult } from '../../../types/common.types';
import { appendAuthAuditEvent } from '../../auth/services/authAudit.service';
import { parseQualidadeRegistrosLocal } from '../schemas/qualidadeLocalArrays.zod';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { buscarRecebimentoPorId } from '../../recebimentos/services/recebimentos.service';
import type {
  RirFiltro,
  RirFormData,
  RirItemLinha,
  RirRegistro,
  RncFiltro,
  RncFormData,
  RncItemLinha,
  RncPlanoAcaoLinha,
  RncRegistro,
} from '../types/qualidade.types';
import {
  defaultRncEvidencias,
  defaultRncPlanoLinhas,
  defaultRncTiposOcorrencia,
} from '../types/qualidade.types';
import { hydrateRncRegistro, persistRncRegistroFotosToIdb } from '../utils/rncFotoIdb';
import { rncLinhaTemConteudoOcorrencia } from '../utils/rncItensRecebimento';
import { extrairDisciplinaProcedimento } from '../utils/rirDisciplina';

function rirStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-rir');
}

function rncStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-rnc');
}

function bloqueioLocalRir(tamanhoListaGravacao: number): string | null {
  return mensagemSeSubstituirLocalPerderiaCadastros([
    { storageKey: rirStorageKey(), tamanhoNovaLista: tamanhoListaGravacao, nomeCurto: 'RIR' },
  ]);
}

function bloqueioLocalRnc(tamanhoListaGravacao: number): string | null {
  return mensagemSeSubstituirLocalPerderiaCadastros([
    { storageKey: rncStorageKey(), tamanhoNovaLista: tamanhoListaGravacao, nomeCurto: 'RNC' },
  ]);
}

const emptyAssinatura = (): RirRegistro['assinaturaRecebimento'] => ({ nome: '', data: '' });

function normalizeRirItemLinha(it: RirItemLinha): RirItemLinha {
  const q = typeof it.quantidade === 'number' && Number.isFinite(it.quantidade) ? it.quantidade : Number(it.quantidade) || 0;
  const qc =
    typeof it.quantidadeConferida === 'number' && Number.isFinite(it.quantidadeConferida)
      ? it.quantidadeConferida
      : undefined;
  return {
    id: it.id?.trim() ? it.id.trim() : crypto.randomUUID(),
    codigoMaterial: it.codigoMaterial ?? '',
    quantidade: q,
    unidade: it.unidade ?? '',
    descricaoMaterial: it.descricaoMaterial ?? '',
    certificado: (it.certificado ?? 'N/A').trim() || 'N/A',
    linhaOrigemRecebimento: it.linhaOrigemRecebimento,
    disciplina: it.disciplina?.trim() ?? '',
    localizacao: it.localizacao?.trim() ?? '',
    quantidadeConferida: qc,
  };
}

export function normalizeRirRegistro(item: RirRegistro): RirRegistro {
  return {
    id: item.id,
    codigo: item.codigo ?? '',
    dataRegistro: item.dataRegistro ?? new Date().toISOString().slice(0, 10),
    recebimentoId: item.recebimentoId ?? '',
    recebimentoNotaFiscal: item.recebimentoNotaFiscal,
    recebimentoFornecedor: item.recebimentoFornecedor,
    recebimentoRomaneio: item.recebimentoRomaneio,
    recebimentoData: item.recebimentoData,
    uo: item.uo ?? '',
    localObra: item.localObra ?? '',
    contratoNumero: item.contratoNumero ?? '',
    fornecedorNome: item.fornecedorNome ?? '',
    inspecaoQuantitativa: item.inspecaoQuantitativa !== false,
    inspecaoQualitativa: item.inspecaoQualitativa !== false,
    inspecaoDimensional: !!item.inspecaoDimensional,
    procedimentoNumero: item.procedimentoNumero ?? '',
    solCompraPackList: item.solCompraPackList ?? '',
    obsCurta: item.obsCurta ?? '',
    itensRir: Array.isArray(item.itensRir) ? item.itensRir.map((row) => normalizeRirItemLinha(row)) : [],
    instrumentos: item.instrumentos ?? '',
    documentosQc: item.documentosQc ?? '',
    observacoesQc: item.observacoesQc ?? '',
    laudo: item.laudo === 'reprovado' || item.laudo === 'observacoes' ? item.laudo : 'aprovado',
    assinaturaRecebimento: item.assinaturaRecebimento ?? emptyAssinatura(),
    assinaturaCq: item.assinaturaCq ?? emptyAssinatura(),
    assinaturaCliente: item.assinaturaCliente ?? emptyAssinatura(),
    origem: item.origem ?? '',
    responsavel: item.responsavel ?? '',
    descricao: item.descricao ?? '',
    status: item.status ?? 'aberto',
    acaoImediata: item.acaoImediata ?? '',
    observacoes: item.observacoes ?? '',
  };
}

const seedRir: RirRegistro[] = [
  normalizeRirRegistro({
    id: 'rir-1',
    codigo: 'RIR-2026-001',
    dataRegistro: '2026-04-03',
    recebimentoId: '',
    recebimentoNotaFiscal: '—',
    recebimentoFornecedor: 'Exemplo historico',
    recebimentoRomaneio: '',
    recebimentoData: '2026-04-02',
    uo: '',
    localObra: '',
    contratoNumero: '',
    fornecedorNome: 'Exemplo historico',
    inspecaoQuantitativa: true,
    inspecaoQualitativa: true,
    inspecaoDimensional: false,
    procedimentoNumero: 'PE-TUB-003 REV.2',
    solCompraPackList: '',
    obsCurta: '',
    itensRir: [],
    instrumentos: '',
    documentosQc: '',
    observacoesQc: '',
    laudo: 'aprovado',
    assinaturaRecebimento: emptyAssinatura(),
    assinaturaCq: emptyAssinatura(),
    assinaturaCliente: emptyAssinatura(),
    origem: 'Recebimento (exemplo)',
    responsavel: 'Carlos Lima',
    descricao: 'Divergencia entre nota e material entregue.',
    status: 'em_analise',
    acaoImediata: 'Segregar material e abrir conferencia complementar.',
    observacoes: '',
  }),
];

const emptyRncAssinatura = (): RncRegistro['assinaturaResponsavelRnc'] => ({ nome: '', data: '' });

function normalizeRncItemLinha(row: Partial<RncItemLinha> & { recebimentoItemId?: string }): RncItemLinha {
  const tipos = { ...defaultRncTiposOcorrencia(), ...(row.tiposOcorrencia ?? {}) };
  const qrej =
    typeof row.quantidadeRejeitada === 'number' && Number.isFinite(row.quantidadeRejeitada)
      ? row.quantidadeRejeitada
      : Number(row.quantidadeRejeitada) || 0;
  return {
    recebimentoItemId: String(row.recebimentoItemId ?? '').trim(),
    incluir: !!row.incluir,
    codigoMaterial: String(row.codigoMaterial ?? '').trim(),
    descricaoMaterial: String(row.descricaoMaterial ?? '').trim(),
    unidade: String(row.unidade ?? '').trim(),
    disciplina: String(row.disciplina ?? '').trim(),
    localizacao: String(row.localizacao ?? '').trim(),
    quantidadeRecebida:
      typeof row.quantidadeRecebida === 'number' && Number.isFinite(row.quantidadeRecebida)
        ? row.quantidadeRecebida
        : Number(row.quantidadeRecebida) || 0,
    quantidadeConferida:
      typeof row.quantidadeConferida === 'number' && Number.isFinite(row.quantidadeConferida)
        ? row.quantidadeConferida
        : Number(row.quantidadeConferida) || 0,
    pesoUnitario:
      typeof row.pesoUnitario === 'number' && Number.isFinite(row.pesoUnitario) ? row.pesoUnitario : Number(row.pesoUnitario) || 0,
    pesoTotal: typeof row.pesoTotal === 'number' && Number.isFinite(row.pesoTotal) ? row.pesoTotal : Number(row.pesoTotal) || 0,
    certificado: String(row.certificado ?? '').trim(),
    quantidadeRejeitada: qrej,
    tiposOcorrencia: {
      ...defaultRncTiposOcorrencia(),
      ...tipos,
      outroTexto: String(tipos.outroTexto ?? '').trim(),
    },
    descricaoDetalhada: String(row.descricaoDetalhada ?? '').trim(),
    fotosDataUrls: Array.isArray(row.fotosDataUrls)
      ? row.fotosDataUrls.filter(
          (x) => typeof x === 'string' && (x.startsWith('data:') || x.startsWith(MEDIA_REF_PREFIX)),
        )
      : [],
    fotosDeclaradasSemArquivo: !!row.fotosDeclaradasSemArquivo,
  };
}

function legacyItensRncFromHead(item: Partial<RncRegistro>): RncItemLinha[] {
  const t = { ...defaultRncTiposOcorrencia(), ...(item.tiposOcorrencia ?? {}) };
  const anyTipo =
    t.avariaFisica || t.quantidadeIncorreta || t.materialIncorreto || t.documentacaoFaltante || t.validadeExpirada || t.outro;
  const hasMat = String(item.materialCodigo ?? '').trim() || String(item.materialDescricao ?? '').trim();
  const hasDesc = String(item.descricaoDetalhada ?? '').trim() || String(item.descricao ?? '').trim();
  if (!hasMat && !hasDesc && !anyTipo) return [];
  const qrej =
    typeof item.quantidadeRejeitada === 'number' && Number.isFinite(item.quantidadeRejeitada)
      ? item.quantidadeRejeitada
      : Number(item.quantidadeRejeitada) || 0;
  const qrec =
    typeof item.quantidadeRecebidaRef === 'number' && Number.isFinite(item.quantidadeRecebidaRef)
      ? item.quantidadeRecebidaRef
      : Number(item.quantidadeRecebidaRef) || 0;
  return [
    normalizeRncItemLinha({
      recebimentoItemId: String(item.itemRecebimentoId ?? '').trim(),
      incluir: true,
      codigoMaterial: String(item.materialCodigo ?? '').trim(),
      descricaoMaterial: String(item.materialDescricao ?? '').trim(),
      unidade: '',
      disciplina: '',
      localizacao: '',
      quantidadeRecebida: qrec,
      quantidadeConferida: 0,
      pesoUnitario: 0,
      pesoTotal: 0,
      certificado: '',
      quantidadeRejeitada: qrej,
      tiposOcorrencia: t,
      descricaoDetalhada: String(item.descricaoDetalhada ?? '').trim() || String(item.descricao ?? '').trim(),
      fotosDataUrls: [],
      fotosDeclaradasSemArquivo: false,
    }),
  ];
}

export function normalizeRncRegistro(item: Partial<RncRegistro> & { id: string }): RncRegistro {
  const tiposHead = item.tiposOcorrencia ?? defaultRncTiposOcorrencia();
  const evid = item.evidencias ?? defaultRncEvidencias();
  const linhas = Array.isArray(item.planoAcaoLinhas) && item.planoAcaoLinhas.length
    ? item.planoAcaoLinhas.map((l) => ({
        acao: String(l.acao ?? '').trim(),
        responsavel: String(l.responsavel ?? '').trim(),
        prazo: String(l.prazo ?? '').trim(),
      }))
    : defaultRncPlanoLinhas();

  const qrej =
    typeof item.quantidadeRejeitada === 'number' && Number.isFinite(item.quantidadeRejeitada)
      ? item.quantidadeRejeitada
      : Number(item.quantidadeRejeitada) || 0;
  const qrec =
    typeof item.quantidadeRecebidaRef === 'number' && Number.isFinite(item.quantidadeRecebidaRef)
      ? item.quantidadeRecebidaRef
      : Number(item.quantidadeRecebidaRef) || 0;

  let itensRnc: RncItemLinha[] = [];
  if (Array.isArray(item.itensRnc) && item.itensRnc.length > 0) {
    itensRnc = item.itensRnc.map((r) => normalizeRncItemLinha(r as RncItemLinha));
  } else {
    itensRnc = legacyItensRncFromHead(item);
  }

  const incl = itensRnc.filter((x) => x.incluir);
  const firstIncl = incl[0];
  const descDetLegacy = String(item.descricaoDetalhada ?? '').trim();
  const descLeg = String(item.descricao ?? '').trim();
  const descDetGlobal =
    incl.length > 0
      ? incl
          .map(
            (i, idx) =>
              `--- Item ${idx + 1} (${i.codigoMaterial || i.recebimentoItemId || '—'}) ---\n${i.descricaoDetalhada.trim() || '—'}`,
          )
          .join('\n\n')
      : descDetLegacy || descLeg;
  const descricaoLista =
    incl.length > 0
      ? incl
          .map((i) => {
            const cod = i.codigoMaterial.trim();
            const det = (i.descricaoDetalhada || '—').trim().slice(0, 120);
            return cod ? `${cod}: ${det.slice(0, 80)}` : det;
          })
          .join(' | ')
          .slice(0, 280)
      : descDetGlobal.slice(0, 280) || descLeg.slice(0, 280);

  const tiposCabecalho =
    firstIncl && incl.length > 0
      ? {
          ...defaultRncTiposOcorrencia(),
          ...firstIncl.tiposOcorrencia,
          outroTexto: String(firstIncl.tiposOcorrencia.outroTexto ?? '').trim(),
        }
      : {
          ...defaultRncTiposOcorrencia(),
          ...tiposHead,
          outroTexto: String(tiposHead.outroTexto ?? '').trim(),
        };

  return {
    id: item.id,
    codigo: String(item.codigo ?? '').trim(),
    dataRegistro: String(item.dataRegistro ?? new Date().toISOString().slice(0, 10)),
    setor: String(item.setor ?? '').trim(),
    responsavel: String(item.responsavel ?? '').trim(),
    descricao: descricaoLista,
    status: item.status ?? 'aberto',
    planoAcao: String(item.planoAcao ?? '').trim(),
    observacoes: String(item.observacoes ?? '').trim(),
    recebimentoId: String(item.recebimentoId ?? '').trim(),
    recebimentoNotaFiscal: item.recebimentoNotaFiscal?.trim(),
    recebimentoFornecedor: item.recebimentoFornecedor?.trim(),
    recebimentoRomaneio: item.recebimentoRomaneio?.trim(),
    recebimentoData: item.recebimentoData?.trim(),
    pedidoCompra: String(item.pedidoCompra ?? '').trim(),
    itemRecebimentoId: firstIncl?.recebimentoItemId || item.itemRecebimentoId?.trim(),
    materialCodigo: firstIncl?.codigoMaterial ?? String(item.materialCodigo ?? '').trim(),
    materialDescricao: firstIncl?.descricaoMaterial ?? String(item.materialDescricao ?? '').trim(),
    quantidadeRejeitada: firstIncl ? firstIncl.quantidadeRejeitada : qrej,
    quantidadeRecebidaRef: firstIncl ? firstIncl.quantidadeRecebida : qrec,
    localArmazenagem:
      item.localArmazenagem === 'almoxarifado' || item.localArmazenagem === 'quarentena' || item.localArmazenagem === 'outro'
        ? item.localArmazenagem
        : '',
    localArmazenagemOutro: String(item.localArmazenagemOutro ?? '').trim(),
    tiposOcorrencia: tiposCabecalho,
    descricaoDetalhada: descDetGlobal,
    evidencias: {
      ...defaultRncEvidencias(),
      ...evid,
    },
    evidenciasObservacao: String(item.evidenciasObservacao ?? '').trim(),
    acaoImediataTipo:
      item.acaoImediataTipo === 'devolvido_transportador' ||
      item.acaoImediataTipo === 'quarentena_bloqueado' ||
      item.acaoImediataTipo === 'parcial_item_defeito'
        ? item.acaoImediataTipo
        : '',
    acaoImediataObservacoes: String(item.acaoImediataObservacoes ?? '').trim(),
    analiseCausaRaiz: String(item.analiseCausaRaiz ?? '').trim(),
    planoAcaoLinhas: linhas,
    encerramentoParecer:
      item.encerramentoParecer === 'aceito_desvio' ||
      item.encerramentoParecer === 'rejeitado' ||
      item.encerramentoParecer === 'reclassificado'
        ? item.encerramentoParecer
        : '',
    assinaturaResponsavelRnc: {
      nome: String(item.assinaturaResponsavelRnc?.nome ?? '').trim(),
      data: String(item.assinaturaResponsavelRnc?.data ?? '').trim(),
    },
    assinaturaQualidade: {
      nome: String(item.assinaturaQualidade?.nome ?? '').trim(),
      data: String(item.assinaturaQualidade?.data ?? '').trim(),
    },
    assinaturaFornecedor: {
      nome: String(item.assinaturaFornecedor?.nome ?? '').trim(),
      data: String(item.assinaturaFornecedor?.data ?? '').trim(),
    },
    itensRnc,
  };
}

function planoAcaoTextoDasLinhas(linhas: RncPlanoAcaoLinha[]): string {
  return (linhas ?? [])
    .filter((l) => l.acao.trim())
    .map((l) => `${l.acao.trim()} — ${l.responsavel.trim() || '—'} — prazo ${l.prazo.trim() || '—'}`)
    .join('\n');
}

const seedRnc: RncRegistro[] = [
  normalizeRncRegistro({
    id: 'rnc-1',
    codigo: '2026-001',
    dataRegistro: '2026-04-02',
    setor: 'Almoxarifado',
    responsavel: 'Mariana Costa',
    descricao: 'Material armazenado em local divergente do enderecamento.',
    descricaoDetalhada:
      'O que: endereco divergente. Onde: almoxarifado setor B. Quando: na conferencia do dia 02/04. Como: conferencia fisica vs etiqueta.',
    status: 'em_tratativa',
    planoAcao: 'Revisar enderecamento e reforcar check-list de recebimento.',
    observacoes: '',
    recebimentoId: '',
    pedidoCompra: '',
    materialCodigo: '',
    materialDescricao: '',
    quantidadeRejeitada: 0,
    quantidadeRecebidaRef: 0,
    localArmazenagem: 'almoxarifado',
    localArmazenagemOutro: '',
    tiposOcorrencia: defaultRncTiposOcorrencia(),
    evidencias: defaultRncEvidencias(),
    evidenciasObservacao: '',
    acaoImediataTipo: 'quarentena_bloqueado',
    acaoImediataObservacoes: '',
    analiseCausaRaiz: '',
    planoAcaoLinhas: [
      { acao: 'Revisar enderecamento', responsavel: 'Logistica', prazo: '2026-04-15' },
      { acao: 'Atualizar check-list de recebimento', responsavel: 'GQ', prazo: '2026-04-20' },
    ],
    encerramentoParecer: '',
    assinaturaResponsavelRnc: emptyRncAssinatura(),
    assinaturaQualidade: emptyRncAssinatura(),
    assinaturaFornecedor: emptyRncAssinatura(),
    itensRnc: [],
  }),
];

type SnapshotPayload = {
  rirRegistros?: Partial<RirRegistro>[];
  rncRegistros?: Partial<RncRegistro>[];
};

function readAll<T>(key: string, seed: T[]): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) {
    localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = parseQualidadeRegistrosLocal(parsed);
    if (!validated) {
      avisarPreservacaoLocalStorageCorrupto('Qualidade (RIR/RNC local)', key);
      return [];
    }
    return validated as T[];
  } catch {
    avisarPreservacaoLocalStorageCorrupto('Qualidade (RIR/RNC local)', key);
    return [];
  }
}

function writeAll<T>(key: string, items: T[]) {
  localStorage.setItem(key, JSON.stringify(items));
}

async function loadRir() {
  const raw = hasSupabaseConfig()
    ? await readSnapshotRir().catch(() => readAll(rirStorageKey(), seedRir))
    : readAll(rirStorageKey(), seedRir);
  return raw.map((item) => normalizeRirRegistro(item));
}

async function loadRncFromLocalStorage(): Promise<RncRegistro[]> {
  const base = readAllRncNormalized();
  return Promise.all(base.map((x) => hydrateRncRegistro(x)));
}

async function loadRnc(): Promise<RncRegistro[]> {
  if (hasSupabaseConfig()) {
    try {
      const base = await readSnapshotRnc();
      return Promise.all(base.map((x) => hydrateRncRegistro(x)));
    } catch {
      return loadRncFromLocalStorage();
    }
  }
  return loadRncFromLocalStorage();
}

async function readSnapshotPayload(): Promise<SnapshotPayload> {
  return await readIsoProSnapshotPayload<SnapshotPayload>();
}

async function writeSnapshotQuality(nextData: { rirRegistros?: RirRegistro[]; rncRegistros?: RncRegistro[] }) {
  await commitIsoProSnapshotWrite(async () => {
    const { payload: currentPayload, baselineUpdatedAt } = await readIsoProSnapshotPayloadForWrite<SnapshotPayload>();
    return {
      baselineUpdatedAt,
      nextPayload: {
        ...currentPayload,
        ...(nextData.rirRegistros
          ? {
              rirRegistros: nextData.rirRegistros.map((item) => ({ ...item })),
            }
          : {}),
        ...(nextData.rncRegistros
          ? {
              rncRegistros: nextData.rncRegistros.map((item) => ({ ...normalizeRncRegistro(item) })),
            }
          : {}),
        dataAtualizacao: new Date().toISOString(),
      },
    };
  });
}

async function readSnapshotRir(): Promise<RirRegistro[]> {
  const payload = await readSnapshotPayload();
  return (payload.rirRegistros ?? []).map((item, index) =>
    normalizeRirRegistro({
      ...(item as RirRegistro),
      id: String(item.id ?? `rir-${index + 1}`),
    }),
  );
}

async function readSnapshotRnc(): Promise<RncRegistro[]> {
  const payload = await readSnapshotPayload();
  return (payload.rncRegistros ?? []).map((item, index) =>
    normalizeRncRegistro({
      ...(item as RncRegistro),
      id: String(item.id ?? `rnc-${index + 1}`),
    }),
  );
}

/**
 * Agrupa RIR não cancelados por `recebimentoId` (para filtro «sem RIR» no formulário).
 */
export function rirNaoCanceladosPorRecebimentoId(
  registros: RirRegistro[],
): Map<string, Array<{ id: string; codigo: string; status: RirRegistro['status'] }>> {
  const map = new Map<string, Array<{ id: string; codigo: string; status: RirRegistro['status'] }>>();
  for (const r of registros) {
    if (r.status === 'cancelado') continue;
    const rid = r.recebimentoId?.trim();
    if (!rid) continue;
    const row = { id: r.id, codigo: (r.codigo ?? '').trim() || '—', status: r.status };
    const cur = map.get(rid) ?? [];
    cur.push(row);
    map.set(rid, cur);
  }
  return map;
}

function filterRir(items: RirRegistro[], filtro: RirFiltro) {
  let next = items;
  if (filtro.busca.trim()) {
    const busca = filtro.busca.trim().toLowerCase();
    next = next.filter((item) => {
      const blob = [
        item.codigo,
        item.origem,
        item.responsavel,
        item.descricao,
        item.recebimentoNotaFiscal,
        item.recebimentoFornecedor,
        item.procedimentoNumero,
        item.contratoNumero,
        item.localObra,
        item.uo,
        item.fornecedorNome,
        item.obsCurta,
        item.solCompraPackList,
      ]
        .map((x) => String(x ?? ''))
        .join(' ')
        .toLowerCase();
      return blob.includes(busca);
    });
  }
  if (filtro.status !== 'todos') {
    next = next.filter((item) => item.status === filtro.status);
  }
  return [...next].sort((a, b) => b.dataRegistro.localeCompare(a.dataRegistro));
}

function filterRnc(items: RncRegistro[], filtro: RncFiltro) {
  let next = items;
  if (filtro.busca.trim()) {
    const busca = filtro.busca.trim().toLowerCase();
    next = next.filter((item) => {
      const blob = [
        item.codigo,
        item.setor,
        item.responsavel,
        item.descricao,
        item.descricaoDetalhada,
        item.recebimentoNotaFiscal,
        item.recebimentoFornecedor,
        item.materialCodigo,
        item.materialDescricao,
        item.pedidoCompra,
        ...(item.itensRnc ?? []).flatMap((l) => [
          l.codigoMaterial,
          l.descricaoMaterial,
          l.descricaoDetalhada,
          l.localizacao,
          l.disciplina,
        ]),
      ]
        .map((x) => String(x ?? ''))
        .join(' ')
        .toLowerCase();
      return blob.includes(busca);
    });
  }
  if (filtro.status !== 'todos') {
    next = next.filter((item) => item.status === filtro.status);
  }
  return [...next].sort((a, b) => b.dataRegistro.localeCompare(a.dataRegistro));
}

function buildCodigoRirAutomatico(config: ReturnType<typeof readConfiguracoes>, items: RirRegistro[], payload: RirFormData, excludeId?: string): string {
  if (payload.codigo.trim()) return payload.codigo.trim();
  if (config.rirModoNumeracao === 'manual') return '';

  if (config.rirModoNumeracao === 'disciplina') {
    const disc = extrairDisciplinaProcedimento(payload.procedimentoNumero);
    if (!disc) return '';
    const esc = disc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^RIR-${esc}-(\\d+)$`, 'i');
    let maxIdx = 0;
    for (const it of items) {
      if (excludeId && it.id === excludeId) continue;
      const m = String(it.codigo ?? '').trim().match(re);
      if (m) maxIdx = Math.max(maxIdx, parseInt(m[1], 10));
    }
    return `RIR-${disc}-${String(maxIdx + 1).padStart(2, '0')}`;
  }

  const stamp = new Date().getFullYear();
  const base = (config.projeto || config.cliente || 'RIR').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'RIR';
  let maxSeq = 0;
  const reYear = new RegExp(`^${base}-${stamp}-(\\d+)$`, 'i');
  for (const it of items) {
    if (excludeId && it.id === excludeId) continue;
    const m = String(it.codigo ?? '').trim().match(reYear);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  const sequencia = String(maxSeq + 1).padStart(4, '0');
  return `${base}-${stamp}-${sequencia}`;
}

function parseAnoDataRegistro(dataRegistro: string): number {
  const y = parseInt(String(dataRegistro ?? '').slice(0, 4), 10);
  return Number.isFinite(y) && y >= 2000 ? y : new Date().getFullYear();
}

function buildCodigoRncAutomatico(items: RncRegistro[], dataRegistro: string, excludeId?: string): string {
  const year = parseAnoDataRegistro(dataRegistro);
  const reNew = new RegExp(`^${year}-(\\d{3})$`);
  const reLegacy = /^RNC-(\d{4})-(\d+)$/i;
  let maxSeq = 0;
  for (const it of items) {
    if (excludeId && it.id === excludeId) continue;
    const c = String(it.codigo ?? '').trim();
    const m1 = c.match(reNew);
    if (m1) maxSeq = Math.max(maxSeq, parseInt(m1[1], 10));
    const m2 = c.match(reLegacy);
    if (m2 && parseInt(m2[1], 10) === year) {
      maxSeq = Math.max(maxSeq, parseInt(m2[2], 10));
    }
  }
  return `${year}-${String(maxSeq + 1).padStart(3, '0')}`;
}

function trimRncPayload(
  payload: RncFormData,
  vinculo: {
    recebimentoId: string;
    recebimentoNotaFiscal: string;
    recebimentoFornecedor: string;
    recebimentoRomaneio: string;
    recebimentoData: string;
  },
): RncFormData {
  const linhasPlano = (payload.planoAcaoLinhas?.length ? payload.planoAcaoLinhas : defaultRncPlanoLinhas()).map((l) => ({
    acao: l.acao.trim(),
    responsavel: l.responsavel.trim(),
    prazo: l.prazo.trim(),
  }));
  const derivedPlano = planoAcaoTextoDasLinhas(linhasPlano);
  const itensTrim = (payload.itensRnc ?? []).map((row) => normalizeRncItemLinha(row));
  const incl = itensTrim.filter((x) => x.incluir);
  const first = incl[0];
  const descDetFull =
    incl.length > 0
      ? incl
          .map(
            (i, idx) =>
              `--- Item ${idx + 1} (${i.codigoMaterial || i.recebimentoItemId || '—'}) ---\n${i.descricaoDetalhada.trim() || '—'}`,
          )
          .join('\n\n')
      : (payload.descricaoDetalhada ?? '').trim() || (payload.descricao ?? '').trim();
  const descLista =
    incl.length > 0
      ? incl
          .map((i) => {
            const cod = i.codigoMaterial.trim();
            const det = (i.descricaoDetalhada || '—').trim().slice(0, 120);
            return cod ? `${cod}: ${det.slice(0, 80)}` : det;
          })
          .join(' | ')
          .slice(0, 280)
      : descDetFull.slice(0, 280);
  const fotosPorItem = incl.some((i) => i.fotosDataUrls.length > 0 || i.fotosDeclaradasSemArquivo);
  const tiposCab =
    first && incl.length > 0
      ? {
          ...defaultRncTiposOcorrencia(),
          ...first.tiposOcorrencia,
          outroTexto: (first.tiposOcorrencia?.outroTexto ?? '').trim(),
        }
      : {
          ...defaultRncTiposOcorrencia(),
          ...(payload.tiposOcorrencia ?? {}),
          outroTexto: (payload.tiposOcorrencia?.outroTexto ?? '').trim(),
        };

  return {
    ...payload,
    ...vinculo,
    codigo: payload.codigo.trim(),
    dataRegistro: payload.dataRegistro,
    setor: payload.setor.trim(),
    responsavel: payload.responsavel.trim(),
    descricao: descLista,
    descricaoDetalhada: descDetFull,
    planoAcao: derivedPlano.trim() ? derivedPlano : payload.planoAcao.trim(),
    observacoes: payload.observacoes.trim(),
    pedidoCompra: payload.pedidoCompra.trim(),
    itemRecebimentoId: first?.recebimentoItemId || payload.itemRecebimentoId?.trim(),
    materialCodigo: (first?.codigoMaterial ?? payload.materialCodigo).trim(),
    materialDescricao: (first?.descricaoMaterial ?? payload.materialDescricao).trim(),
    quantidadeRejeitada: first ? first.quantidadeRejeitada : Number(payload.quantidadeRejeitada) || 0,
    quantidadeRecebidaRef: first ? first.quantidadeRecebida : Number(payload.quantidadeRecebidaRef) || 0,
    localArmazenagem: payload.localArmazenagem,
    localArmazenagemOutro: payload.localArmazenagemOutro.trim(),
    tiposOcorrencia: tiposCab,
    evidencias: {
      ...defaultRncEvidencias(),
      ...(payload.evidencias ?? {}),
      fotosAnexadas: fotosPorItem || !!payload.evidencias?.fotosAnexadas,
    },
    evidenciasObservacao: payload.evidenciasObservacao.trim(),
    acaoImediataTipo: payload.acaoImediataTipo,
    acaoImediataObservacoes: payload.acaoImediataObservacoes.trim(),
    analiseCausaRaiz: payload.analiseCausaRaiz.trim(),
    planoAcaoLinhas: linhasPlano.filter((l) => l.acao || l.responsavel || l.prazo).length ? linhasPlano : defaultRncPlanoLinhas(),
    encerramentoParecer: payload.encerramentoParecer,
    assinaturaResponsavelRnc: {
      nome: payload.assinaturaResponsavelRnc.nome.trim(),
      data: payload.assinaturaResponsavelRnc.data,
    },
    assinaturaQualidade: {
      nome: payload.assinaturaQualidade.nome.trim(),
      data: payload.assinaturaQualidade.data,
    },
    assinaturaFornecedor: {
      nome: payload.assinaturaFornecedor.nome.trim(),
      data: payload.assinaturaFornecedor.data,
    },
    itensRnc: itensTrim,
  };
}

export function validateRir(data: RirFormData) {
  const config = readConfiguracoes();
  if (!data.recebimentoId?.trim()) {
    return 'Vincule o RIR a um recebimento (nota fiscal lancada no modulo Recebimentos).';
  }
  if (!data.procedimentoNumero?.trim()) {
    return 'Informe o nº do procedimento (obrigatorio no relatorio de inspecao).';
  }
  if (config.rirModoNumeracao === 'disciplina' && !extrairDisciplinaProcedimento(data.procedimentoNumero)) {
    return 'No modo por disciplina, informe o procedimento com sigla (ex.: PE-TUB-003 REV.2).';
  }
  if (!data.fornecedorNome?.trim()) {
    return 'Informe o fornecedor.';
  }
  const itensOk = (data.itensRir ?? []).some((it) => it.codigoMaterial.trim() || it.descricaoMaterial.trim());
  if (!itensOk) {
    return 'Inclua ao menos um item com codigo ou descricao (recebimento / linhas).';
  }
  const responsavelEff = data.responsavel.trim() || data.assinaturaCq.nome.trim();
  if (!responsavelEff) {
    return 'Informe o responsavel do registro ou o nome em Controle de qualidade (assinaturas).';
  }
  if (data.status === 'cancelado' && !data.observacoes?.trim()) {
    return 'Informe a justificativa em Observacoes (fluxo do registro) antes de cancelar o RIR.';
  }
  return null;
}

export function validateRnc(data: RncFormData) {
  if (!data.recebimentoId?.trim()) {
    return 'Vincule a RNC a um recebimento (pesquise pela NF no modulo Recebimentos).';
  }
  const linhas = data.itensRnc ?? [];
  const incluidos = linhas.filter((l) => l.incluir);

  if (linhas.length > 0) {
    if (incluidos.length === 0) {
      return 'Marque "Incluir nao conformidade nesta linha" em ao menos um item da nota fiscal.';
    }
    for (const it of incluidos) {
      if (!rncLinhaTemConteudoOcorrencia(it)) {
        const ref = it.codigoMaterial.trim() || it.descricaoMaterial.trim().slice(0, 28) || '?';
        return `Item ${ref}: informe tipo de ocorrencia e/ou descricao detalhada do desvio.`;
      }
      if (it.tiposOcorrencia?.outro && !it.tiposOcorrencia.outroTexto.trim()) {
        return `Item ${it.codigoMaterial.trim() || '?'}: descreva o tipo "Outro".`;
      }
    }
  } else {
    const det = (data.descricaoDetalhada ?? '').trim() || (data.descricao ?? '').trim();
    if (!det) {
      return 'Cadastre itens no recebimento e marque a ocorrencia em cada linha, ou descreva a nao conformidade (NF sem itens na lista).';
    }
  }

  if (!data.setor.trim()) return 'Informe o setor.';
  if (!data.responsavel.trim()) return 'Informe o responsavel.';
  const temPlanoLinha = (data.planoAcaoLinhas ?? []).some((l) => l.acao.trim());
  if ((data.status === 'em_tratativa' || data.status === 'concluido') && !temPlanoLinha && !data.planoAcao.trim()) {
    return 'Preencha o plano de acao (tabela na secao 6) antes de avancar a RNC para tratativa ou conclusao.';
  }
  if (data.status === 'cancelado' && !data.observacoes.trim()) {
    return 'Informe a justificativa em observacoes antes de cancelar a RNC.';
  }
  if (data.status === 'concluido') {
    if (!data.encerramentoParecer) {
      return 'Selecione o parecer de encerramento (Aceito com desvio / Rejeitado / Reclassificado).';
    }
    if (incluidos.length > 0) {
      for (const it of incluidos) {
        if (it.fotosDataUrls.length === 0 && !it.fotosDeclaradasSemArquivo) {
          return `Item ${it.codigoMaterial.trim() || '?'}: anexe ao menos uma foto ou marque "Evidencia fotografica fora do sistema".`;
        }
      }
    } else if (!data.evidencias?.fotosAnexadas) {
      return 'Marque "Fotos anexadas" nas evidencias antes de concluir, ou mantenha a RNC em tratativa ate anexar.';
    }
  }
  if (linhas.length === 0 && data.tiposOcorrencia?.outro && !data.tiposOcorrencia.outroTexto.trim()) {
    return 'Descreva o tipo de ocorrencia no campo "Outro".';
  }
  if (data.localArmazenagem === 'outro' && !data.localArmazenagemOutro.trim()) {
    return 'Informe o local quando selecionar segregacao "Outro".';
  }
  return null;
}

export async function listarRir(filtro: RirFiltro): Promise<ServiceResult<PaginatedResult<RirRegistro>>> {
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotRir(),
    loadLocal: () => readAll(rirStorageKey(), seedRir).map((r) => normalizeRirRegistro(r)),
    fallbackMessage: 'Falha ao consultar RIR no Supabase.',
  });
  const items = filterRir(fallbackResult.data, filtro);
  const start = (filtro.page - 1) * filtro.pageSize;
  const end = start + filtro.pageSize;
  return {
    success: true,
    data: {
      items: items.slice(start, end),
      total: items.length,
      page: filtro.page,
      pageSize: filtro.pageSize,
    },
    meta: fallbackResult.meta,
  };
}

export async function obterRirPorId(rirId: string): Promise<ServiceResult<RirRegistro | null>> {
  const id = rirId.trim();
  if (!id) return { success: true, data: null };
  const res = await listarRir({ busca: '', status: 'todos', page: 1, pageSize: 500_000 });
  if (!res.success || !res.data) {
    return { success: false, error: res.error ?? 'Nao foi possivel consultar RIR.' };
  }
  const found = res.data.items.find((r) => r.id === id);
  return { success: true, data: found ? normalizeRirRegistro(found) : null, meta: res.meta };
}

/** Ordem de preferência para sugerir RIR no relatório fotográfico (menor = melhor). */
const PRIORIDADE_STATUS_RIR_SUGESTAO: Record<RirRegistro['status'], number> = {
  tratado: 0,
  em_analise: 1,
  aberto: 2,
  cancelado: 99,
};

/**
 * Devolve o código de um RIR ligado ao mesmo `recebimentoId`, para preencher o campo «RIR — referência» no relatório fotográfico.
 * Ignora RIR cancelados. Entre os restantes: prioriza `tratado`, depois `em_analise`, depois `aberto`; empate por data mais recente.
 * Devolve string vazia se não houver candidato (não é erro).
 */
export async function sugerirCodigoRirParaRecebimento(recebimentoId: string): Promise<ServiceResult<string>> {
  const rid = recebimentoId.trim();
  if (!rid) return { success: true, data: '' };

  const res = await listarRir({
    busca: '',
    status: 'todos',
    page: 1,
    pageSize: 10000,
  });
  if (!res.success || !res.data) {
    return { success: false, error: res.error ?? 'Falha ao consultar RIR.' };
  }

  const candidatos = res.data.items.filter((r) => r.recebimentoId.trim() === rid && r.status !== 'cancelado');
  if (candidatos.length === 0) {
    return { success: true, data: '', meta: res.meta };
  }

  candidatos.sort((a, b) => {
    const pa = PRIORIDADE_STATUS_RIR_SUGESTAO[a.status] ?? 50;
    const pb = PRIORIDADE_STATUS_RIR_SUGESTAO[b.status] ?? 50;
    if (pa !== pb) return pa - pb;
    return b.dataRegistro.localeCompare(a.dataRegistro);
  });

  return { success: true, data: candidatos[0].codigo.trim(), meta: res.meta };
}

/** Separador `;` para abrir corretamente no Excel em portugues. */
const RIR_CSV_SEP = ';';

function escapeRirCsvCell(value: string) {
  return escapeCsvCellSemicolon(String(value));
}

function formatIsoDatePtBrOptional(s: string | undefined): string {
  if (!s?.trim()) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return s.trim();
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function statusRirLabelCsv(s: RirRegistro['status']): string {
  switch (s) {
    case 'aberto':
      return 'Aberto';
    case 'em_analise':
      return 'Em analise';
    case 'tratado':
      return 'Tratado';
    case 'cancelado':
      return 'Cancelado';
    default:
      return s;
  }
}

function laudoRirLabelCsv(l: RirRegistro['laudo']): string {
  if (l === 'reprovado') return 'Reprovado';
  if (l === 'observacoes') return 'Observacoes';
  return 'Aprovado';
}

function rirExportacaoUsaFiltroRestrito(f?: Pick<RirFiltro, 'busca' | 'status'>): boolean {
  return !!(f && (f.busca.trim() !== '' || f.status !== 'todos'));
}

export type ExportacaoRirOpcoes = {
  /** Mesmos criterios da lista (busca e status); em branco exporta todos. */
  filtroLista?: Pick<RirFiltro, 'busca' | 'status'>;
};

/**
 * CSV (Excel) com uma linha por item de material; colunas do cabecalho do RIR repetidas por linha.
 * UTF-8 com BOM; separador `;`.
 */
export async function montarExportacaoRirCsvCompleto(
  opcoes?: ExportacaoRirOpcoes,
): Promise<ServiceResult<{ csv: string; fileName: string }>> {
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => readSnapshotRir(),
    loadLocal: () => readAll(rirStorageKey(), seedRir).map((r) => normalizeRirRegistro(r)),
    fallbackMessage: 'Falha ao consultar RIR no Supabase.',
  });

  const filtroLista: RirFiltro = {
    busca: opcoes?.filtroLista?.busca ?? '',
    status: opcoes?.filtroLista?.status ?? 'todos',
    page: 1,
    pageSize: 1,
  };
  const registros = filterRir(fallbackResult.data, filtroLista);

  const header = [
    'Nº RIR',
    'Data registro',
    'Status (fluxo)',
    'Laudo',
    'Fornecedor',
    'Nº NF',
    'Romaneio',
    'Data recebimento',
    'Procedimento',
    'Sol. compra / pack-list',
    'UO',
    'Local obra',
    'Contrato',
    'Origem',
    'Responsavel',
    'Descricao (tratativa)',
    'Acao imediata',
    'Linha item',
    'Codigo material',
    'Descricao material',
    'Quantidade',
    'Unidade',
    'Certificado',
    'Disciplina',
    'Localizacao item',
    'Qtd. conferida',
    'Observacoes inspecao (QC)',
    'Observacoes tratativa',
    'Obs. curta',
    'Instrumentos',
    'Documentos QC',
  ];

  const linhas: string[] = [header.map(escapeRirCsvCell).join(RIR_CSV_SEP)];

  const forn = (r: RirRegistro) => r.fornecedorNome.trim() || r.recebimentoFornecedor?.trim() || '';

  for (const r of registros) {
    const base = [
      r.codigo,
      formatIsoDatePtBrOptional(r.dataRegistro),
      statusRirLabelCsv(r.status),
      laudoRirLabelCsv(r.laudo),
      forn(r),
      r.recebimentoNotaFiscal ?? '',
      r.recebimentoRomaneio ?? '',
      formatIsoDatePtBrOptional(r.recebimentoData),
      r.procedimentoNumero,
      r.solCompraPackList,
      r.uo,
      r.localObra,
      r.contratoNumero,
      r.origem,
      r.responsavel,
      r.descricao,
      r.acaoImediata,
    ];

    const itens = r.itensRir ?? [];
    if (itens.length === 0) {
      linhas.push(
        [
          ...base,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          r.observacoesQc,
          r.observacoes,
          r.obsCurta,
          r.instrumentos,
          r.documentosQc,
        ]
          .map(escapeRirCsvCell)
          .join(RIR_CSV_SEP),
      );
    } else {
      for (let idx = 0; idx < itens.length; idx++) {
        const it = itens[idx];
        linhas.push(
          [
            ...base,
            String(idx + 1),
            it.codigoMaterial,
            it.descricaoMaterial,
            formatDecimalExcelPtBr(Number(it.quantidade)),
            it.unidade,
            it.certificado,
            it.disciplina ?? '',
            it.localizacao ?? '',
            it.quantidadeConferida !== undefined
              ? formatDecimalExcelPtBr(Number(it.quantidadeConferida))
              : '',
            r.observacoesQc,
            r.observacoes,
            r.obsCurta,
            r.instrumentos,
            r.documentosQc,
          ]
            .map(escapeRirCsvCell)
            .join(RIR_CSV_SEP),
        );
      }
    }
  }

  const csv = `\uFEFF${linhas.join('\r\n')}\r\n`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sufixo = rirExportacaoUsaFiltroRestrito(opcoes?.filtroLista) ? '-filtrado' : '';
  const fileName = `iso-pro-rir-completo-${stamp}${sufixo}.csv`;
  return { success: true, data: { csv, fileName }, meta: fallbackResult.meta };
}

function readAllRncNormalized(): RncRegistro[] {
  return readAll(rncStorageKey(), seedRnc).map((item, index) =>
    normalizeRncRegistro({
      ...(item as RncRegistro),
      id: String((item as RncRegistro).id ?? `rnc-${index + 1}`),
    }),
  );
}

export async function listarRnc(filtro: RncFiltro): Promise<ServiceResult<PaginatedResult<RncRegistro>>> {
  const fallbackResult = await withLocalFallback({
    shouldTryRemote: hasSupabaseConfig(),
    loadRemote: () => loadRnc(),
    loadLocal: () => loadRncFromLocalStorage(),
    fallbackMessage: 'Falha ao consultar RNC no Supabase.',
  });
  const items = filterRnc(fallbackResult.data, filtro);
  const start = (filtro.page - 1) * filtro.pageSize;
  const end = start + filtro.pageSize;
  return {
    success: true,
    data: {
      items: items.slice(start, end),
      total: items.length,
      page: filtro.page,
      pageSize: filtro.pageSize,
    },
    meta: fallbackResult.meta,
  };
}

function trimRirPayload(payload: RirFormData): RirFormData {
  return {
    ...payload,
    codigo: payload.codigo.trim(),
    dataRegistro: payload.dataRegistro,
    recebimentoId: payload.recebimentoId.trim(),
    uo: payload.uo.trim(),
    localObra: payload.localObra.trim(),
    contratoNumero: payload.contratoNumero.trim(),
    fornecedorNome: payload.fornecedorNome.trim(),
    procedimentoNumero: payload.procedimentoNumero.trim(),
    solCompraPackList: payload.solCompraPackList.trim(),
    obsCurta: payload.obsCurta.trim(),
    itensRir: (payload.itensRir ?? []).map((it) =>
      normalizeRirItemLinha({
        ...it,
        quantidade: typeof it.quantidade === 'number' && Number.isFinite(it.quantidade) ? it.quantidade : Number(it.quantidade) || 0,
        codigoMaterial: it.codigoMaterial.trim(),
        unidade: it.unidade.trim(),
        descricaoMaterial: it.descricaoMaterial.trim(),
        certificado: it.certificado.trim(),
        disciplina: it.disciplina?.trim() ?? '',
        localizacao: it.localizacao?.trim() ?? '',
      }),
    ),
    instrumentos: payload.instrumentos.trim(),
    documentosQc: payload.documentosQc.trim(),
    observacoesQc: payload.observacoesQc.trim(),
    assinaturaRecebimento: {
      nome: payload.assinaturaRecebimento.nome.trim(),
      data: payload.assinaturaRecebimento.data,
    },
    assinaturaCq: {
      nome: payload.assinaturaCq.nome.trim(),
      data: payload.assinaturaCq.data,
    },
    assinaturaCliente: {
      nome: payload.assinaturaCliente.nome.trim(),
      data: payload.assinaturaCliente.data,
    },
    origem:
      payload.origem.trim() ||
      (payload.recebimentoNotaFiscal?.trim()
        ? `Recebimento · NF ${payload.recebimentoNotaFiscal.trim()}`
        : 'Recebimento'),
    responsavel: payload.responsavel.trim(),
    descricao: payload.descricao.trim(),
    acaoImediata: payload.acaoImediata.trim(),
    observacoes: payload.observacoes.trim(),
  };
}

export async function salvarRir(payload: RirFormData, currentId?: string): Promise<ServiceResult<RirRegistro>> {
  const config = readConfiguracoes();
  const validationError = validateRir(payload);
  if (validationError) return { success: false, error: validationError };

  const recResult = await buscarRecebimentoPorId(payload.recebimentoId.trim());
  if (!recResult.success || !recResult.data) {
    return { success: false, error: recResult.error ?? 'Recebimento nao encontrado para vincular ao RIR.' };
  }
  const rec = recResult.data;
  const vinculoRecebimento = {
    recebimentoId: rec.id,
    recebimentoNotaFiscal: rec.notaFiscal,
    recebimentoFornecedor: rec.fornecedor,
    recebimentoRomaneio: rec.romaneio,
    recebimentoData: rec.dataRecebimento,
  };

  const merged = trimRirPayload({
    ...payload,
    ...vinculoRecebimento,
    fornecedorNome: payload.fornecedorNome.trim() || rec.fornecedor,
  });

  if (hasSupabaseConfig()) {
    try {
      const items = await loadRir();
      const codigo = buildCodigoRirAutomatico(config, items, merged, currentId);
      if (!codigo) return { success: false, error: 'Informe o codigo do RIR quando a numeracao estiver em modo manual.' };

      const dup = items.find((x) => x.codigo.trim() === codigo && x.id !== currentId);
      if (dup) {
        return { success: false, error: 'Ja existe um RIR com este numero. Ajuste o nº RIR.' };
      }

      const normalized: RirFormData = {
        ...merged,
        codigo,
      };

      if (currentId) {
        const index = items.findIndex((item) => item.id === currentId);
        if (index === -1) return { success: false, error: 'RIR nao encontrado.' };
        if (items[index].status === 'tratado' || items[index].status === 'cancelado') {
          return { success: false, error: 'RIR tratado ou cancelado nao pode ser editado por este fluxo.' };
        }
        items[index] = { ...items[index], ...normalized, status: normalized.status ?? items[index].status };
        items[index] = normalizeRirRegistro(items[index]);
        const bloqueioRirEdit = bloqueioLocalRir(items.length);
        if (bloqueioRirEdit) return { success: false, error: bloqueioRirEdit };
        return executeWrite({
          shouldWriteRemote: true,
          writeRemote: () => writeSnapshotQuality({ rirRegistros: items }),
          writeLocal: () => writeAll(rirStorageKey(), items),
          successData: items[index],
          fallbackMessage: 'Falha ao salvar RIR no Supabase.',
        });
      }

      const created: RirRegistro = normalizeRirRegistro({
        id: crypto.randomUUID(),
        status: normalized.status ?? 'aberto',
        ...normalized,
      });
      items.push(created);
      const bloqueioRirNovo = bloqueioLocalRir(items.length);
      if (bloqueioRirNovo) return { success: false, error: bloqueioRirNovo };
      return executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotQuality({ rirRegistros: items }),
        writeLocal: () => writeAll(rirStorageKey(), items),
        successData: created,
        fallbackMessage: 'Falha ao salvar RIR no Supabase.',
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao salvar RIR no Supabase.' };
    }
  }

  const items = await loadRir();
  const codigo = buildCodigoRirAutomatico(config, items, merged, currentId);
  if (!codigo) return { success: false, error: 'Informe o codigo do RIR quando a numeracao estiver em modo manual.' };

  const dup = items.find((x) => x.codigo.trim() === codigo && x.id !== currentId);
  if (dup) {
    return { success: false, error: 'Ja existe um RIR com este numero. Ajuste o nº RIR.' };
  }

  const normalized: RirFormData = {
    ...merged,
    codigo,
  };

  if (currentId) {
    const index = items.findIndex((item) => item.id === currentId);
    if (index === -1) return { success: false, error: 'RIR nao encontrado.' };
    if (items[index].status === 'tratado' || items[index].status === 'cancelado') {
      return { success: false, error: 'RIR tratado ou cancelado nao pode ser editado por este fluxo.' };
    }
    items[index] = normalizeRirRegistro({ ...items[index], ...normalized, status: normalized.status ?? items[index].status });
    const blockedRirEdit = whenBusinessWriteBlockedResult<RirRegistro>();
    if (blockedRirEdit) return blockedRirEdit;
    writeAll(rirStorageKey(), items);
    return { success: true, data: items[index] };
  }

  const created = normalizeRirRegistro({
    id: crypto.randomUUID(),
    status: normalized.status ?? 'aberto',
    ...normalized,
  });
  items.push(created);
  const blockedRirNovo = whenBusinessWriteBlockedResult<RirRegistro>();
  if (blockedRirNovo) return blockedRirNovo;
  writeAll(rirStorageKey(), items);
  return { success: true, data: created };
}

export async function excluirRir(id: string): Promise<ServiceResult<{ removedId: string }>> {
  const trimmed = id.trim();
  if (!trimmed) return { success: false, error: 'ID invalido.' };

  const items = await loadRir();
  const index = items.findIndex((item) => item.id === trimmed);
  if (index === -1) return { success: false, error: 'RIR nao encontrado.' };
  if (items[index].status === 'tratado' || items[index].status === 'cancelado') {
    return { success: false, error: 'RIR tratado ou cancelado nao pode ser excluido por este fluxo.' };
  }

  const next = items.filter((item) => item.id !== trimmed);

  if (hasSupabaseConfig()) {
    const bloqueioRirExcluir = bloqueioLocalRir(next.length);
    if (bloqueioRirExcluir) return { success: false, error: bloqueioRirExcluir };
    return executeWrite({
      shouldWriteRemote: true,
      writeRemote: () => writeSnapshotQuality({ rirRegistros: next }),
      writeLocal: () => writeAll(rirStorageKey(), next),
      successData: { removedId: trimmed },
      fallbackMessage: 'Falha ao excluir RIR no Supabase.',
    });
  }

  const blockedRirExcluir = whenBusinessWriteBlockedResult<{ removedId: string }>();
  if (blockedRirExcluir) return blockedRirExcluir;
  writeAll(rirStorageKey(), next);
  return { success: true, data: { removedId: trimmed }, meta: { source: 'local' } };
}

export type DestravarRirParaCorrecaoOpcoes = {
  actorLogin?: string;
};

function auditarDestravarRirParaCorrecao(
  rir: Pick<RirRegistro, 'codigo' | 'recebimentoNotaFiscal'>,
  opcoes?: DestravarRirParaCorrecaoOpcoes,
) {
  appendAuthAuditEvent({
    type: 'rir_destravado_correcao',
    actorLogin: opcoes?.actorLogin?.trim() || 'desconhecido',
    detail: `RIR ${rir.codigo} (NF ${rir.recebimentoNotaFiscal?.trim() || '—'}) destravado: status tratado -> em analise para permitir edicao ou exclusao.`,
  });
}

/**
 * Volta o RIR de `tratado` para `em_analise` para permitir correcao. Senha e permissao `rir`/`administrar` ficam na UI.
 */
export async function destravarRirParaCorrecaoAdministrativa(
  id: string,
  opcoes?: DestravarRirParaCorrecaoOpcoes,
): Promise<ServiceResult<RirRegistro>> {
  const trimmed = id.trim();
  if (!trimmed) return { success: false, error: 'ID invalido.' };

  if (hasSupabaseConfig()) {
    try {
      const items = await loadRir();
      const index = items.findIndex((item) => item.id === trimmed);
      if (index === -1) return { success: false, error: 'RIR nao encontrado.' };
      if (items[index].status === 'cancelado') {
        return { success: false, error: 'RIR cancelado nao pode ser destravado por este fluxo.' };
      }
      if (items[index].status !== 'tratado') {
        return {
          success: false,
          error: 'So e possivel destravar RIR com status Tratado (finalizado). Use Editar se o registro ja estiver aberto ou em analise.',
        };
      }
      const antes = items[index];
      items[index] = normalizeRirRegistro({ ...items[index], status: 'em_analise' });
      const bloqueioRirDestravar = bloqueioLocalRir(items.length);
      if (bloqueioRirDestravar) return { success: false, error: bloqueioRirDestravar };
      const writeResult = await executeWrite({
        shouldWriteRemote: true,
        writeRemote: () => writeSnapshotQuality({ rirRegistros: items }),
        writeLocal: () => writeAll(rirStorageKey(), items),
        successData: items[index],
        fallbackMessage: 'Falha ao destravar RIR no Supabase.',
      });
      if (writeResult.success) {
        auditarDestravarRirParaCorrecao(antes, opcoes);
      }
      return writeResult;
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao destravar RIR no Supabase.' };
    }
  }

  const items = await loadRir();
  const index = items.findIndex((item) => item.id === trimmed);
  if (index === -1) return { success: false, error: 'RIR nao encontrado.' };
  if (items[index].status === 'cancelado') {
    return { success: false, error: 'RIR cancelado nao pode ser destravado por este fluxo.' };
  }
  if (items[index].status !== 'tratado') {
    return {
      success: false,
      error:
        'So e possivel destravar RIR com status Tratado (finalizado). Use Editar se o registro ja estiver aberto ou em analise.',
    };
  }
  const antes = items[index];
  items[index] = normalizeRirRegistro({ ...items[index], status: 'em_analise' });
  const blocked = whenBusinessWriteBlockedResult<RirRegistro>();
  if (blocked) return blocked;
  writeAll(rirStorageKey(), items);
  auditarDestravarRirParaCorrecao(antes, opcoes);
  return { success: true, data: items[index], meta: { source: 'local' } };
}

export async function salvarRnc(payload: RncFormData, currentId?: string): Promise<ServiceResult<RncRegistro>> {
  const config = readConfiguracoes();
  if (config.rncPrefSenha && payload.senhaPreferencial?.trim() !== config.rncPrefSenha) {
    return { success: false, error: 'Senha preferencial da RNC invalida.' };
  }
  const validationError = validateRnc(payload);
  if (validationError) return { success: false, error: validationError };

  const recResult = await buscarRecebimentoPorId(payload.recebimentoId.trim());
  if (!recResult.success || !recResult.data) {
    return { success: false, error: recResult.error ?? 'Recebimento nao encontrado para vincular a RNC.' };
  }
  const rec = recResult.data;
  const mergedBase = trimRncPayload(payload, {
    recebimentoId: rec.id,
    recebimentoNotaFiscal: rec.notaFiscal,
    recebimentoFornecedor: rec.fornecedor,
    recebimentoRomaneio: rec.romaneio,
    recebimentoData: rec.dataRecebimento,
  });
  const merged: RncFormData = { ...mergedBase, senhaPreferencial: undefined };

  const items = await loadRnc();
  let codigo = merged.codigo.trim();
  if (!codigo) {
    codigo = buildCodigoRncAutomatico(items, merged.dataRegistro, currentId);
  }
  const dup = items.find((x) => x.codigo.trim() === codigo && x.id !== currentId);
  if (dup) {
    return { success: false, error: 'Ja existe uma RNC com este numero. Ajuste o codigo.' };
  }

  const normalizedForm: RncFormData = { ...merged, codigo };

  if (hasSupabaseConfig()) {
    try {
      if (currentId) {
        const index = items.findIndex((item) => item.id === currentId);
        if (index === -1) return { success: false, error: 'RNC nao encontrada.' };
        if (items[index].status === 'concluido' || items[index].status === 'cancelado') {
          return { success: false, error: 'RNC concluida ou cancelada nao pode ser editada por este fluxo.' };
        }
        const next = normalizeRncRegistro({
          ...items[index],
          ...normalizedForm,
          id: currentId,
          status: normalizedForm.status ?? items[index].status,
        });
        const persisted = await persistRncRegistroFotosToIdb(next);
        items[index] = persisted;
        const bloqueioRncEdit = bloqueioLocalRnc(items.length);
        if (bloqueioRncEdit) return { success: false, error: bloqueioRncEdit };
        const w = await executeWrite({
          shouldWriteRemote: true,
          writeRemote: async () => {
            const rncForCloud = await Promise.all(items.map((r) => hydrateRncRegistro(r)));
            await writeSnapshotQuality({ rncRegistros: rncForCloud });
          },
          writeLocal: () => writeAll(rncStorageKey(), items),
          successData: await hydrateRncRegistro(persisted),
          fallbackMessage: 'Falha ao salvar RNC no Supabase.',
        });
        return w;
      }

      const created = normalizeRncRegistro({
        id: crypto.randomUUID(),
        status: normalizedForm.status ?? 'aberto',
        ...normalizedForm,
      });
      const persistedCreated = await persistRncRegistroFotosToIdb(created);
      items.push(persistedCreated);
      const bloqueioRncNovo = bloqueioLocalRnc(items.length);
      if (bloqueioRncNovo) return { success: false, error: bloqueioRncNovo };
      return executeWrite({
        shouldWriteRemote: true,
        writeRemote: async () => {
          const rncForCloud = await Promise.all(items.map((r) => hydrateRncRegistro(r)));
          await writeSnapshotQuality({ rncRegistros: rncForCloud });
        },
        writeLocal: () => writeAll(rncStorageKey(), items),
        successData: await hydrateRncRegistro(persistedCreated),
        fallbackMessage: 'Falha ao salvar RNC no Supabase.',
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Falha ao salvar RNC no Supabase.' };
    }
  }

  if (currentId) {
    const index = items.findIndex((item) => item.id === currentId);
    if (index === -1) return { success: false, error: 'RNC nao encontrada.' };
    if (items[index].status === 'concluido' || items[index].status === 'cancelado') {
      return { success: false, error: 'RNC concluida ou cancelada nao pode ser editada por este fluxo.' };
    }
    const next = normalizeRncRegistro({
      ...items[index],
      ...normalizedForm,
      id: currentId,
      status: normalizedForm.status ?? items[index].status,
    });
    const persisted = await persistRncRegistroFotosToIdb(next);
    items[index] = persisted;
    const blockedRncEdit = whenBusinessWriteBlockedResult<RncRegistro>();
    if (blockedRncEdit) return blockedRncEdit;
    writeAll(rncStorageKey(), items);
    return { success: true, data: await hydrateRncRegistro(persisted) };
  }

  const created = normalizeRncRegistro({
    id: crypto.randomUUID(),
    status: normalizedForm.status ?? 'aberto',
    ...normalizedForm,
  });
  const persistedCreated = await persistRncRegistroFotosToIdb(created);
  items.push(persistedCreated);
  const blockedRncNovo = whenBusinessWriteBlockedResult<RncRegistro>();
  if (blockedRncNovo) return blockedRncNovo;
  writeAll(rncStorageKey(), items);
  return { success: true, data: await hydrateRncRegistro(persistedCreated) };
}

export async function obterSugestaoCodigoRnc(payload: RncFormData, currentId?: string): Promise<string> {
  const items = await loadRnc();
  return buildCodigoRncAutomatico(items, payload.dataRegistro, currentId);
}

/** Proximo codigo sugerido conforme configuracao (para o botao Sugerir no formulario). */
export async function obterSugestaoCodigoRir(payload: RirFormData, currentId?: string): Promise<string> {
  const config = readConfiguracoes();
  const items = await loadRir();
  return buildCodigoRirAutomatico(config, items, payload, currentId);
}
