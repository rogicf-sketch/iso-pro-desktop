import { lazy } from 'react';

export const LoginPage = lazy(() => import('@/modules/auth/pages/LoginPage').then((module) => ({ default: module.LoginPage })));
export const DashboardPage = lazy(() =>
  import('@/modules/dashboard/pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
export const FornecedoresPage = lazy(() =>
  import('@/modules/fornecedores/pages/FornecedoresPage').then((module) => ({ default: module.FornecedoresPage })),
);
export const ColaboradoresPage = lazy(() =>
  import('@/modules/colaboradores/pages/ColaboradoresPage').then((module) => ({ default: module.ColaboradoresPage })),
);
export const MateriaisPage = lazy(() =>
  import('@/modules/materiais/pages/MateriaisPage').then((module) => ({ default: module.MateriaisPage })),
);
export const DocumentosPage = lazy(() =>
  import('@/modules/documentos/pages/DocumentosPage').then((module) => ({ default: module.DocumentosPage })),
);
export const RecebimentosPage = lazy(() =>
  import('@/modules/recebimentos/pages/RecebimentosPage').then((module) => ({ default: module.RecebimentosPage })),
);
export const ConferenciaPage = lazy(() =>
  import('@/modules/conferencia/pages/ConferenciaPage').then((module) => ({ default: module.ConferenciaPage })),
);
export const EtiquetasPage = lazy(() =>
  import('@/modules/etiquetas/pages/EtiquetasPage').then((module) => ({ default: module.EtiquetasPage })),
);
export const EquipamentosPage = lazy(() =>
  import('@/modules/equipamentos/pages/EquipamentosPage').then((module) => ({ default: module.EquipamentosPage })),
);
export const ConfiguracoesPage = lazy(() =>
  import('@/modules/configuracoes/pages/ConfiguracoesPage').then((module) => ({ default: module.ConfiguracoesPage })),
);
export const DesktopLicensesPage = lazy(() =>
  import('@/modules/configuracoes/pages/DesktopLicensesPage').then((module) => ({ default: module.DesktopLicensesPage })),
);
export const AtendimentoPage = lazy(() =>
  import('@/modules/atendimento/pages/AtendimentoPage').then((module) => ({ default: module.AtendimentoPage })),
);
export const InventarioPage = lazy(() =>
  import('@/modules/inventario/pages/InventarioPage').then((module) => ({ default: module.InventarioPage })),
);
export const RirPage = lazy(() =>
  import('@/modules/qualidade/pages/RirPage').then((module) => ({ default: module.RirPage })),
);
export const RncPage = lazy(() =>
  import('@/modules/qualidade/pages/RncPage').then((module) => ({ default: module.RncPage })),
);
export const RelatoriosPage = lazy(() =>
  import('@/modules/relatorios/pages/RelatoriosPage').then((module) => ({ default: module.RelatoriosPage })),
);
export const RelatorioFotograficoListPage = lazy(() =>
  import('@/modules/relatorios/pages/RelatorioFotograficoListPage').then((module) => ({ default: module.RelatorioFotograficoListPage })),
);
export const RelatorioFotograficoPage = lazy(() =>
  import('@/modules/relatorios/pages/RelatorioFotograficoPage').then((module) => ({ default: module.RelatorioFotograficoPage })),
);
export const MobileDevicesPage = lazy(() =>
  import('@/modules/mobile/pages/MobileDevicesPage').then((module) => ({ default: module.MobileDevicesPage })),
);
export const UsuariosPage = lazy(() =>
  import('@/modules/usuarios/pages/UsuariosPage').then((module) => ({ default: module.UsuariosPage })),
);
