import { collectAllPages } from '../../../lib/collectAllPages';
import { fetchOperacaoContagens } from '../../../lib/operacaoEscalaContagens';
import { getDesktopLicenseRegistrySummary } from '../../configuracoes/services/desktopLicenseRegistry.service';
import { listarDocumentos } from '../../documentos/services/documentos.service';
import { listarInventarios } from '../../inventario/services/inventario.service';
import { getMobileDeviceIndicators } from '../../mobile/services/mobileDevices.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import { listarRir, listarRnc } from '../../qualidade/services/qualidade.service';
import {
  getRuntimeSupabaseConfig,
  getSupabaseOperationalStatus,
  hasSupabaseConfig,
} from '../../../lib/supabase';
import {
  listarMateriaisCriticosEstoque,
  type MaterialEstoqueCritico,
} from '../../materiais/services/materiaisEstoqueCritico.service';
import {
  contarRecebimentosDivergentes,
  listarRirReprovadosSemRnc,
} from '../utils/pendenciasOperacionais.utils';
import { diasCorridosDesde } from '../utils/alertaOperacional.utils';
import type {
  DashboardAlert,
  DashboardAlertSeverity,
  DashboardCloudPanel,
  DashboardIndicator,
  DashboardIndicatorTone,
} from '../types/dashboard.types';

const ALERT_SEVERITY_ORDER: Record<DashboardAlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  success: 3,
};

function indicatorTone(count: number, warnFrom = 1): DashboardIndicatorTone {
  if (count <= 0) return 'ok';
  if (count >= warnFrom) return 'warning';
  return 'neutral';
}

export function getDashboardCloudPanel(): DashboardCloudPanel {
  const status = getSupabaseOperationalStatus();
  const { materiaisNuvem } = getRuntimeSupabaseConfig();

  if (status === 'ready') {
    return {
      status,
      title: 'Nuvem operacional',
      detail:
        'Supabase configurado. Os cadastros gravados com sucesso ficam no servidor; este PC mantem copia para leitura rapida.',
      tone: 'ok',
      materiaisNuvem,
    };
  }

  if (status === 'partial') {
    return {
      status,
      title: 'Configuracao incompleta',
      detail:
        'URL ou chave anon em falta. Complete em Configuracoes > Integracao Supabase. Em producao, gravacoes de negocio podem ser bloqueadas.',
      tone: 'warning',
      materiaisNuvem,
    };
  }

  return {
    status,
    title: 'Sem ligacao a nuvem',
    detail:
      'Supabase nao configurado neste posto. O painel usa dados locais; cadastros podem nao replicar noutros PCs.',
    tone: 'danger',
    materiaisNuvem: false,
  };
}

