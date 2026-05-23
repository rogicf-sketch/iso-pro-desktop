import { getDesktopLicenseRegistrySummary } from '../../configuracoes/services/desktopLicenseRegistry.service';
import { listarDocumentos } from '../../documentos/services/documentos.service';
import { listarInventarios } from '../../inventario/services/inventario.service';
import { collectAllPages } from '../../../lib/collectAllPages';
import { getMobileDeviceIndicators } from '../../mobile/services/mobileDevices.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import { listarRir, listarRnc } from '../../qualidade/services/qualidade.service';
import { getRuntimeSupabaseConfig, getSupabaseOperationalStatus } from '../../../lib/supabase';
import { listarMateriaisCriticosEstoque } from '../../materiais/services/materiaisEstoqueCritico.service';
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
  const [documentos, recebimentos, inventarios, mobile, desktopLicenses] = await Promise.all([
    collectAllPages((page, pageSize) => listarDocumentos({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarInventarios({ busca: '', status: 'todos', page, pageSize })),
    getMobileDeviceIndicators(),
    getDesktopLicenseRegistrySummary(),
  ]);

  const docsPendentes = documentos.filter((item) => item.status === 'pendente' || item.status === 'parcial').length;
  const recebimentosPendentes = recebimentos.filter((item) => item.status === 'aguardando_conferencia').length;
  const inventariosAbertos = inventarios.filter((item) => item.status === 'aberto').length;
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
      helper: 'Inventarios ainda em aberto',
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

export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  const [documentos, recebimentos, inventarios, mobile, rir, rnc, desktopLicenses, estoqueCriticos] =
    await Promise.all([
    collectAllPages((page, pageSize) => listarDocumentos({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarInventarios({ busca: '', status: 'todos', page, pageSize })),
    getMobileDeviceIndicators(),
    collectAllPages((page, pageSize) => listarRir({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarRnc({ busca: '', status: 'todos', page, pageSize })),
    getDesktopLicenseRegistrySummary(),
    listarMateriaisCriticosEstoque().catch(() => [] as Awaited<ReturnType<typeof listarMateriaisCriticosEstoque>>),
  ]);

  const docsPendentes = documentos.filter((item) => item.status === 'pendente' || item.status === 'parcial').length;
  const recebimentosPendentes = recebimentos.filter((item) => item.status === 'aguardando_conferencia').length;
  const inventariosComDivergencia = inventarios.filter((item) => item.divergencias > 0 && item.status !== 'cancelado').length;
  const rirAbertos = rir.filter((item) => item.status !== 'tratado' && item.status !== 'cancelado').length;
  const rncAbertas = rnc.filter((item) => item.status !== 'concluido' && item.status !== 'cancelado').length;

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

  if (estoqueCriticos.length > 0) {
    const qtdCriticos = estoqueCriticos.filter((i) => i.severidade === 'critical').length;
    alerts.push({
      severity: qtdCriticos > 0 ? 'critical' : 'warning',
      title: 'Estoque abaixo do alerta',
      detail: `${estoqueCriticos.length} material(is) com saldo abaixo do percentual configurado sobre o planejamento.${qtdCriticos > 0 ? ` ${qtdCriticos} critico(s).` : ''}`,
      route: '/materiais?tab=criticos',
    });
  }

  if (recebimentosPendentes > 0) {
    alerts.push({
      severity: 'warning',
      title: 'Recebimentos aguardando conferencia',
      detail: `${recebimentosPendentes} recebimento(s) no fluxo de conferencia.`,
      route: '/recebimentos',
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

  if (mobile.pendentes > 0 || mobile.bloqueados > 0) {
    alerts.push({
      severity: 'warning',
      title: 'Mobile requer acompanhamento',
      detail: `${mobile.pendentes} pendente(s) e ${mobile.bloqueados} bloqueado(s) no painel de dispositivos.`,
      route: '/mobile',
    });
  }

  if (rirAbertos > 0 || rncAbertas > 0) {
    alerts.push({
      severity: 'warning',
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

  alerts.sort((a, b) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity]);
  return alerts;
}
