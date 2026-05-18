import { collectAllPages } from '../../../lib/collectAllPages';
import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { listarHistoricoAtendimentos } from '../../atendimento/services/atendimento.service';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { listarColaboradores } from '../../colaboradores/services/colaboradores.service';
import { listarDocumentos } from '../../documentos/services/documentos.service';
import { listarFornecedores } from '../../fornecedores/services/fornecedores.service';
import { listarInventarios } from '../../inventario/services/inventario.service';
import { listarMateriais } from '../../materiais/services/materiais.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import { listarRir, listarRnc } from '../../qualidade/services/qualidade.service';
import {
  RFO_NUMERO_PREVIA,
  type RelatorioFinalObraContexto,
  type RelatorioFinalObraDados,
  type RelatorioFinalObraTotais,
} from '../types/relatorioFinalObra.types';
import { enriquecerApresentacaoComIaOpcional } from './relatorioFinalObraIa.service';
import { carregarRelatorioFotografico, listarMetadadosRelatoriosFotograficos } from './relatorioFotografico.service';

const SEQ_STORAGE_KEY_BASE = 'iso-pro-relatorio-final-obra-num-seq';
/** Migração única: repõe contador após pré-visualizações que consumiam número (v0.1.8). */
const SEQ_RESET_MIGRATION_KEY_BASE = 'iso-pro-rfo-seq-migrated-registro-v1';

function seqStorageKey(): string {
  return getScopedIsoProStorageKey(SEQ_STORAGE_KEY_BASE);
}

function seqResetMigrationKey(): string {
  return getScopedIsoProStorageKey(SEQ_RESET_MIGRATION_KEY_BASE);
}

function storageUltimoRegistradoKey(): string {
  return getScopedIsoProStorageKey('iso-pro-rfo-ultimo-v1');
}

function aplicarMigracaoNumeracaoSeNecessario(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (localStorage.getItem(seqResetMigrationKey())) return;
    zerarNumeracaoRelatorioFinalObra();
    localStorage.removeItem(storageUltimoRegistradoKey());
    localStorage.setItem(seqResetMigrationKey(), '1');
  } catch {
    /* ignore */
  }
}

/** Próximo número oficial sem incrementar o contador (só leitura). */
export function preverProximoNumeroRelatorioFinalObra(): string {
  aplicarMigracaoNumeracaoSeNecessario();
  const ano = new Date().getFullYear();
  let seq = 0;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(seqStorageKey());
      if (raw) {
        const p = JSON.parse(raw) as { ano?: number; seq?: number };
        if (p.ano === ano && typeof p.seq === 'number' && p.seq >= 0) {
          seq = p.seq;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return `RFO-${ano}-${String(seq + 1).padStart(5, '0')}`;
}

/** Reserva e persiste o próximo número oficial (chamar só ao registrar). */
export function reservarNumeroRelatorioFinalObra(): string {
  aplicarMigracaoNumeracaoSeNecessario();
  const ano = new Date().getFullYear();
  let seq = 1;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(seqStorageKey());
      if (raw) {
        const p = JSON.parse(raw) as { ano?: number; seq?: number };
        if (p.ano === ano && typeof p.seq === 'number' && p.seq >= 0) {
          seq = p.seq + 1;
        }
      }
      localStorage.setItem(seqStorageKey(), JSON.stringify({ ano, seq }));
    } catch {
      /* ignora falha de quota */
    }
  }
  return `RFO-${ano}-${String(seq).padStart(5, '0')}`;
}

/** Repõe a sequência (próximo registro será …00001 no ano corrente). */
export function zerarNumeracaoRelatorioFinalObra(): void {
  if (typeof localStorage === 'undefined') return;
  const ano = new Date().getFullYear();
  try {
    localStorage.setItem(seqStorageKey(), JSON.stringify({ ano, seq: 0 }));
  } catch {
    /* ignore */
  }
}

export function ehPreviaRelatorioFinalObra(dados: RelatorioFinalObraDados): boolean {
  return !dados.contexto.registrado;
}

export function rotuloNumeroRelatorioFinalObra(ctx: RelatorioFinalObraContexto): string {
  if (ctx.registrado && ctx.numeroRelatorio.trim()) {
    return ctx.numeroRelatorio.trim();
  }
  return RFO_NUMERO_PREVIA;
}