export async function getDashboardIndicators(): Promise<DashboardIndicator[]> {
  const [mobile, desktopLicenses, contagensCloud] = await Promise.all([
    getMobileDeviceIndicators(),
    getDesktopLicenseRegistrySummary(),
    hasSupabaseConfig() ? fetchOperacaoContagens() : Promise.resolve(null),
  ]);

  let docsPendentes = 0;
  let recebimentosPendentes = 0;
  let inventariosAbertos = 0;
  let diasInventarioMaisAntigo = 0;

  if (contagensCloud) {
    docsPendentes = contagensCloud.docsPendentes;
    recebimentosPendentes = contagensCloud.recebimentosAguardando;
    inventariosAbertos = contagensCloud.inventariosAbertos;
    diasInventarioMaisAntigo = contagensCloud.inventarioDiasMaisAntigo;
  } else {
    const [documentos, recebimentos, inventarios] = await Promise.all([
      collectAllPages((page, pageSize) => listarDocumentos({ busca: '', status: 'todos', page, pageSize })),
      collectAllPages((page, pageSize) =>
        listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize }),
      ),
      collectAllPages((page, pageSize) => listarInventarios({ busca: '', status: 'todos', page, pageSize })),
    ]);
    docsPendentes = documentos.filter((item) => item.status === 'pendente' || item.status === 'parcial').length;
    recebimentosPendentes = recebimentos.filter((item) => item.status === 'aguardando_conferencia').length;
    const inventariosAbertosLista = inventarios.filter((item) => item.status === 'aberto');
    inventariosAbertos = inventariosAbertosLista.length;
    diasInventarioMaisAntigo =
      inventariosAbertosLista.length > 0
        ? Math.max(...inventariosAbertosLista.map((item) => diasCorridosDesde(item.dataInventario)))
        : 0;
  }

  const licencasAtivas = desktopLicenses.data?.active ?? 0;
  const licencasExpiradas = desktopLicenses.data?.expired ?? 0;
  const licencasExpirando = desktopLicenses.data?.expiringSoon ?? 0;

  let licencasTone: DashboardIndicatorTone = 'ok';
  if (licencasExpiradas > 0) licencasTone = 'danger';
  else if (licencasExpirando > 0) licencasTone = 'warning';

  return [
    {
      label: 'Planejamento',
      value: String(docsPendentes),
      numericValue: docsPendentes,
      helper: 'Documentos pendentes ou parciais',
      route: '/documentos',
      tone: indicatorTone(docsPendentes),
    },
    {
      label: 'Recebimentos',
      value: String(recebimentosPendentes),
      numericValue: recebimentosPendentes,
      helper: 'Aguardando conferencia',
      route: '/recebimentos',
      tone: indicatorTone(recebimentosPendentes),
    },
    {
      label: 'Inventarios',
      value: String(inventariosAbertos),
      numericValue: inventariosAbertos,
      helper:
        inventariosAbertos > 0 && diasInventarioMaisAntigo > 0
          ? `Inventarios ainda em aberto (mais antigo: ${diasInventarioMaisAntigo} dia(s))`
          : 'Inventarios ainda em aberto',
      route: '/inventario',
      tone: indicatorTone(inventariosAbertos),
    },
    {
      label: 'Mobile ativo',
      value: String(mobile.autorizados),
      numericValue: mobile.autorizados,
      helper: 'Dispositivos autorizados',
      route: '/mobile',
      tone: mobile.pendentes > 0 || mobile.bloqueados > 0 ? 'warning' : 'ok',
    },
    {
      label: 'Licencas desktop',
      value: String(licencasAtivas),
      numericValue: licencasAtivas,
      helper: desktopLicenses.data
        ? `${licencasExpiradas} expiradas e ${licencasExpirando} expirando`
        : 'Monitoramento central de licencas',
      route: '/licencas-desktop',
      tone: licencasTone,
    },
  ];
}

const ESTOQUE_CRITICO_PAINEL_TTL_MS = 10 * 60 * 1000;
let estoqueCriticoPainelCache: { at: number; items: MaterialEstoqueCritico[] } | null = null;
let estoqueCriticoPainelFlight: Promise<MaterialEstoqueCritico[]> | null = null;

/**
 * O alerta de estoque percorre o cadastro inteiro (~10 mil materiais).
 * Não entra na abertura do Painel: os números da operação aparecem primeiro.
 */
export function carregarEstoqueCriticoParaPainel(): Promise<MaterialEstoqueCritico[]> {
  if (estoqueCriticoPainelCache && Date.now() - estoqueCriticoPainelCache.at < ESTOQUE_CRITICO_PAINEL_TTL_MS) {
    return Promise.resolve(estoqueCriticoPainelCache.items);
  }
  if (estoqueCriticoPainelFlight) return estoqueCriticoPainelFlight;
  estoqueCriticoPainelFlight = listarMateriaisCriticosEstoque()
    .then((items) => {
      estoqueCriticoPainelCache = { at: Date.now(), items };
      return items;
    })
    .catch(() => estoqueCriticoPainelCache?.items ?? [])
    .finally(() => {
      estoqueCriticoPainelFlight = null;
    });
  return estoqueCriticoPainelFlight;
}

export function incorporarAlertaEstoqueCritico(
  alerts: DashboardAlert[],
  estoqueCriticos: MaterialEstoqueCritico[],
): DashboardAlert[] {
  const without = alerts.filter((alert) => alert.title !== 'Estoque abaixo do alerta');
  if (estoqueCriticos.length === 0) return without;
  const qtdCriticos = estoqueCriticos.filter((item) => item.severidade === 'critical').length;
  const next = [
    ...without,
    {
      severity: qtdCriticos > 0 ? 'critical' : 'warning',
      title: 'Estoque abaixo do alerta',
      detail: `${estoqueCriticos.length} material(is) com saldo abaixo do percentual configurado sobre o planejamento.${qtdCriticos > 0 ? ` ${qtdCriticos} critico(s).` : ''}`,
      route: '/materiais?tab=criticos',
    } satisfies DashboardAlert,
  ];
  next.sort((a, b) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity]);
  return next;
}

