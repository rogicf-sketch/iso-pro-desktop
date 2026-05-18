import type { RirRegistro, RncRegistro } from '../../qualidade/types/qualidade.types';
import type { RecebimentoListItem } from '../../recebimentos/types/recebimento.types';
import type { RelatorioFotograficoPayload } from '../types/relatorioFotografico.types';
import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';
import type {
  RelatorioFinalObraApresentacao,
  RelatorioFotograficoDestaqueRfo,
  ResumoRirCertificados,
  SinteseExecutivaRfo,
} from '../types/relatorioFinalObraApresentacao.types';
import { analisarRelatorioFinalObra } from './relatorioFinalObraAnalise';

const MAX_RF_DESTAQUES = 3;
const MAX_FOTOS_RF_DOC = 4;

const PALAVRAS_CRITICAS_RF = [
  'rnc',
  'não conform',
  'nao conform',
  'diverg',
  'avaria',
  'rejeit',
  'danif',
  'quebra',
  'urgent',
  'crític',
  'critic',
  'falha',
  'problema',
  'defeito',
  'sinistro',
  'interdit',
];

export function certificadoRirInformado(cert: string | undefined): boolean {
  const t = String(cert ?? '').trim().toUpperCase();
  if (!t) return false;
  if (t === 'N/A' || t === 'NA' || t === '-' || t === '—' || t === 'S/N' || t === 'SN') return false;
  return true;
}

export function analisarRirCertificados(rir: RirRegistro[]): ResumoRirCertificados {
  let rirComTodos = 0;
  let rirComLacuna = 0;
  let linhasTotal = 0;
  let linhasCom = 0;
  let laudoAprovado = 0;
  let laudoReprovado = 0;
  let laudoObservacoes = 0;
  let rirCancelados = 0;

  for (const r of rir) {
    if (r.status === 'cancelado') {
      rirCancelados += 1;
      continue;
    }
    if (r.laudo === 'aprovado') laudoAprovado += 1;
    else if (r.laudo === 'reprovado') laudoReprovado += 1;
    else if (r.laudo === 'observacoes') laudoObservacoes += 1;

    const itens = r.itensRir ?? [];
    if (itens.length === 0) continue;
    let todosOk = true;
    for (const it of itens) {
      linhasTotal += 1;
      if (certificadoRirInformado(it.certificado)) {
        linhasCom += 1;
      } else {
        todosOk = false;
      }
    }
    if (todosOk) rirComTodos += 1;
    else rirComLacuna += 1;
  }

  const linhasSem = linhasTotal - linhasCom;

  return {
    rirTotal: rir.length,
    rirCancelados,
    rirComTodosItensCertificados: rirComTodos,
    rirComLacunaCertificado: rirComLacuna,
    linhasTotal,
    linhasComCertificado: linhasCom,
    linhasSemCertificado: linhasSem,
    laudoAprovado,
    laudoReprovado,
    laudoObservacoes,
  };
}

function mapaRecebimentosPorId(recebimentos: RecebimentoListItem[]): Map<string, RecebimentoListItem> {
  return new Map(recebimentos.map((r) => [r.id, r]));
}

function mapaRirPorCodigo(rir: RirRegistro[]): Map<string, RirRegistro> {
  return new Map(rir.map((r) => [r.codigo.trim().toLowerCase(), r]));
}

