import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';
import type { AnaliseRelatorioFinalObra } from './relatorioFinalObraAnalise';
import { analisarRirCertificados } from './relatorioFinalObraInteligencia';

const MAX_CHARS_PAYLOAD = 95_000;
const MAX_RNC = 80;
const MAX_RECEB = 120;
const MAX_RIR = 80;

function trunc(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

function contarFotosRnc(rnc: RelatorioFinalObraDados['rnc'][0]): number {
  let n = 0;
  for (const linha of rnc.itensRnc ?? []) {
    if (linha.incluir !== false) {
      n += linha.fotosDataUrls?.length ?? 0;
    }
  }
  return n;
}

function resumoTiposOcorrencia(tipos: Record<string, unknown> | undefined): string[] {
  if (!tipos) return [];
  return Object.entries(tipos)
    .filter(([k, v]) => k !== 'outroTexto' && v === true)
    .map(([k]) => k);
}

/** JSON enviado ao modelo — sem imagens em base64 (só contagens e metadados). */
export function montarContextoJsonParaIa(
  dados: RelatorioFinalObraDados,
  analise: AnaliseRelatorioFinalObra,
): Record<string, unknown> {
  const rc = analisarRirCertificados(dados.rir);

  const recebimentos = dados.recebimentos.slice(0, MAX_RECEB).map((r) => ({
    id: r.id,
    notaFiscal: r.notaFiscal,
    fornecedor: r.fornecedor,
    data: r.dataRecebimento,
    status: r.status,
    modo: r.modoRecebimento,
    totalItens: r.totalItens,
    qtdRecebida: r.quantidadeRecebidaTotal,
    qtdConferida: r.quantidadeConferidaTotal,
    itensDivergentes: r.conferenciaItensDivergentes,
    pendenciaConferencia:
      r.status === 'aguardando_conferencia' ||
      r.status === 'parcialmente_conferido' ||
      (r.quantidadeConferidaTotal < r.quantidadeRecebidaTotal && r.status !== 'cancelado'),
  }));

  const rnc = dados.rnc.slice(0, MAX_RNC).map((r) => ({
    codigo: r.codigo,
    data: r.dataRegistro,
    status: r.status,
    descricao: trunc(r.descricaoDetalhada || r.descricao, 240),
    nf: r.recebimentoNotaFiscal,
    fornecedor: r.recebimentoFornecedor,
    fotosAnexadas: r.evidencias?.fotosAnexadas,
    totalFotosItens: contarFotosRnc(r),
    tiposOcorrencia: resumoTiposOcorrencia(r.tiposOcorrencia as Record<string, unknown>),
    laudoEncerramento: r.encerramentoParecer,
    itensComRejeicao: (r.itensRnc ?? []).filter((i) => i.incluir !== false && i.quantidadeRejeitada > 0).length,
  }));

  const rir = dados.rir.slice(0, MAX_RIR).map((r) => {
    const linhas = r.itensRir ?? [];
    const semCert = linhas.filter((l) => {
      const c = String(l.certificado ?? '').trim().toUpperCase();
      return !c || c === 'N/A' || c === 'NA';
    }).length;
    return {
      codigo: r.codigo,
      data: r.dataRegistro,
      status: r.status,
      laudo: r.laudo,
      nf: r.recebimentoNotaFiscal,
      linhas: linhas.length,
      linhasSemCertificado: semCert,
      obs: trunc(r.observacoes || r.obsCurta, 160),
    };
  });

  const rf = dados.relatoriosFotograficos.map((m) => ({
    id: m.id,
    numero: m.numeroRelatorio,
    titulo: m.titulo,
    salvoEm: m.salvoEm,
    fotoCount: m.fotoCount,
  }));

  const payload: Record<string, unknown> = {
    instrucao:
      'Analise os registros da obra e produza síntese executiva em português (Brasil), destaques priorizados e IDs de RF relevantes. Considere: material danificado/avariado (RNC com fotos), recebimentos não conferidos ou com divergência, certificados RIR em falta, laudos reprovados, estornos, inventários abertos, NC em aberto.',
    contexto: {
      cliente: dados.contexto.cliente,
      projeto: dados.contexto.projeto,
      contrato: dados.contexto.contrato,
      local: dados.contexto.local,
      geradoEm: dados.contexto.geradoEm,
    },
    totais: dados.totais,
    resumoRirCertificados: rc,
    destaquesRegrasAutomaticas: analise.destaques.map((d) => ({
      modulo: d.modulo,
      referencia: d.referencia,
      motivo: d.motivo,
      severidade: d.severidade,
      data: d.dataIso,
    })),
    documentos: dados.documentos.map((d) => ({
      numero: d.numero,
      status: d.status,
      data: d.dataDocumento,
    })),
    recebimentos,
    rir,
    rnc,
    atendimentos: dados.atendimentos.map((a) => ({
      numero: a.numero,
      status: a.status,
      data: a.dataAtendimento,
      documento: a.documentoNumero,
    })),
    inventarios: dados.inventarios.map((i) => ({
      codigo: i.codigo,
      status: i.status,
      data: i.dataInventario,
    })),
    relatoriosFotograficos: rf,
  };

  let json = JSON.stringify(payload);
  if (json.length > MAX_CHARS_PAYLOAD) {
    const reduzido = {
      ...payload,
      recebimentos: recebimentos.filter(
        (r) => r.status === 'divergente' || r.status === 'cancelado' || r.pendenciaConferencia || r.itensDivergentes > 0,
      ),
      rnc: rnc.filter((r) => r.status !== 'cancelado' || r.totalFotosItens > 0),
      rir: rir.filter((r) => r.laudo === 'reprovado' || r.linhasSemCertificado > 0 || r.status === 'aberto' || r.status === 'em_analise'),
      documentos: undefined,
      atendimentos: dados.atendimentos
        .filter((a) => a.status === 'estornado')
        .map((a) => ({ numero: a.numero, status: a.status, data: a.dataAtendimento })),
    };
    json = JSON.stringify(reduzido);
    if (json.length > MAX_CHARS_PAYLOAD) {
      return {
        instrucao: payload.instrucao,
        contexto: payload.contexto,
        totais: payload.totais,
        destaquesRegrasAutomaticas: analise.destaques.slice(0, 60),
        avisoPayload: 'Volume alto — enviado resumo compacto.',
      };
    }
    return reduzido as Record<string, unknown>;
  }

  return payload;
}
