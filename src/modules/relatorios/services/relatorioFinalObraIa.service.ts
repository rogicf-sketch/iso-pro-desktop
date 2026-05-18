import { z } from 'zod';
import { chamarChatCompletionsIa, credenciaisIaFromConfiguracao } from '../../../lib/isoProIaApi.service';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import type { ConfiguracaoSistema } from '../../configuracoes/types/configuracao.types';
import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';
import type { RelatorioFinalObraApresentacao } from '../types/relatorioFinalObraApresentacao.types';
import type { RelatorioFinalObraIaResposta, RelatorioFinalObraIaResultado } from '../types/relatorioFinalObraIa.types';
import type { RelatorioFotograficoPayload } from '../types/relatorioFotografico.types';
import { analisarRelatorioFinalObra, type AnaliseRelatorioFinalObra } from '../utils/relatorioFinalObraAnalise';
import { montarContextoJsonParaIa } from '../utils/relatorioFinalObraContextoIa';
import { aplicarRespostaIaNaApresentacao } from '../utils/relatorioFinalObraIaMerge';
import { montarApresentacaoRelatorioFinalObra } from '../utils/relatorioFinalObraInteligencia';

const IA_TIMEOUT_MS = 60_000;

const severidadeSchema = z.enum(['critico', 'atencao', 'info']);
const alertaSchema = z.object({
  nivel: z.enum(['critico', 'atencao', 'ok']),
  texto: z.string(),
});
const destaqueSchema = z.object({
  modulo: z.string(),
  referencia: z.string(),
  motivo: z.string(),
  severidade: severidadeSchema,
  prioridade: z.number().optional(),
  dataIso: z.string().optional(),
});

const secaoSchema = z.object({
  modulo: z.string(),
  titulo: z.string().optional(),
  paragrafos: z.array(z.string()).default([]),
});

const respostaIaSchema = z.object({
  paragrafos: z.array(z.string()).default([]),
  alertas: z.array(alertaSchema).default([]),
  destaques: z.array(destaqueSchema).default([]),
  secoes: z.array(secaoSchema).optional(),
  relatoriosFotograficosDestaqueIds: z.array(z.string()).optional(),
  notaAnalise: z.string().optional(),
});

const SYSTEM_PROMPT = `Você é especialista em gestão de materiais de obras industriais (Brasil).
Analise o JSON de registros do sistema I.S.O PRO e produza um relatório executivo para o cliente.

Regras:
- Responda APENAS com um objeto JSON válido (sem markdown).
- "paragrafos": 3 a 6 parágrafos em português, tom profissional, personalizados ao projeto (cite cliente/projeto quando disponível).
- "alertas": até 6 itens com nivel critico|atencao|ok e texto curto.
- "destaques": até 40 ocorrências mais relevantes para encerramento (prioridade 1 = mais importante). Inclua RNC com dano/fotos, recebimentos não recebidos ou divergentes, RIR sem certificado ou laudo ruim, estornos, inventários abertos — mesmo que não estejam só nas regras automáticas.
- "relatoriosFotograficosDestaqueIds": até 3 IDs de relatórios fotográficos mais relevantes (campo id do JSON).
- "secoes": array com análise narrativa POR MÓDULO. Inclua apenas módulos com registros no JSON. Cada item: { "modulo": "recebimentos"|"rir"|"rnc"|"planejamento"|"atendimentos"|"inventarios"|"relatorios_fotograficos", "titulo": "título curto", "paragrafos": [ "1 a 3 parágrafos em português, citando números e códigos reais quando existirem" ] }. Em RNC comente fotos/danos; em recebimentos comente divergências e material não conferido; em RIR certificados e laudos.
- "notaAnalise": uma frase opcional sobre lacunas de dados.

Campos obrigatórios no JSON: paragrafos, alertas, destaques, secoes.`;

export function relatorioFinalIaConfigurada(cfg: ConfiguracaoSistema = readConfiguracoes()): boolean {
  return cfg.relatorioFinalIaHabilitado && credenciaisIaFromConfiguracao(cfg).apiKey.length >= 8;
}

export { testarConexaoIaApi } from '../../../lib/isoProIaApi.service';

function extrairJsonDaResposta(content: string): unknown {
  const t = content.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  const inner = fence ? fence[1].trim() : t;
  return JSON.parse(inner);
}

export async function solicitarAnaliseIaRelatorioFinalObra(
  dados: RelatorioFinalObraDados,
  cfg: ConfiguracaoSistema = readConfiguracoes(),
): Promise<RelatorioFinalObraIaResultado> {
  if (!relatorioFinalIaConfigurada(cfg)) {
    return { ok: false, erro: 'Análise por IA desativada ou chave de API não configurada.' };
  }

  const analise = analisarRelatorioFinalObra(dados);
  const payload = montarContextoJsonParaIa(dados, analise);
  const cred = credenciaisIaFromConfiguracao(cfg);

  const chamada = await chamarChatCompletionsIa(
    cred,
    {
      model: cred.modelo,
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(payload) },
      ],
    },
    IA_TIMEOUT_MS,
  );

  if (!chamada.ok) {
    return chamada;
  }

  const parsed = respostaIaSchema.safeParse(extrairJsonDaResposta(chamada.data));
  if (!parsed.success) {
    return { ok: false, erro: 'JSON da IA em formato inválido.' };
  }

  const resposta: RelatorioFinalObraIaResposta = {
    paragrafos: parsed.data.paragrafos.map((p) => p.trim()).filter(Boolean),
    alertas: parsed.data.alertas,
    destaques: parsed.data.destaques,
    secoes: parsed.data.secoes,
    relatoriosFotograficosDestaqueIds: parsed.data.relatoriosFotograficosDestaqueIds,
    notaAnalise: parsed.data.notaAnalise,
  };

  return { ok: true, resposta, modelo: cred.modelo };
}

export async function enriquecerRelatorioFinalObraComIa(
  dados: RelatorioFinalObraDados,
  apresentacao: RelatorioFinalObraApresentacao,
  rfPayloads: RelatorioFotograficoPayload[],
  cfg: ConfiguracaoSistema = readConfiguracoes(),
): Promise<{
  apresentacao: RelatorioFinalObraApresentacao;
  analiseEnriquecida?: AnaliseRelatorioFinalObra;
}> {
  const ia = await solicitarAnaliseIaRelatorioFinalObra(dados, cfg);
  if (!ia.ok) {
    return {
      apresentacao: {
        ...apresentacao,
        ia: { utilizada: false, erro: ia.erro },
      },
    };
  }

  const merged = aplicarRespostaIaNaApresentacao(dados, apresentacao, ia.resposta, rfPayloads, ia.modelo);
  return merged;
}

export async function enriquecerApresentacaoComIaOpcional(
  dados: RelatorioFinalObraDados,
  rfPayloads: RelatorioFotograficoPayload[],
): Promise<{
  apresentacao: RelatorioFinalObraApresentacao;
  analiseEnriquecida?: AnaliseRelatorioFinalObra;
}> {
  const apresentacao = montarApresentacaoRelatorioFinalObra(dados, rfPayloads);
  if (!relatorioFinalIaConfigurada()) {
    return { apresentacao };
  }
  return enriquecerRelatorioFinalObraComIa(dados, apresentacao, rfPayloads);
}