export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  const [mobile, desktopLicenses, contagensCloud] = await Promise.all([
    getMobileDeviceIndicators(),
    getDesktopLicenseRegistrySummary(),
    hasSupabaseConfig() ? fetchOperacaoContagens() : Promise.resolve(null),
  ]);

  let docsPendentes = 0;
  let recebimentosPendentes = 0;
  let inventariosComDivergencia = 0;
  let rirAbertos = 0;
  let rncAbertas = 0;
  let rirReprovadoSemRnc = 0;
  let recebimentosDivergentes = 0;

  if (contagensCloud) {
    docsPendentes = contagensCloud.docsPendentes;
    recebimentosPendentes = contagensCloud.recebimentosAguardando;
    inventariosComDivergencia = contagensCloud.inventariosComDivergencia;
    rirAbertos = contagensCloud.rirAbertos;
    rncAbertas = contagensCloud.rncAbertas;
    rirReprovadoSemRnc = contagensCloud.rirReprovadoSemRnc;
    recebimentosDivergentes = contagensCloud.recebimentosDivergentes;
  } else {
    const [documentos, recebimentos, inventarios, rir, rnc] = await Promise.all([
      collectAllPages((page, pageSize) => listarDocumentos({ busca: '', status: 'todos', page, pageSize })),
      collectAllPages((page, pageSize) =>
        listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize }),
      ),
      collectAllPages((page, pageSize) => listarInventarios({ busca: '', status: 'todos', page, pageSize })),
      collectAllPages((page, pageSize) => listarRir({ busca: '', status: 'todos', page, pageSize })),
      collectAllPages((page, pageSize) => listarRnc({ busca: '', status: 'todos', page, pageSize })),
    ]);
    docsPendentes = documentos.filter((item) => item.status === 'pendente' || item.status === 'parcial').length;
    recebimentosPendentes = recebimentos.filter((item) => item.status === 'aguardando_conferencia').length;
    inventariosComDivergencia = inventarios.filter(
      (item) => item.divergencias > 0 && item.status !== 'cancelado',
    ).length;
    rirAbertos = rir.filter((item) => item.status !== 'tratado' && item.status !== 'cancelado').length;
    rncAbertas = rnc.filter((item) => item.status !== 'concluido' && item.status !== 'cancelado').length;
    rirReprovadoSemRnc = listarRirReprovadosSemRnc(rir, rnc).length;
    recebimentosDivergentes = contarRecebimentosDivergentes(recebimentos);
  }

  const cloud = getDashboardCloudPanel();
  const alerts: DashboardAlert[] = [];

  if (cloud.status === 'missing') {
    alerts.push({
      severity: 'critical',
      title: 'Nuvem nao configurada',
      detail: 'Configure Supabase para que os cadastros sejam a referencia em todos os postos.',
      route: '/configuracoes',
    });
  } else if (cloud.status === 'partial') {
    alerts.push({
      severity: 'warning',
      title: 'Integracao Supabase incompleta',
      detail: 'Preencha URL e chave anon em Configuracoes e salve antes de operar em producao.',
      route: '/configuracoes',
    });
  }

  if ((desktopLicenses.data?.expired ?? 0) > 0) {
    alerts.push({
      severity: 'critical',
      title: 'Licencas desktop expiradas',
      detail: `${desktopLicenses.data?.expired ?? 0} licenca(s) expiradas — renove ou revogue em Licencas desktop.`,
      route: '/licencas-desktop',
    });
  }

  if (inventariosComDivergencia > 0) {
    alerts.push({
      severity: 'warning',
      title: 'Inventario com divergencia',
      detail: `${inventariosComDivergencia} inventario(s) com diferenca entre saldo do sistema e contagem.`,
      route: '/inventario',
    });
  }

  if (recebimentosPendentes > 0) {
    // Fila de trabalho, nao crise — so sobe a "atenção" se houver divergência (alerta critico abaixo).
    alerts.push({
      severity: 'info',
      title: 'Recebimentos aguardando conferencia',
      detail: `${recebimentosPendentes} recebimento(s) no fluxo de conferencia (prazo e e-mail em Configuracoes > Alertas).`,
      route: '/recebimentos',
    });
  }

  if (recebimentosDivergentes > 0) {
    alerts.push({
      severity: 'critical',
      title: 'Recebimentos com divergencia',
      detail: `${recebimentosDivergentes} recebimento(s) com status divergente ou itens pendentes de regularizacao na conferencia.`,
      route: '/conferencia',
    });
  }

  if (rirReprovadoSemRnc > 0) {
    alerts.push({
      severity: 'critical',
      title: 'RIR reprovado sem RNC',
      detail: `${rirReprovadoSemRnc} RIR com laudo reprovado sem nao conformidade (RNC) vinculada ao recebimento.`,
      route: '/rnc',
    });
  }

  if (docsPendentes > 0) {
    alerts.push({
      severity: 'info',
      title: 'Planejamento com pendencias',
      detail: `${docsPendentes} documento(s) precisam de atendimento total ou parcial.`,
      route: '/documentos',
    });
  }

  if (mobile.bloqueados > 0) {
    alerts.push({
      severity: 'warning',
      title: 'Mobile com aparelhos bloqueados',
      detail: `${mobile.bloqueados} aparelho(s) bloqueado(s) — rever no painel de dispositivos.`,
      route: '/mobile',
    });
  } else if (mobile.pendentes > 0) {
    alerts.push({
      severity: 'info',
      title: 'Mobile com autorizacao pendente',
      detail: `${mobile.pendentes} aparelho(s) aguardando autorizacao.`,
      route: '/mobile',
    });
  }

  if (rirAbertos > 0 || rncAbertas > 0) {
    // Abertas recentes: info (nao polui o chip "atenção"). Critico separado: RIR sem RNC.
    alerts.push({
      severity: 'info',
      title: 'Qualidade com tratativas abertas',
      detail: `${rirAbertos} RIR e ${rncAbertas} RNC ainda exigem acompanhamento.`,
      route: '/rir',
    });
  }

  if ((desktopLicenses.data?.expiringSoon ?? 0) > 0) {
    alerts.push({
      severity: 'info',
      title: 'Licencas desktop a expirar',
      detail: `${desktopLicenses.data?.expiringSoon ?? 0} licenca(s) expiram nos proximos 30 dias.`,
      route: '/licencas-desktop',
    });
  }

  if ((desktopLicenses.data?.missingMachineLabel ?? 0) > 0) {
    alerts.push({
      severity: 'info',
      title: 'Licencas sem identificacao completa',
      detail: `${desktopLicenses.data?.missingMachineLabel ?? 0} licenca(s) sem nome administrativo da maquina.`,
      route: '/licencas-desktop',
    });
  }

  try {
    const { fetchSupabaseQuotaUsage } = await import('../../../lib/supabaseQuotaUsage');
    const quota = await fetchSupabaseQuotaUsage();
    if (quota) {
      if (quota.databaseTone === 'danger' || quota.storageTone === 'danger') {
        alerts.push({
          severity: 'critical',
          title: 'Cota Supabase quase esgotada',
          detail: `Base ${quota.databaseLabel} (${quota.databasePercent.toFixed(0)}%) · Storage ${quota.storageLabel} (${quota.storagePercent.toFixed(0)}%).`,
          route: '/configuracoes',
        });
      } else if (quota.databaseTone === 'warning' || quota.storageTone === 'warning') {
        alerts.push({
          severity: 'warning',
          title: 'Cota Supabase em atenção',
          detail: `Base ${quota.databasePercent.toFixed(0)}% de 8 GB · Storage ${quota.storagePercent.toFixed(0)}% de 100 GB.`,
          route: '/configuracoes',
        });
      }
    }
  } catch {
    /* painel continua sem quota */
  }

  alerts.sort((a, b) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity]);
  return alerts;
}
