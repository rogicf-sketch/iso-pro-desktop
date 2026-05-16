import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { EquipamentoFilters } from '../components/EquipamentoFilters';
import { EquipamentoForm } from '../components/EquipamentoForm';
import { EquipamentosTable } from '../components/EquipamentosTable';
import { useEquipamentos } from '../hooks/useEquipamentos';

export function EquipamentosPage() {
  const { canAccessAction } = useAuth();
  const cloudStatus = getSupabaseOperationalStatus();
  const {
    items,
    total,
    loading,
    indicadores,
    indicadoresLoading,
    error,
    success,
    fallbackReason,
    hasCloudConfig,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    setFilters,
    openCreateModal,
    openEditModal,
    closeModal,
    load,
    submitEquipamento,
    exportEquipamentosCsv,
    removerEquipamento,
  } = useEquipamentos();

  const canEdit = canAccessAction('equipamentos', 'editar');

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Módulo</p>
          <h2>Equipamentos</h2>
        </div>
        <div className="panel-toolbar">
          <div className="panel-toolbar__group" role="group" aria-label="Exportação">
            <span className="panel-toolbar__label">Dados</span>
            <div className="panel-toolbar__buttons">
              <Button
                onClick={() => void exportEquipamentosCsv()}
                title="Exporta os registros que correspondem aos filtros atuais (inclui todas as páginas)."
                variant="ghost"
              >
                Exportar CSV
              </Button>
            </div>
          </div>
          {canEdit ? (
            <div className="panel-toolbar__group" role="group" aria-label="Cadastro">
              <span className="panel-toolbar__label">Cadastro</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={openCreateModal}>Novo equipamento</Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Cadastro por número de frota (identificador interno da máquina), contrato, prazos, operador, placa e status no canteiro. Os indicadores
          refletem toda a base (não apenas a página atual). O CSV exportado respeita os filtros da listagem (não só a página exibida).
        </p>
      </ModuleHelp>

      <OperationalNotice>
        {cloudStatus === 'ready' && hasCloudConfig
          ? 'Fonte atual: Supabase. Equipamentos sincronizados com o snapshot na nuvem.'
          : cloudStatus === 'partial'
            ? 'Fonte atual: fallback local. Configuração do Supabase incompleta.'
            : 'Fonte atual: fallback local. Supabase ainda não está configurado.'}
      </OperationalNotice>
      {fallbackReason ? <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice> : null}

      {indicadoresLoading ? (
        <OperationalNotice>Carregando indicadores...</OperationalNotice>
      ) : indicadores ? (
        <div className="cards-grid">
          <article className="metric-card">
            <span className="metric-label">Total cadastrado</span>
            <strong>{indicadores.total}</strong>
            <p className="panel-copy">Equipamentos na base atual.</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Em operação</span>
            <strong>{indicadores.emOperacao}</strong>
            <p className="panel-copy">Status &quot;em operação&quot; no canteiro.</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Vence em 30 dias</span>
            <strong>{indicadores.proximosVencer30}</strong>
            <p className="panel-copy">Contratos com fim nos próximos 30 dias.</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">Contratos vencidos</span>
            <strong>{indicadores.contratosVencidos}</strong>
            <p className="panel-copy">Data de fim anterior a hoje.</p>
          </article>
        </div>
      ) : null}

      <EquipamentoFilters filters={filters} onChange={setFilters} />

      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice>{success}</OperationalNotice> : null}

      {loading ? (
        <OperationalNotice>Carregando equipamentos...</OperationalNotice>
      ) : (
        <>
          <EquipamentosTable canEdit={canEdit} items={items} onDelete={canEdit ? (item) => void removerEquipamento(item.id) : undefined} onEdit={openEditModal} />
          <Pagination
            onPageChange={(page) => setFilters({ ...filters, page })}
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
          />
        </>
      )}

      {!canEdit ? <OperationalNotice>Seu perfil pode visualizar equipamentos, mas não pode editar.</OperationalNotice> : null}

      <Modal onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar equipamento' : 'Novo equipamento'} wide>
        <EquipamentoForm
          key={selected?.id ?? 'new-eq'}
          initialValue={formInitialValue}
          onCancel={closeModal}
          onReloadAfterConflict={async () => {
            await load();
            closeModal();
          }}
          onSubmit={submitEquipamento}
        />
      </Modal>
    </div>
  );
}
