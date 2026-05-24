import { Suspense } from 'react';
import { Navigate, createHashRouter } from 'react-router-dom';
import { OperationalNotice } from '@/components/ui/OperationalNotice';
import { AuthLayout } from '@/layouts/AuthLayout';
import { MainLayout } from '@/layouts/MainLayout';
import { DefaultModuleRedirect } from './DefaultModuleRedirect';
import { ModuleAccessRoute } from './ModuleAccessRoute';
import { NoAccessPage } from './NoAccessPage';
import { ProtectedRoute } from './ProtectedRoute';
import {
  AtendimentoPage,
  ConferenciaPage,
  ConfiguracoesPage,
  ColaboradoresPage,
  DashboardPage,
  DesktopLicensesPage,
  DocumentosPage,
  EtiquetasPage,
  EquipamentosPage,
  FornecedoresPage,
  InventarioPage,
  LoginPage,
  MateriaisPage,
  MobileDevicesPage,
  RecebimentosPage,
  RelatoriosPage,
  RelatorioFotograficoListPage,
  RelatorioFotograficoPage,
  RelatorioFinalObraPage,
  RirPage,
  RncPage,
  UsuariosPage,
} from './lazyPages';

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<OperationalNotice>Carregando modulo...</OperationalNotice>}>{element}</Suspense>;
}

export const router = createHashRouter([
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: withSuspense(<LoginPage />) },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { path: '/', element: withSuspense(<DefaultModuleRedirect />) },
          { path: '/dashboard', element: withSuspense(<ModuleAccessRoute modulo="dashboard"><DashboardPage /></ModuleAccessRoute>) },
          { path: '/fornecedores', element: withSuspense(<ModuleAccessRoute modulo="fornecedores"><FornecedoresPage /></ModuleAccessRoute>) },
          { path: '/colaboradores', element: withSuspense(<ModuleAccessRoute modulo="colaboradores"><ColaboradoresPage /></ModuleAccessRoute>) },
          { path: '/materiais', element: withSuspense(<ModuleAccessRoute modulo="materiais"><MateriaisPage /></ModuleAccessRoute>) },
          { path: '/documentos', element: withSuspense(<ModuleAccessRoute modulo="documentos"><DocumentosPage /></ModuleAccessRoute>) },
          { path: '/recebimentos', element: withSuspense(<ModuleAccessRoute modulo="recebimentos"><RecebimentosPage /></ModuleAccessRoute>) },
          { path: '/conferencia', element: withSuspense(<ModuleAccessRoute modulo="conferencia"><ConferenciaPage /></ModuleAccessRoute>) },
          { path: '/etiquetas', element: withSuspense(<ModuleAccessRoute modulo="etiquetas"><EtiquetasPage /></ModuleAccessRoute>) },
          { path: '/configuracoes', element: withSuspense(<ModuleAccessRoute modulo="configuracoes"><ConfiguracoesPage /></ModuleAccessRoute>) },
          { path: '/atendimento', element: withSuspense(<ModuleAccessRoute modulo="atendimento"><AtendimentoPage /></ModuleAccessRoute>) },
          { path: '/inventario', element: withSuspense(<ModuleAccessRoute modulo="inventario"><InventarioPage /></ModuleAccessRoute>) },
          { path: '/equipamentos', element: withSuspense(<ModuleAccessRoute modulo="equipamentos"><EquipamentosPage /></ModuleAccessRoute>) },
          { path: '/rir', element: withSuspense(<ModuleAccessRoute modulo="rir"><RirPage /></ModuleAccessRoute>) },
          { path: '/rnc', element: withSuspense(<ModuleAccessRoute modulo="rnc"><RncPage /></ModuleAccessRoute>) },
          { path: '/relatorios', element: withSuspense(<ModuleAccessRoute modulo="relatorios"><RelatoriosPage /></ModuleAccessRoute>) },
          {
            path: '/relatorios/final-obra',
            element: withSuspense(
              <ModuleAccessRoute modulo="relatorios">
                <RelatorioFinalObraPage />
              </ModuleAccessRoute>,
            ),
          },
          { path: '/relatorio-final-obra', element: <Navigate replace to="/relatorios/final-obra" /> },
          {
            path: '/relatorio-fotografico',
            element: withSuspense(
              <ModuleAccessRoute modulo="relatorios">
                <RelatorioFotograficoListPage />
              </ModuleAccessRoute>,
            ),
          },
          {
            path: '/relatorio-fotografico/editar/:reportId',
            element: withSuspense(
              <ModuleAccessRoute modulo="relatorios">
                <RelatorioFotograficoPage />
              </ModuleAccessRoute>,
            ),
          },
          { path: '/mobile', element: withSuspense(<ModuleAccessRoute modulo="mobile"><MobileDevicesPage /></ModuleAccessRoute>) },
          { path: '/usuarios', element: withSuspense(<ModuleAccessRoute modulo="usuarios"><UsuariosPage /></ModuleAccessRoute>) },
          { path: '/licencas-desktop', element: withSuspense(<ModuleAccessRoute modulo="configuracoes"><DesktopLicensesPage /></ModuleAccessRoute>) },
          { path: '/sem-acesso', element: withSuspense(<NoAccessPage />) },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate replace to="/" /> },
]);
