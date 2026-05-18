import type { RelatorioFinalObraApresentacao } from '../types/relatorioFinalObraApresentacao.types';
import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';
import type { RelatorioFinalObraIaResposta } from '../types/relatorioFinalObraIa.types';
import type { RelatorioFotograficoPayload } from '../types/relatorioFotografico.types';
import {
  type AnaliseRelatorioFinalObra,
  type DestaqueRelatorioFinalObra,
  RFO_LIMITE_DESTAQUES,
  analisarRelatorioFinalObra,
} from './relatorioFinalObraAnalise';
import { montarDestaquesRf, ranquearRelatoriosFotograficos } from './relatorioFinalObraInteligencia';
import { normalizarSecoesModuloIa } from './relatorioFinalObraIaSecoes';

function chaveDestaque(d: { modulo: string; referencia: string }): string {
  return `${d.modulo}::${d.referencia}`.toLowerCase();
}

function resolverDataIso(dados: RelatorioFinalObraDados, modulo: string, referencia: string): string {
  const ref = referencia.trim().toLowerCase();
  if (modulo.toLowerCase().includes('rnc')) {
    const r = dados.rnc.find((x) => x.codigo.toLowerCase() === ref);
    if (r) return r.dataRegistro;
  }
  if (modulo.toLowerCase().includes('rir')) {
    const r = dados.rir.find((x) => x.codigo.toLowerCase() === ref);
    if (r) return r.dataRegistro;
  }
  if (modulo.toLowerCase().includes('receb')) {
    const r = dados.recebimentos.find((x) => (x.notaFiscal || x.id).toLowerCase() === ref);
    if (r) return r.dataRecebimento;
  }
  return '';
}

function ordenarDestaques(a: DestaqueRelatorioFinalObra, b: DestaqueRelatorioFinalObra): number {
  const peso = (s: DestaqueRelatorioFinalObra['severidade']) => (s === 'critico' ? 0 : s === 'atencao' ? 1 : 2);
  const p = peso(a.severidade) - peso(b.severidade);
  if (p !== 0) return p;
  return (b.dataIso || '').localeCompare(a.dataIso || '');
}

export function mesclarDestaquesComIa(
  dados: RelatorioFinalObraDados,
  analiseBase: AnaliseRelatorioFinalObra,
  ia: RelatorioFinalObraIaResposta,
): DestaqueRelatorioFinalObra[] {
  const vistos = new Set<string>();
  const out: DestaqueRelatorioFinalObra[] = [];

  const iaOrdenados = [...ia.destaques].sort((a, b) => (a.prioridade ?? 99) - (b.prioridade ?? 99));

  for (const d of iaOrdenados) {
    const ref = d.referencia.trim();
    if (!ref) continue;
    const item: DestaqueRelatorioFinalObra = {
      modulo: d.modulo.trim() || 'Geral',
      referencia: ref,
      motivo: d.motivo.trim() || 'Destaque identificado na análise assistida',
      severidade: d.severidade,
      dataIso: d.dataIso?.trim() || resolverDataIso(dados, d.modulo, ref),
    };
    const k = chaveDestaque(item);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(item);
  }

  for (const d of analiseBase.destaques) {
    const k = chaveDestaque(d);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(d);
  }

  out.sort(ordenarDestaques);
  return out.slice(0, RFO_LIMITE_DESTAQUES);
}

export function aplicarRespostaIaNaApresentacao(
  dados: RelatorioFinalObraDados,
  apresentacao: RelatorioFinalObraApresentacao,
  ia: RelatorioFinalObraIaResposta,
  rfPayloads: RelatorioFotograficoPayload[],
  modelo: string,
): { apresentacao: RelatorioFinalObraApresentacao; analiseEnriquecida: AnaliseRelatorioFinalObra } {
  const analiseBase = analisarRelatorioFinalObra(dados);
  const destaques = mesclarDestaquesComIa(dados, analiseBase, ia);

  const paragrafos =
    ia.paragrafos.length > 0
      ? [
          ...ia.paragrafos,
          'Texto elaborado com apoio de análise assistida (API configurada em Configurações). Os indicadores numéricos e o arquivo completo em Excel permanecem vinculados aos registros do sistema.',
        ]
      : apresentacao.sintese.paragrafos;

  const alertas = ia.alertas.length > 0 ? ia.alertas : apresentacao.sintese.alertas;

  let rfDestaques = apresentacao.rfDestaques;
  const idsIa = (ia.relatoriosFotograficosDestaqueIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (idsIa.length > 0) {
    const porId = new Map(rfPayloads.map((p) => [p.reportId, p]));
    const ranqueados = ranquearRelatoriosFotograficos(rfPayloads, dados);
    const preferidos = idsIa.map((id) => porId.get(id)).filter((p): p is RelatorioFotograficoPayload => !!p);
    const restantes = ranqueados
      .map((r) => r.payload)
      .filter((p) => !idsIa.includes(p.reportId));
    const merged = [...preferidos, ...restantes];
    rfDestaques = montarDestaquesRf(
      merged.map((payload, i) => ({
        payload,
        pontuacao: ranqueados.find((r) => r.payload.reportId === payload.reportId)?.pontuacao ?? 100 - i,
        motivos: ['Priorizado na análise assistida', ...(ranqueados.find((r) => r.payload.reportId === payload.reportId)?.motivos ?? [])],
      })),
    );
  }

  const secoesModulo = normalizarSecoesModuloIa(ia.secoes, dados);

  return {
    apresentacao: {
      ...apresentacao,
      sintese: { paragrafos, alertas },
      secoesModulo: secoesModulo.length > 0 ? secoesModulo : undefined,
      rfDestaques,
      ia: {
        utilizada: true,
        modelo,
        notaAnalise: ia.notaAnalise?.trim() || undefined,
      },
    },
    analiseEnriquecida: {
      ...analiseBase,
      destaques,
    },
  };
}