export function formatarDataRelatorioFinal(valor: string | undefined | null): string {
  const t = String(valor ?? '').trim();
  if (!t) return '—';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export async function coletarDadosRelatorioFinalObra(): Promise<RelatorioFinalObraDados> {
  aplicarMigracaoNumeracaoSeNecessario();
  const cfg = readConfiguracoes();
  const geradoEm = new Date().toISOString();

  const [
    documentos,
    recebimentos,
    inventarios,
    rir,
    rnc,
    atendimentos,
    relatoriosFotograficos,
    materiaisRes,
    colaboradoresRes,
    fornecedoresRes,
  ] = await Promise.all([
    collectAllPages((page, pageSize) => listarDocumentos({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) =>
      listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize }),
    ),
    collectAllPages((page, pageSize) => listarInventarios({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarRir({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarRnc({ busca: '', status: 'todos', page, pageSize })),
    listarHistoricoAtendimentos(),
    Promise.resolve(listarMetadadosRelatoriosFotograficos()),
    listarMateriais({ busca: '', disciplina: '', ativo: 'todos', page: 1, pageSize: 1 }),
    listarColaboradores({ busca: '', tipo: 'todos', status: 'todos', page: 1, pageSize: 1 }),
    listarFornecedores({ busca: '', status: 'todos', page: 1, pageSize: 1 }),
  ]);

  const contexto: RelatorioFinalObraContexto = {
    numeroRelatorio: '',
    registrado: false,
    geradoEm,
    cliente: cfg.cliente.trim(),
    projeto: cfg.projeto.trim(),
    contrato: cfg.contrato.trim(),
    local: cfg.local.trim(),
    rodapeNome: cfg.documentoRodapeNome.trim(),
    rodapeCnpj: cfg.documentoRodapeCnpj.trim(),
  };

  const totais: RelatorioFinalObraTotais = {
    documentos: documentos.length,
    documentosCancelados: documentos.filter((d) => d.status === 'cancelado').length,
    recebimentos: recebimentos.length,
    recebimentosCancelados: recebimentos.filter((r) => r.status === 'cancelado').length,
    rir: rir.length,
    rirCancelados: rir.filter((r) => r.status === 'cancelado').length,
    rnc: rnc.length,
    rncCancelados: rnc.filter((r) => r.status === 'cancelado').length,
    atendimentos: atendimentos.length,
    atendimentosEstornados: atendimentos.filter((a) => a.status === 'estornado').length,
    inventarios: inventarios.length,
    inventariosAbertos: inventarios.filter((i) => i.status === 'aberto').length,
    relatoriosFotograficos: relatoriosFotograficos.length,
    materiais: materiaisRes.data?.total ?? 0,
    colaboradores: colaboradoresRes.data?.total ?? 0,
    fornecedores: fornecedoresRes.data?.total ?? 0,
  };

  return {
    contexto,
    totais,
    documentos,
    recebimentos,
    rir,
    rnc,
    atendimentos,
    inventarios,
    relatoriosFotograficos,
  };
}

/** Carrega payloads RF, monta síntese e opcionalmente enriquece com IA (Configurações). */
export async function enriquecerRelatorioFinalObra(
  dados: RelatorioFinalObraDados,
  opts?: { forcarReanalise?: boolean },
): Promise<RelatorioFinalObraDados> {
  if (dados.apresentacao && !opts?.forcarReanalise) {
    return dados;
  }
  const payloads = [];
  for (const meta of dados.relatoriosFotograficos) {
    const res = await carregarRelatorioFotografico(meta.id);
    if (res.success && res.data) {
      payloads.push(res.data);
    }
  }
  const enriquecido = await enriquecerApresentacaoComIaOpcional(dados, payloads);
  return {
    ...dados,
    apresentacao: enriquecido.apresentacao,
    analiseEnriquecida: enriquecido.analiseEnriquecida,
  };
}

/** Atribui número oficial RFO e data de registro (única operação que incrementa a sequência). */
export function registrarRelatorioFinalObra(dados: RelatorioFinalObraDados): RelatorioFinalObraDados {
  const numero = reservarNumeroRelatorioFinalObra();
  return {
    ...dados,
    contexto: {
      ...dados.contexto,
      numeroRelatorio: numero,
      registrado: true,
      geradoEm: new Date().toISOString(),
    },
  };
}
