import { getDesktopLicenseRegistrySummary } from '../../configuracoes/services/desktopLicenseRegistry.service';
import { collectAllPages } from '../../../lib/collectAllPages';
import { getMobileDeviceIndicators } from '../../mobile/services/mobileDevices.service';
import { listarMateriais } from '../../materiais/services/materiais.service';
import { listarDocumentos } from '../../documentos/services/documentos.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import { listarInventarios } from '../../inventario/services/inventario.service';
import { listarRir, listarRnc } from '../../qualidade/services/qualidade.service';
import type { RelatorioIndicador, RelatorioResumo } from '../types/relatorio.types';

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

  return [
    {
      id: 'rel-1',
      titulo: 'Materiais monitorados',
      valor: String(materiais.data?.total ?? 0),
      descricao: 'Cadastro de materiais com leitura resumida e integracao ao banco.',
    },
    {
      id: 'rel-2',
      titulo: 'Dispositivos mobile',
      valor: String(mobile.total),
      descricao: 'Vinculo, bloqueio, desbloqueio e revogacao validados com Supabase.',
    },
    {
      id: 'rel-3',
      titulo: 'Qualidade',
      valor: `${rir.data?.total ?? 0} / ${rnc.data?.total ?? 0}`,
      descricao: 'RIR e RNC ativos no painel de qualidade.',
    },
    {
      id: 'rel-4',
      titulo: 'Planejamento pendente',
      valor: String(documentos.data?.total ?? 0),
      descricao: 'Base total monitorada de documentos no planejamento.',
    },
    {
      id: 'rel-5',
      titulo: 'Recebimentos monitorados',
      valor: String(recebimentos.data?.total ?? 0),
      descricao: 'Base total monitorada do fluxo de recebimentos.',
    },
    {
      id: 'rel-6',
      titulo: 'Licencas desktop em risco',
      valor: `${licencasDesktop.data?.expired ?? 0} / ${licencasDesktop.data?.expiringSoon ?? 0}`,
      descricao: 'Licencas expiradas e expirando em ate 30 dias.',
    },
  ];
}

export async function listarResumosRelatorios(): Promise<RelatorioResumo[]> {
  const [documentos, recebimentos, inventarios, mobile, rir, rnc, licencasDesktop] = await Promise.all([
    collectAllPages((page, pageSize) => listarDocumentos({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarInventarios({ busca: '', status: 'todos', page, pageSize })),
    getMobileDeviceIndicators(),
    collectAllPages((page, pageSize) => listarRir({ busca: '', status: 'todos', page, pageSize })),
    collectAllPages((page, pageSize) => listarRnc({ busca: '', status: 'todos', page, pageSize })),
    getDesktopLicenseRegistrySummary(),
  ]);

  const documentosPendentes = documentos.filter((item) => item.status === 'pendente' || item.status === 'parcial').length;
  const recebimentosAguardando = recebimentos.filter((item) => item.status === 'aguardando_conferencia').length;
  const inventariosAbertos = inventarios.filter((item) => item.status === 'aberto').length;
  const rirAbertos = rir.filter((item) => item.status !== 'tratado' && item.status !== 'cancelado').length;
  const rncAbertas = rnc.filter((item) => item.status !== 'concluido' && item.status !== 'cancelado').length;
  const atualizadoEm = new Date().toLocaleString('pt-BR');

  return [
    {
      id: 'res-1',
      categoria: 'estoque',
      titulo: 'Resumo de estoque e inventario',
      detalhe: `${inventariosAbertos} inventario(s) em aberto para consolidar divergencias e ajustes.`,
      atualizadoEm,
    },
    {
      id: 'res-2',
      categoria: 'planejamento',
      titulo: 'Resumo do planejamento',
      detalhe: `${documentosPendentes} documento(s) pendentes ou parciais no planejamento.`,
      atualizadoEm,
    },
    {
      id: 'res-3',
      categoria: 'recebimento',
      titulo: 'Resumo de recebimentos',
      detalhe: `${recebimentosAguardando} recebimento(s) aguardando conferencia no fluxo atual.`,
      atualizadoEm,
    },
    {
      id: 'res-4',
      categoria: 'qualidade',
      titulo: 'Resumo da qualidade',
      detalhe: `${rirAbertos} RIR e ${rncAbertas} RNC ainda exigem acompanhamento.`,
      atualizadoEm,
    },
    {
      id: 'res-5',
      categoria: 'mobile',
      titulo: 'Resumo do mobile',
      detalhe: `${mobile.autorizados} autorizados, ${mobile.pendentes} pendentes e ${mobile.bloqueados} bloqueados.`,
      atualizadoEm,
    },
    {
      id: 'res-6',
      categoria: 'seguranca',
      titulo: 'Resumo da blindagem desktop',
      detalhe: `${licencasDesktop.data?.expired ?? 0} licenca(s) expiradas, ${licencasDesktop.data?.expiringSoon ?? 0} expirando e ${licencasDesktop.data?.missingMachineLabel ?? 0} sem nome administrativo da maquina.`,
      atualizadoEm,
    },
  ];
}
