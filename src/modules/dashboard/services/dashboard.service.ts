import { getDesktopLicenseRegistrySummary } from '../../configuracoes/services/desktopLicenseRegistry.service';
import { listarDocumentos } from '../../documentos/services/documentos.service';
import { listarInventarios } from '../../inventario/services/inventario.service';
import { collectAllPages } from '../../../lib/collectAllPages';
import { getMobileDeviceIndicators } from '../../mobile/services/mobileDevices.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import { listarRir, listarRnc } from '../../qualidade/services/qualidade.service';
import type { DashboardAlert, DashboardIndicator } from '../types/dashboard.types';

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

  return [
    { label: 'Planejamento', value: String(docsPendentes), helper: 'Documentos pendentes ou parciais' },
    { label: 'Recebimentos', value: String(recebimentosPendentes), helper: 'Aguardando conferencia' },
    { label: 'Inventarios', value: String(inventariosAbertos), helper: 'Inventarios ainda em aberto' },
    { label: 'Mobile ativo', value: String(mobile.autorizados), helper: 'Dispositivos autorizados' },
    {
      label: 'Licencas desktop',
      value: String(desktopLicenses.data?.active ?? 0),
      helper: desktopLicenses.data ? `${desktopLicenses.data.expired} expiradas e ${desktopLicenses.data.expiringSoon} expirando` : 'Monitoramento central de licencas',
    },
  ];
}

export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  const [documentos, recebimentos, inventarios, mobile, rir, rnc, desktopLicenses] = await Promise.all([
    collectAllPages((page, pageSize) => listarDocumentos({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarInventarios({ busca: '', status: 'todos', page, pageSize })),
    getMobileDeviceIndicators(),
    collectAllPages((page, pageSize) => listarRir({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarRnc({ busca: '', status: 'todos', page, pageSize })),
    getDesktopLicenseRegistrySummary(),
  ]);

  const docsPendentes = documentos.filter((item) => item.status === 'pendente' || item.status === 'parcial').length;
  const recebimentosPendentes = recebimentos.filter((item) => item.status === 'aguardando_conferencia').length;
  const inventariosComDivergencia = inventarios.filter((item) => item.divergencias > 0 && item.status !== 'cancelado').length;
  const rirAbertos = rir.filter((item) => item.status !== 'tratado' && item.status !== 'cancelado').length;
  const rncAbertas = rnc.filter((item) => item.status !== 'concluido' && item.status !== 'cancelado').length;

  const alerts: DashboardAlert[] = [];

  if (docsPendentes > 0) {
    alerts.push({
      title: 'Planejamento com pendencias',
      detail: `${docsPendentes} documento(s) ainda precisam de atendimento total ou parcial.`,
    });
  }

  if (recebimentosPendentes > 0) {
    alerts.push({
      title: 'Recebimentos aguardando conferencia',
      detail: `${recebimentosPendentes} recebimento(s) seguem no fluxo de conferencia.`,
    });
  }

  if (inventariosComDivergencia > 0) {
    alerts.push({
      title: 'Inventario com divergencia',
      detail: `${inventariosComDivergencia} inventario(s) possuem diferenca entre saldo do sistema e contagem.`,
    });
  }

  if (mobile.pendentes > 0 || mobile.bloqueados > 0) {
    alerts.push({
      title: 'Mobile requer acompanhamento',
      detail: `${mobile.pendentes} pendente(s) e ${mobile.bloqueados} bloqueado(s) no painel de dispositivos.`,
    });
  }

  if (rirAbertos > 0 || rncAbertas > 0) {
    alerts.push({
      title: 'Qualidade com tratativas abertas',
      detail: `${rirAbertos} RIR e ${rncAbertas} RNC ainda exigem acompanhamento.`,
    });
  }

  if ((desktopLicenses.data?.expired ?? 0) > 0 || (desktopLicenses.data?.expiringSoon ?? 0) > 0) {
    alerts.push({
      title: 'Licencas desktop em risco',
      detail: `${desktopLicenses.data?.expired ?? 0} expiradas e ${desktopLicenses.data?.expiringSoon ?? 0} expirando em ate 30 dias.`,
    });
  }

  if ((desktopLicenses.data?.missingMachineLabel ?? 0) > 0) {
    alerts.push({
      title: 'Licencas desktop sem identificacao completa',
      detail: `${desktopLicenses.data?.missingMachineLabel ?? 0} licenca(s) estao sem nome administrativo da maquina vinculada.`,
    });
  }

  if (!alerts.length) {
    alerts.push({
      title: 'Operacao estabilizada',
      detail: 'Os modulos principais estao sincronizados e os indicadores ja aparecem com dados reais.',
    });
  }

  return alerts;
}
