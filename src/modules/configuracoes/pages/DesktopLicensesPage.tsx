import { Button } from '../../../components/ui/Button';
import { Pagination } from '../../../components/tables/Pagination';
import { Input } from '../../../components/ui/Input';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { Select } from '../../../components/ui/Select';
import { useAuth } from '../../auth/hooks/useAuth';
import { DesktopLicenseIssuePanel } from '../components/DesktopLicenseIssuePanel';
import { DesktopLicensesTable } from '../components/DesktopLicensesTable';
import { useDesktopLicenses } from '../hooks/useDesktopLicenses';

export function DesktopLicensesPage() {
  const { canAccessAction } = useAuth();
  const {
    items,
    filteredItems,
    paginatedItems,
    loading,
    error,
    success,
    syncSource,
    syncWarning,
    riskIndicators,
    statusFilter,
    periodFilter,
    tenantFilter,
    searchTerm,
    page,
    pageSize,
    superAdmin,
    privateKeyConfigured,
    tenants,
    capabilitiesHint,
    actorLogin,
    actorSenha,
    onDefaultTenant,
    setStatusFilter,
    setPeriodFilter,
    setTenantFilter,
    setSearchTerm,
    setPage,
    reload,
    exportLicenses,
    handleRevoke,
    handleRestore,
  } = useDesktopLicenses();
  const canAdminister = canAccessAction('configuracoes', 'administrar');

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Blindagem Desktop</p>
          <h2>Licencas desktop</h2>
        </div>
        <div className="panel-toolbar">
          <div className="panel-toolbar__group" role="group" aria-label="Lista de licencas">
            <span className="panel-toolbar__label">Lista</span>
            <div className="panel-toolbar__buttons">
              <Button onClick={exportLicenses} variant="ghost">
                Exportar CSV
              </Button>
              <Button onClick={() => void reload()} variant="ghost">
                Atualizar lista
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Painel central para acompanhar licencas emitidas, status remoto, maquina vinculada e acoes administrativas de
          revogacao ou reativacao.
          {superAdmin
            ? ' Modo super-admin activo: podes emitir e gerir licencas de todas as empresas a partir da organizacao principal.'
            : ''}
        </p>
      </ModuleHelp>

      <OperationalNotice>{`Fonte atual: ${syncSource === 'supabase' ? 'Supabase' : 'fallback local'}.${syncWarning ? ` Aviso: ${syncWarning}` : ''}`}</OperationalNotice>
      {superAdmin ? (
        <OperationalNotice tone="success">
          Super-admin de plataforma activo. Lista unificada de licencas; usa «Empresa destino» ao emitir.
        </OperationalNotice>
      ) : null}
      {onDefaultTenant && canAdminister && !superAdmin && capabilitiesHint ? (
        <OperationalNotice tone="warning">
          Super-admin indisponivel nesta sessao: {capabilitiesHint}. Confirma a migracao{' '}
          <code>plataforma_super_admin</code>, o segredo ISO_PRO_ADMIN_USER_SECRET e que entraste na organizacao
          principal.
        </OperationalNotice>
      ) : null}
      {canAdminister ? (
        <ModuleHelp>
          <OperationalNotice tone="warning">
            Regra de seguranca: revogar uma licenca centralmente deve ser usado quando um equipamento sair da operacao ou
            perder autorizacao de uso.
          </OperationalNotice>
        </ModuleHelp>
      ) : null}
      {riskIndicators.expired ? (
        <OperationalNotice tone="critical">{`Risco: ${riskIndicators.expired} licenca(s) desktop ja estao expiradas no registro central.`}</OperationalNotice>
      ) : null}
      {riskIndicators.expiringSoon ? (
        <OperationalNotice tone="warning">{`Atencao: ${riskIndicators.expiringSoon} licenca(s) desktop expiram em ate 30 dias.`}</OperationalNotice>
      ) : null}
      {riskIndicators.missingMachineLabel ? (
        <OperationalNotice tone="warning">{`Governanca: ${riskIndicators.missingMachineLabel} licenca(s) estao sem nome administrativo da maquina.`}</OperationalNotice>
      ) : null}

      {superAdmin && actorLogin ? (
        <DesktopLicenseIssuePanel
          actorLogin={actorLogin}
          actorSenha={actorSenha}
          onIssued={() => void reload()}
          privateKeyConfigured={privateKeyConfigured}
          tenants={tenants}
        />
      ) : null}

      <div className="form-columns">
        <Input
          label="Buscar por titular, maquina ou licenca"
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Ex.: cliente, pc-almox, license id"
          value={searchTerm}
        />
        {superAdmin ? (
          <Select label="Empresa" onChange={(event) => setTenantFilter(event.target.value)} value={tenantFilter}>
            <option value="todos">Todas as empresas</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          label="Status"
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          value={statusFilter}
        >
          <option value="todos">Todos</option>
          <option value="active">Ativas</option>
          <option value="revoked">Revogadas</option>
        </Select>
        <Select
          label="Periodo"
          onChange={(event) => setPeriodFilter(event.target.value as typeof periodFilter)}
          value={periodFilter}
        >
          <option value="todos">Todo o periodo</option>
          <option value="30d">Emitidas nos ultimos 30 dias</option>
          <option value="90d">Emitidas nos ultimos 90 dias</option>
          <option value="expirando">Expirando em ate 30 dias</option>
        </Select>
      </div>

      <div className="cards-grid">
        <div className="metric-card">
          <span className="metric-label">Total emitidas</span>
          <strong>{items.length}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Ativas</span>
          <strong>{items.filter((item) => item.status === 'active').length}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Revogadas</span>
          <strong>{items.filter((item) => item.status === 'revoked').length}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Expiradas / expirando</span>
          <strong>
            {riskIndicators.expired} / {riskIndicators.expiringSoon}
          </strong>
        </div>
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice tone="success">{success}</OperationalNotice> : null}

      {loading ? (
        <OperationalNotice>Carregando licencas desktop...</OperationalNotice>
      ) : (
        <>
          <DesktopLicensesTable
            canAdminister={canAdminister}
            items={paginatedItems}
            onRestore={handleRestore}
            onRevoke={handleRevoke}
            showTenant={superAdmin}
          />
          <Pagination
            itemLabel="licenças"
            onPageChange={setPage}
            page={page}
            pageSize={pageSize}
            total={filteredItems.length}
          />
        </>
      )}

      {!canAdminister ? (
        <OperationalNotice>
          Seu perfil pode consultar licencas desktop, mas nao pode revogar nem reativar.
        </OperationalNotice>
      ) : null}
    </div>
  );
}