function mapaRncPorRecebimento(rnc: RncRegistro[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rnc) {
    if (r.status === 'cancelado') continue;
    const id = r.recebimentoId?.trim();
    if (!id) continue;
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

export function pontuarRelatorioFotografico(
  p: RelatorioFotograficoPayload,
  ctx: {
    recebimentos: Map<string, RecebimentoListItem>;
    rirPorCodigo: Map<string, RirRegistro>;
    rncPorRecebimento: Map<string, number>;
  },
): { pontuacao: number; motivos: string[] } {
  const motivos: string[] = [];
  let pontuacao = 0;
  const texto = `${p.titulo} ${p.observacoes}`.toLowerCase();

  for (const kw of PALAVRAS_CRITICAS_RF) {
    if (texto.includes(kw)) {
      pontuacao += 12;
      motivos.push(`Termo indicativo de ocorrência: «${kw}»`);
      break;
    }
  }

  const rid = p.recebimentoId?.trim();
  if (rid) {
    const rec = ctx.recebimentos.get(rid);
    if (rec) {
      if (rec.status === 'divergente') {
        pontuacao += 28;
        motivos.push('Vinculado a recebimento com status divergente');
      }
      if (rec.conferenciaItensDivergentes > 0) {
        pontuacao += 18 + Math.min(rec.conferenciaItensDivergentes * 2, 12);
        motivos.push(`${rec.conferenciaItensDivergentes} item(ns) com divergência na conferência`);
      }
      if (rec.status === 'cancelado') {
        pontuacao += 15;
        motivos.push('Recebimento vinculado cancelado');
      }
    }
    const nRnc = ctx.rncPorRecebimento.get(rid) ?? 0;
    if (nRnc > 0) {
      pontuacao += 22 + nRnc * 5;
      motivos.push(`${nRnc} RNC vinculada(s) ao mesmo recebimento`);
    }
  }

  const codRir = p.rirCodigo?.trim().toLowerCase();
  if (codRir) {
    const rir = ctx.rirPorCodigo.get(codRir);
    if (rir) {
      if (rir.laudo === 'reprovado') {
        pontuacao += 30;
        motivos.push(`RIR ${rir.codigo} com laudo reprovado`);
      } else if (rir.laudo === 'observacoes') {
        pontuacao += 14;
        motivos.push(`RIR ${rir.codigo} com observações no laudo`);
      }
    }
  }

  if (p.fotos.length >= 6) {
    pontuacao += 8;
    motivos.push('Volume elevado de evidências fotográficas');
  } else if (p.fotos.length >= 3) {
    pontuacao += 4;
  }

  if (p.observacoes.trim().length > 80) {
    pontuacao += 6;
    motivos.push('Observações detalhadas no relatório fotográfico');
  }

  return { pontuacao, motivos: [...new Set(motivos)].slice(0, 5) };
}

export function ranquearRelatoriosFotograficos(
  payloads: RelatorioFotograficoPayload[],
  dados: RelatorioFinalObraDados,
): Array<{ payload: RelatorioFotograficoPayload; pontuacao: number; motivos: string[] }> {
  const ctx = {
    recebimentos: mapaRecebimentosPorId(dados.recebimentos),
    rirPorCodigo: mapaRirPorCodigo(dados.rir),
    rncPorRecebimento: mapaRncPorRecebimento(dados.rnc),
  };
  return payloads
    .map((payload) => {
      const { pontuacao, motivos } = pontuarRelatorioFotografico(payload, ctx);
      return { payload, pontuacao, motivos };
    })
    .sort((a, b) => b.pontuacao - a.pontuacao || b.payload.salvoEm.localeCompare(a.payload.salvoEm));
}

export function montarDestaquesRf(
  ranqueados: Array<{ payload: RelatorioFotograficoPayload; pontuacao: number; motivos: string[] }>,
): RelatorioFotograficoDestaqueRfo[] {
  const comScore = ranqueados.filter((r) => r.pontuacao > 0);
  const base = (comScore.length > 0 ? comScore : ranqueados).slice(0, MAX_RF_DESTAQUES);

  return base.map(({ payload, pontuacao, motivos }) => {
    const fotos = payload.fotos
      .filter((f) => (f.dataUrl ?? '').trim().length > 20)
      .slice(0, MAX_FOTOS_RF_DOC)
      .map((f) => ({
        dataUrl: f.dataUrl!.trim(),
        legenda: f.legenda.trim() || 'Evidência fotográfica',
      }));

    const motivosFinais =
      motivos.length > 0
        ? motivos
        : ['Selecionado como evidência representativa da obra (maior relevância disponível)'];

    return {
      reportId: payload.reportId,
      numeroRelatorio: payload.numeroRelatorio.trim() || payload.reportId,
      titulo: payload.titulo.trim() || 'Relatório fotográfico',
      salvoEm: payload.salvoEm,
      pontuacao,
      motivos: motivosFinais,
      notaFiscal: payload.notaFiscal.trim(),
      fornecedor: payload.fornecedor.trim(),
      fotos,
    };
  });
}

export function gerarSinteseExecutiva(dados: RelatorioFinalObraDados, ap: Omit<RelatorioFinalObraApresentacao, 'sintese'>): SinteseExecutivaRfo {
  const { contexto, totais } = dados;
  const analise = analisarRelatorioFinalObra(dados);
  const crit = analise.destaques.filter((d) => d.severidade === 'critico').length;
  const atencao = analise.destaques.filter((d) => d.severidade === 'atencao').length;
  const paragrafos: string[] = [];

  const obra = contexto.projeto.trim() || contexto.cliente.trim() || 'do projeto';
  paragrafos.push(
    `Este documento consolida a operação de materiais da obra «${obra}», com foco em indicadores de encerramento e nas ocorrências que exigem atenção do cliente. A síntese foi elaborada automaticamente pelo I.S.O PRO a partir dos registros efetivamente gravados no sistema na data de emissão.`,
  );

  paragrafos.push(
    `No período consolidado foram contabilizados ${totais.documentos} planejamentos, ${totais.recebimentos} recebimentos, ${totais.rir} RIR, ${totais.rnc} RNC, ${totais.atendimentos} atendimentos, ${totais.inventarios} inventários e ${totais.relatoriosFotograficos} relatórios fotográficos.`,
  );

  const rc = ap.rirCertificados;
  if (rc.rirTotal > 0) {
    const pctCert = rc.linhasTotal > 0 ? Math.round((rc.linhasComCertificado / rc.linhasTotal) * 100) : 0;
    paragrafos.push(
      `Na inspeção de recebimento (RIR), ${rc.rirComTodosItensCertificados} de ${rc.rirTotal - rc.rirCancelados} relatório(s) ativo(s) apresentam certificado em todas as linhas; ${rc.linhasSemCertificado} linha(s) (${100 - pctCert}% do volume de itens) permanecem sem certificado informado ou com «N/A». Laudos: ${rc.laudoAprovado} aprovado(s), ${rc.laudoReprovado} reprovado(s), ${rc.laudoObservacoes} com observações.`,
    );
  }

  if (crit + atencao > 0) {
    paragrafos.push(
      `O painel de destaques registra ${crit} ocorrência(s) crítica(s) e ${atencao} ponto(s) de atenção — incluindo cancelamentos, divergências, não conformidades, estornos e pendências — ordenados para facilitar a gestão do encerramento.`,
    );
  } else {
    paragrafos.push(
      `Não foram identificadas ocorrências críticas automáticas além do fluxo normal de registro, o que indica consistência operacional para fins de encerramento documental.`,
    );
  }

  if (ap.rfDestaques.length > 0) {
    const titulos = ap.rfDestaques.map((r) => r.numeroRelatorio || r.titulo).join(', ');
    paragrafos.push(
      `Foram selecionadas ${ap.rfDestaques.length} evidência(s) fotográfica(s) de maior relevância para esta apresentação (${titulos}), com base em vínculos a divergências, RNC, laudos de RIR e termos de ocorrência no próprio relatório.`,
    );
  }

  const alertas: SinteseExecutivaRfo['alertas'] = [];

  if (totais.inventariosAbertos > 0) {
    alertas.push({ nivel: 'atencao', texto: `${totais.inventariosAbertos} inventário(s) ainda aberto(s) no encerramento.` });
  }
  if (rc.laudoReprovado > 0) {
    alertas.push({ nivel: 'critico', texto: `${rc.laudoReprovado} RIR com laudo reprovado.` });
  }
  if (totais.rnc > totais.rncCancelados) {
    alertas.push({
      nivel: 'critico',
      texto: `${totais.rnc - totais.rncCancelados} registro(s) de não conformidade ativo(s) no histórico da obra.`,
    });
  }
  if (totais.recebimentosCancelados > 0) {
    alertas.push({ nivel: 'atencao', texto: `${totais.recebimentosCancelados} recebimento(s) cancelado(s) arquivados.` });
  }
  if (alertas.length === 0) {
    alertas.push({ nivel: 'ok', texto: 'Indicadores automáticos sem alertas críticos adicionais para encerramento.' });
  }

  return { paragrafos, alertas };
}

export function montarApresentacaoRelatorioFinalObra(
  dados: RelatorioFinalObraDados,
  rfPayloads: RelatorioFotograficoPayload[],
): RelatorioFinalObraApresentacao {
  const rirCertificados = analisarRirCertificados(dados.rir);
  const ranqueados = ranquearRelatoriosFotograficos(rfPayloads, dados);
  const rfDestaques = montarDestaquesRf(ranqueados);
  const base = { rirCertificados, rfDestaques };
  const sintese = gerarSinteseExecutiva(dados, base);
  return { sintese, ...base };
}
