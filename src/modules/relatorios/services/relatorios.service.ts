import { collectAllPages } from '../../../lib/collectAllPages';
import { fetchOperacaoContagens } from '../../../lib/operacaoEscalaContagens';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { getDesktopLicenseRegistrySummary } from '../../configuracoes/services/desktopLicenseRegistry.service';
import { listarDocumentos } from '../../documentos/services/documentos.service';
import { listarInventarios } from '../../inventario/services/inventario.service';
import { getMobileDeviceIndicators } from '../../mobile/services/mobileDevices.service';
import { listarMateriais } from '../../materiais/services/materiais.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import { listarRir, listarRnc } from '../../qualidade/services/qualidade.service';
import type { RelatorioIndicador, RelatorioResumo } from '../types/relatorio.types';
import { tomPorContagem } from '../utils/relatorioOverview';

export async function listarIndicadoresRelatorios(): Promise<RelatorioIndicador[]> {
  const [materiais, mobile, rir, rnc, documentos, recebimentos, licencasDesktop] = await Promise.all([
    listarMateriais({ busca: '', disciplina: '', ativo: 'todos', page: 1, pageSize: 1 }),
    getMobileDeviceIndicators(),
    listarRir({ busca: '', status: 'todos', page: 1, pageSize: 1 }),
    listarRnc({ busca: '', status: 'todos', page: 1, pageSize: 1 }),
    listarDocumentos({ busca: '', status: 'todos', page: 1, pageSize: 1 }),
    listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page: 1, pageSize: 1 }),
    getDesktopLicenseRegistrySummary(),
  ]);

  const expired = licencasDesktop.data?.expired ?? 0;
  const expiring = licencasDesktop.data?.expiringSoon ?? 0;
  const licRisco = expired + expiring;

  return [
    {
      id: 'rel-1',
      titulo: 'Materiais',
      valor: String(materiais.data?.total ?? 0),
      descricao: 'Cadastro activo com integração à nuvem.',
      href: '/materiais',
      tom: 'neutral',
    },
    {
      id: 'rel-2',
      titulo: 'Dispositivos mobile',
      valor: String(mobile.total),
      descricao: 'Autorizados, pendentes e bloqueados.',
      href: '/mobile',
      tom: tomPorContagem(mobile.pendentes + mobile.bloqueados),
    },
    {
      id: 'rel-3',
      titulo: 'Qualidade (RIR / RNC)',
      valor: `${rir.data?.total ?? 0} / ${rnc.data?.total ?? 0}`,
      descricao: 'Registos no painel de qualidade.',
      href: '/rir',
      tom: 'neutral',
    },
    {
      id: 'rel-4',
      titulo: 'Documentos',
      valor: String(documentos.data?.total ?? 0),
      descricao: 'Base total no planejamento.',
      href: '/documentos',
      tom: 'neutral',
    },
    {
      id: 'rel-5',
      titulo: 'Recebimentos',
      valor: String(recebimentos.data?.total ?? 0),
      descricao: 'Notas e conferências monitoradas.',
      href: '/recebimentos',
      tom: 'neutral',
    },
    {
      id: 'rel-6',
      titulo: 'Licenças desktop em risco',
      valor: `${expired} / ${expiring}`,
      descricao: 'Expiradas / a expirar em até 30 dias.',
      href: '/configuracoes',
      tom: tomPorContagem(licRisco, { dangerAt: 1 }),
    },
  ];
}

