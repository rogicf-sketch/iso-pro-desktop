import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { InventarioFilters } from '../components/InventarioFilters';
import { InventarioForm } from '../components/InventarioForm';
import { InventariosTable } from '../components/InventariosTable';
import { useInventarios } from '../hooks/useInventarios';

export function InventarioPage() {
  const { canAccessAction } = useAuth();
  const cloudStatus = getSupabaseOperationalStatus();
  const {
    items,
    total,
    loading,
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
    submitInventario,
    handleFechar,
  } = useInventarios();
  const canEdit = canAccessAction('inventario', 'editar');
  const canAdminister = canAccessAction('inventario', 'administrar');

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Modulo</p>
          <h2>Inventario</h2>
        </div>
        {canEdit ? (
          <div className="panel-toolbar">
            <div className="panel-toolbar__group" role="group" aria-label="Cadastro">
              <span className="panel-toolbar__label">Cadastro</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={openCreateModal}>Novo inventario</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <p className="panel-copy">
        Base operacional para inventarios rotativos e gerais, com contagem, saldo do sistema e fechamento do ciclo.
      </p>

      <OperationalNotice>
        {cloudStatus === 'ready' && hasCloudConfig
          ? 'Fonte atual: Supabase. Inventarios sincronizados com a base em nuvem.'
          : cloudStatus === 'partial'
            ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
            : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'}
      </OperationalNotice>
      {fallbackReason ? <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice> : null}

      <InventarioFilters filters={filters} onChange={setFilters} />

      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice>{success}</OperationalNotice> : null}

      {loading ? (
        <OperationalNotice>Carregando inventarios...</OperationalNotice>
      ) : (
        <>
          <InventariosTable
            canAdminister={canAdminister}
            canEdit={canEdit}
            items={items}
            onClose={handleFechar}
            onEdit={openEditModal}
          />
          <Pagination
            onPageChange={(page) => setFilters({ ...filters, page })}
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
          />
        </>
      )}

      {!canEdit && !canAdminister ? (
        <OperationalNotice>Seu perfil pode visualizar inventarios, mas nao pode editar ou fechar ciclos.</OperationalNotice>
      ) : null}

      <Modal onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar inventario' : 'Novo inventario'}>
        <InventarioForm
          key={selected?.id ?? 'new-inv'}
          initialValue={formInitialValue}
          onCancel={closeModal}
          onReloadAfterConflict={async () => {
            await load();
            closeModal();
          }}
          onSubmit={submitInventario}
        />
      </Modal>
    </div>
  );
}
