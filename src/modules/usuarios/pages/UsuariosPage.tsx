import { useState } from 'react';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { Select } from '../../../components/ui/Select';
import { useAuth } from '../../auth/hooks/useAuth';
import { AUTH_AUDIT_FILTER_OPTIONS } from '../../auth/services/authAuditLabels';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { UsuariosAuditTable } from '../components/UsuariosAuditTable';
import { UsuariosAuditNuvemTable } from '../components/UsuariosAuditNuvemTable';
import { UsuariosDomainEventsTable } from '../components/UsuariosDomainEventsTable';
import { UsuariosDomainEventsDailyStrip } from '../components/UsuariosDomainEventsDailyStrip';
import { UsuarioForm } from '../components/UsuarioForm';
import { UsuariosFilters } from '../components/UsuariosFilters';
import { UsuariosTable } from '../components/UsuariosTable';
import { useUsuarios } from '../hooks/useUsuarios';

type UsuariosTab = 'cadastro' | 'auditoria' | 'nuvem' | 'eventos';

export function UsuariosPage() {
  const { canAccessAction } = useAuth();
  const [tab, setTab] = useState<UsuariosTab>('cadastro');
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
    cloudAuditItems,
    cloudAuditTotal,
    cloudAuditLoading,
    cloudAuditError,
    refreshCloudAudit,
    domainEventsItems,
    domainEventsTotal,
    domainEventsLoading,
    domainEventsError,
    domainEventsDailyTotals,
    domainEventsDailyWindowDays,
    domainEventsDailyLoading,
    domainEventsDailyError,
    refreshDomainEvents,
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
  const cloudOk = hasSupabaseConfig();

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <h2>Usuarios e permissoes</h2>
          {tab === 'cadastro' ? (
            <p className="panel-copy" style={{ marginTop: 4 }}>
              {total.toLocaleString('pt-BR')} utilizador(es) · {profiles.length} perfil(is)
            </p>
          ) : null}
        </div>
        <div className="panel-toolbar">
          {tab === 'cadastro' && canEdit ? (
            <div className="panel-toolbar__group" role="group" aria-label="Cadastro">
              <span className="panel-toolbar__label">Cadastro</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={openCreateModal}>Novo usuario</Button>
              </div>
            </div>
          ) : null}
          {tab === 'auditoria' ? (
            <div className="panel-toolbar__group" role="group" aria-label="Exportar auditoria">
              <span className="panel-toolbar__label">Exportar</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={exportAudit} variant="ghost">
                  Exportar CSV
                </Button>
              </div>
            </div>
          ) : null}
          {tab === 'nuvem' && cloudOk ? (
            <div className="panel-toolbar__group" role="group" aria-label="Auditoria nuvem">
              <div className="panel-toolbar__buttons">
                <Button onClick={() => void refreshCloudAudit()}>Atualizar</Button>
              </div>
            </div>
          ) : null}
          {tab === 'eventos' && cloudOk ? (
            <div className="panel-toolbar__group" role="group" aria-label="Eventos dominio">
              <div className="panel-toolbar__buttons">
                <Button onClick={() => void refreshDomainEvents()}>Atualizar</Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Cadastro de acessos, auditoria deste PC, auditoria na nuvem e eventos de dominio (P2). Use as abas para
          trabalhar uma zona de cada vez.
        </p>
      </ModuleHelp>

      <div className="panel-tabs" role="tablist" aria-label="Secoes de usuarios">
        <button
          aria-selected={tab === 'cadastro'}
          className={`panel-tab${tab === 'cadastro' ? ' panel-tab--active' : ''}`}
          onClick={() => setTab('cadastro')}
          role="tab"
          type="button"
        >
          Cadastro
        </button>
        <button
          aria-selected={tab === 'auditoria'}
          className={`panel-tab${tab === 'auditoria' ? ' panel-tab--active' : ''}`}
          onClick={() => setTab('auditoria')}
          role="tab"
          type="button"
        >
          Auditoria deste PC
        </button>
        <button
          aria-selected={tab === 'nuvem'}
          className={`panel-tab${tab === 'nuvem' ? ' panel-tab--active' : ''}`}
          onClick={() => setTab('nuvem')}
          role="tab"
          type="button"
        >
          Auditoria nuvem
        </button>
        <button
          aria-selected={tab === 'eventos'}
          className={`panel-tab${tab === 'eventos' ? ' panel-tab--active' : ''}`}
          onClick={() => setTab('eventos')}
          role="tab"
          type="button"
        >
          Eventos de dominio
        </button>
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice tone="success">{success}</OperationalNotice> : null}

      {tab === 'cadastro' ? (
        <>
          <UsuariosFilters filters={filters} onChange={setFilters} profiles={profiles} />

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
              <Pagination
                itemLabel="usuários"
                onPageChange={(page) => setFilters({ ...filters, page })}
                page={filters.page}
                pageSize={filters.pageSize}
                total={total}
              />
            </>
          )}

          {!canEdit && !canAdminister ? (
            <OperationalNotice>
              Seu perfil pode visualizar usuarios, mas nao pode alterar cadastro ou status.
            </OperationalNotice>
          ) : null}
        </>
      ) : null}

      {tab === 'auditoria' ? (
        <div className="section-block">
          <p className="panel-copy" style={{ marginBottom: 12 }}>
            Eventos criticos gravados neste posto (local). Filtre por quem, tipo ou periodo.
          </p>
          <div className="form-columns">
            <Input
              label="Quem"
              onChange={(event) => setAuditActorFilter(event.target.value)}
              placeholder="Login, maquina…"
              value={auditActorFilter}
            />
            <Select
              label="Tipo de evento"
              onChange={(event) => setAuditTypeFilter(event.target.value as typeof auditTypeFilter)}
              value={auditTypeFilter}
            >
              <option value="todos">Todos</option>
              {AUTH_AUDIT_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Select
              label="Periodo"
              onChange={(event) => setAuditPeriodFilter(event.target.value as typeof auditPeriodFilter)}
              value={auditPeriodFilter}
            >
              <option value="todos">Todo o periodo</option>
              <option value="24h">Ultimas 24 horas</option>
              <option value="7d">Ultimos 7 dias</option>
              <option value="30d">Ultimos 30 dias</option>
            </Select>
          </div>
          <UsuariosAuditTable items={auditItems} />
        </div>
      ) : null}

      {tab === 'nuvem' ? (
        cloudOk ? (
          <div className="section-block">
            <p className="panel-copy" style={{ marginBottom: 12 }}>
              Quem fez o que, de que IP/dispositivo — exclusoes, conferencias e atendimentos. Visivel em qualquer PC
              da empresa.
            </p>
            <UsuariosAuditNuvemTable
              error={cloudAuditError}
              items={cloudAuditItems}
              loading={cloudAuditLoading}
              total={cloudAuditTotal}
            />
          </div>
        ) : (
          <OperationalNotice>Nuvem nao configurada neste posto — auditoria remota indisponivel.</OperationalNotice>
        )
      ) : null}

      {tab === 'eventos' ? (
        cloudOk ? (
          <div className="section-block">
            <p className="panel-copy" style={{ marginBottom: 12 }}>
              Log append-only (P2) espelhado da auditoria critica. Sem payload — so tipo, entidade e actor.
            </p>
            <UsuariosDomainEventsDailyStrip
              error={domainEventsDailyError}
              loading={domainEventsDailyLoading}
              totals={domainEventsDailyTotals}
              windowDays={domainEventsDailyWindowDays}
            />
            <UsuariosDomainEventsTable
              error={domainEventsError}
              items={domainEventsItems}
              loading={domainEventsLoading}
              total={domainEventsTotal}
            />
          </div>
        ) : (
          <OperationalNotice>Nuvem nao configurada — eventos de dominio indisponiveis.</OperationalNotice>
        )
      ) : null}

      <Modal
        browserFullscreen
        onClose={closeModal}
        open={isModalOpen && canEdit}
        title={selected ? 'Editar usuario' : 'Novo usuario'}
        wide
      >
        <UsuarioForm
          canAdminister={canAdminister}
          enableSupabaseAuthLink={cloudOk && Boolean(selected)}
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