/** Contagens da «Situação operacional» — na nuvem usa 1 RPC leve; sem Supabase cai no fallback local. */
async function obterContagensSituacaoOperacional(): Promise<{
  documentosPendentes: number;
  recebimentosAguardando: number;
  inventariosAbertos: number;
  rirAbertos: number;
  rncAbertas: number;
}> {
  if (hasSupabaseConfig()) {
    const c = await fetchOperacaoContagens();
    return {
      documentosPendentes: c.docsPendentes,
      recebimentosAguardando: c.recebimentosAguardando,
      inventariosAbertos: c.inventariosAbertos,
      rirAbertos: c.rirAbertos,
      rncAbertas: c.rncAbertas,
    };
  }

  const [documentos, recebimentos, inventarios, rir, rnc] = await Promise.all([
    collectAllPages((page, pageSize) => listarDocumentos({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) =>
      listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize }),
    ),
    collectAllPages((page, pageSize) => listarInventarios({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarRir({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarRnc({ busca: '', status: 'todos', page, pageSize })),
  ]);

  return {
    documentosPendentes: documentos.filter((item) => item.status === 'pendente' || item.status === 'parcial').length,
    recebimentosAguardando: recebimentos.filter((item) => item.status === 'aguardando_conferencia').length,
    inventariosAbertos: inventarios.filter((item) => item.status === 'aberto').length,
    rirAbertos: rir.filter((item) => item.status !== 'tratado' && item.status !== 'cancelado').length,
    rncAbertas: rnc.filter((item) => item.status !== 'concluido' && item.status !== 'cancelado').length,
  };
}

export async function listarResumosRelatorios(): Promise<RelatorioResumo[]> {
  const [contagens, mobile, licencasDesktop] = await Promise.all([
    obterContagensSituacaoOperacional(),
    getMobileDeviceIndicators(),
    getDesktopLicenseRegistrySummary(),
  ]);

  const {
    documentosPendentes,
    recebimentosAguardando,
    inventariosAbertos,
    rirAbertos,
    rncAbertas,
  } = contagens;
  const expired = licencasDesktop.data?.expired ?? 0;
  const expiring = licencasDesktop.data?.expiringSoon ?? 0;
  const missingLabel = licencasDesktop.data?.missingMachineLabel ?? 0;
  const atualizadoEm = new Date().toLocaleString('pt-BR');

  return [
    {
      id: 'res-1',
      categoria: 'estoque',
      titulo: 'Inventários em aberto',
      detalhe: `${inventariosAbertos} inventário(s) em aberto para consolidar divergências e ajustes.`,
      valorDestaque: String(inventariosAbertos),
      href: '/inventario',
      tom: tomPorContagem(inventariosAbertos),
      atualizadoEm,
    },
    {
      id: 'res-2',
      categoria: 'planejamento',
      titulo: 'Pendentes ou parciais',
      detalhe: `${documentosPendentes} documento(s) pendentes ou parciais no planejamento.`,
      valorDestaque: String(documentosPendentes),
      href: '/documentos',
      tom: tomPorContagem(documentosPendentes),
      atualizadoEm,
    },
    {
      id: 'res-3',
      categoria: 'recebimento',
      titulo: 'Aguardando conferência',
      detalhe: `${recebimentosAguardando} recebimento(s) aguardando conferência no fluxo actual.`,
      valorDestaque: String(recebimentosAguardando),
      href: '/recebimentos',
      tom: tomPorContagem(recebimentosAguardando),
      atualizadoEm,
    },
    {
      id: 'res-4',
      categoria: 'qualidade',
      titulo: 'RIR / RNC em acompanhamento',
      detalhe: `${rirAbertos} RIR e ${rncAbertas} RNC ainda exigem acompanhamento.`,
      valorDestaque: `${rirAbertos} / ${rncAbertas}`,
      href: '/rir',
      tom: tomPorContagem(rirAbertos + rncAbertas),
      atualizadoEm,
    },
    {
      id: 'res-5',
      categoria: 'mobile',
      titulo: 'Frota de dispositivos',
      detalhe: `${mobile.autorizados} autorizados, ${mobile.pendentes} pendentes e ${mobile.bloqueados} bloqueados.`,
      valorDestaque: String(mobile.total),
      href: '/mobile',
      tom: tomPorContagem(mobile.pendentes + mobile.bloqueados),
      atualizadoEm,
    },
    {
      id: 'res-6',
      categoria: 'seguranca',
      titulo: 'Blindagem desktop',
      detalhe: `${expired} licença(s) expiradas, ${expiring} a expirar e ${missingLabel} sem nome administrativo da máquina.`,
      valorDestaque: String(expired + expiring + missingLabel),
      href: '/configuracoes',
      tom: tomPorContagem(expired + expiring + missingLabel, { dangerAt: 1 }),
      atualizadoEm,
    },
  ];
}
