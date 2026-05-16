import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { Select } from '../../../components/ui/Select';
import { useAuth } from '../../auth/hooks/useAuth';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { UsuariosAuditTable } from '../components/UsuariosAuditTable';
import { UsuarioForm } from '../components/UsuarioForm';
import { UsuariosFilters } from '../components/UsuariosFilters';
import { UsuariosTable } from '../components/UsuariosTable';
import { useUsuarios } from '../hooks/useUsuarios';

export function UsuariosPage() {
  const { canAccessAction } = useAuth();
  const {
    items,
    profiles,
    total,
    filters,
    loading,
    error,
    success,
    auditItems,
    auditActorFilter,
    auditTypeFilter,
    auditPeriodFilter,
    isModalOpen,
    selected,
    formInitialValue,
    setFilters,
    setAuditActorFilter,
    setAuditTypeFilter,
    setAuditPeriodFilter,
    exportAudit,
    openCreateModal,
    openEditModal,
    closeModal,
    submitUsuario,
    handleToggleStatus,
    refreshSelectedUsuarioForm,
    usuarioFormInstance,
  } = useUsuarios();
  const canEdit = canAccessAction('usuarios', 'editar');
  const canAdminister = canAccessAction('usuarios', 'administrar');

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Modulo</p>
          <h2>Usuarios e permissoes</h2>
        </div>
        {canEdit ? (
          <div className="panel-toolbar">
            <div className="panel-toolbar__group" role="group" aria-label="Cadastro">
              <span className="panel-toolbar__label">Cadastro</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={openCreateModal}>Novo usuario</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Painel administrativo para controlar acessos do desktop por perfil, ativar ou desativar usuarios e preparar a governanca do sistema.
        </p>
      </ModuleHelp>

      <UsuariosFilters filters={filters} onChange={setFilters} profiles={profiles} />

      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice>{success}</OperationalNotice> : null}

      {loading ? (
        <OperationalNotice>Carregando usuarios...</OperationalNotice>
      ) : (
        <>
          <UsuariosTable
            canAdminister={canAdminister}
            canEdit={canEdit}
            items={items}
            onEdit={openEditModal}
            onToggleStatus={handleToggleStatus}
          />
          <Pagination onPageChange={(page) => setFilters({ ...filters, page })} page={filters.page} pageSize={filters.pageSize} total={total} />
        </>
      )}

      {!canEdit && !canAdminister ? (
        <OperationalNotice>Seu perfil pode visualizar usuarios, mas nao pode alterar cadastro ou status.</OperationalNotice>
      ) : null}

      <div className="section-block">
        <div className="info-card">
          <strong>Perfis carregados</strong>
          <p className="panel-copy">{profiles.length} perfil(is) disponiveis para uso no desktop.</p>
        </div>
      </div>

      <div className="section-block">
        <div className="panel-header panel-header--toolbar">
          <div>
            <p className="panel-kicker">Auditoria</p>
            <h2>Eventos criticos recentes</h2>
          </div>
          <div className="panel-toolbar">
            <div className="panel-toolbar__group" role="group" aria-label="Exportar auditoria">
              <span className="panel-toolbar__label">Exportar</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={exportAudit} variant="ghost">
                  Exportar CSV
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="form-columns">
          <Input
            label="Filtrar por ator/alvo"
            onChange={(event) => setAuditActorFilter(event.target.value)}
            placeholder="Ex.: admin, operacao, maquina"
            value={auditActorFilter}
          />
          <Select label="Tipo de evento" onChange={(event) => setAuditTypeFilter(event.target.value as typeof auditTypeFilter)} value={auditTypeFilter}>
            <option value="todos">Todos</option>
            <option value="login_success">Login com sucesso</option>
            <option value="login_failure">Falha de login</option>
            <option value="logout">Logout</option>
            <option value="session_invalidated">Sessao invalidada</option>
            <option value="user_saved">Usuario salvo</option>
            <option value="user_status_changed">Status de usuario alterado</option>
            <option value="materiais_csv_imported">Import CSV materiais</option>
            <option value="materiais_excluidos_definitivamente">Materiais excluidos definitivamente</option>
            <option value="recebimento_excluido_definitivamente">Recebimento excluido definitivamente</option>
            <option value="recebimento_destravado_correcao">Recebimento destravado para correcao</option>
            <option value="recebimentos_excluidos_definitivamente">Recebimentos excluidos definitivamente (massa)</option>
            <option value="desktop_binding_enabled">Vinculo desktop ativado</option>
            <option value="desktop_binding_removed">Vinculo desktop removido</option>
            <option value="desktop_binding_blocked">Desktop bloqueado</option>
            <option value="desktop_license_revoked">Licenca desktop revogada</option>
            <option value="desktop_license_restored">Licenca desktop reativada</option>
            <option value="documento_cancelado">Documento cancelado</option>
            <option value="documento_excluido_definitivamente">Documento excluido definitivamente</option>
            <option value="documentos_excluidos_definitivamente">Documentos excluidos definitivamente (massa)</option>
          </Select>
          <Select label="Periodo" onChange={(event) => setAuditPeriodFilter(event.target.value as typeof auditPeriodFilter)} value={auditPeriodFilter}>
            <option value="todos">Todo o periodo</option>
            <option value="24h">Ultimas 24 horas</option>
            <option value="7d">Ultimos 7 dias</option>
            <option value="30d">Ultimos 30 dias</option>
          </Select>
        </div>
        <UsuariosAuditTable items={auditItems} />
      </div>

      <Modal onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar usuario' : 'Novo usuario'} wide>
        <UsuarioForm
          canAdminister={canAdminister}
          enableSupabaseAuthLink={hasSupabaseConfig() && Boolean(selected)}
          key={`${selected?.id ?? 'new'}-${usuarioFormInstance}`}
          initialValue={formInitialValue}
          onAuthLinkUpdated={refreshSelectedUsuarioForm}
          onCancel={closeModal}
          onSubmit={submitUsuario}
          profiles={profiles}
          remoteUsuarioId={selected?.id ?? null}
        />
      </Modal>
    </div>
  );
}
