import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { useAuth } from '../../auth/hooks/useAuth';
import { EtiquetaFilters } from '../components/EtiquetaFilters';
import { EtiquetaForm } from '../components/EtiquetaForm';
import { EtiquetasRecebimentoPanel } from '../components/EtiquetasRecebimentoPanel';
import { EtiquetasTable } from '../components/EtiquetasTable';
import { useEtiquetas } from '../hooks/useEtiquetas';

export function EtiquetasPage() {
  const { canAccessAction } = useAuth();
  const {
    items,
    total,
    loading,
    error,
    success,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    applyPreset,
    setFilters,
    openCreateModal,
    openEditModal,
    closeModal,
    submitEtiqueta,
    handleStatus,
    selectedIds,
    toggleSelectEtiqueta,
    toggleSelectAllPaginaAtual,
    selecionarTodosFiltrados,
    limparSelecaoEtiquetas,
    handleStatusEmLote,
  } = useEtiquetas();

  const canEdit = canAccessAction('etiquetas', 'editar');
  const canAdminister = canAccessAction('etiquetas', 'administrar');

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Modulo</p>
          <h2>Etiquetas</h2>
        </div>
        {canEdit ? (
          <div className="panel-toolbar">
            <div className="panel-toolbar__group" role="group" aria-label="Cadastro">
              <span className="panel-toolbar__label">Cadastro</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={openCreateModal}>Nova etiqueta</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          <strong>Recebimentos:</strong> use o bloco abaixo para buscar NF, listar itens do recebimento, selecionar linhas, modelo e formato e imprimir — sem precisar cadastrar etiqueta antes. <strong>Historico:</strong> a lista e os filtros seguintes sao o registro de etiquetas salvas (origens diversas); a busca por NF no historico exige etiqueta ja vinculada ao id do recebimento.
        </p>
      </ModuleHelp>

      <EtiquetasRecebimentoPanel />

      <h3 className="panel-kicker" style={{ margin: '20px 0 8px' }}>
        Historico de etiquetas cadastradas
      </h3>

      <EtiquetaFilters filters={filters} onChange={setFilters} />

      {!loading && total === 0 && filters.busca.trim() ? (
        <OperationalNotice tone="warning">
          Nenhuma etiqueta corresponde a esta busca. Para localizar por nota fiscal e necessario ter uma etiqueta vinculada ao recebimento (campo referencia = id do recebimento no cadastro da etiqueta). Se o recebimento existe mas a etiqueta ainda nao foi criada, use Nova etiqueta e informe a origem Recebimentos e o id do recebimento.
        </OperationalNotice>
      ) : null}

      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice>{success}</OperationalNotice> : null}

      {loading ? (
        <OperationalNotice>Carregando etiquetas...</OperationalNotice>
      ) : (
        <>
          {canAdminister ? (
            <div className="form-actions" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
              <span className="panel-copy">
                Selecionadas: <strong>{selectedIds.size}</strong>
              </span>
              <Button onClick={() => void selecionarTodosFiltrados()} type="button" variant="ghost">
                Selecionar todos os resultados ({total})
              </Button>
              <Button onClick={limparSelecaoEtiquetas} type="button" variant="ghost">
                Limpar selecao
              </Button>
              <Button
                disabled={selectedIds.size === 0}
                onClick={() => void handleStatusEmLote('impressa')}
                type="button"
              >
                Marcar impressas (lote)
              </Button>
              <Button
                disabled={selectedIds.size === 0}
                onClick={() => void handleStatusEmLote('cancelada')}
                type="button"
                variant="danger"
              >
                Cancelar (lote)
              </Button>
            </div>
          ) : null}
          <EtiquetasTable
            canAdminister={canAdminister}
            canEdit={canEdit}
            items={items}
            onEdit={openEditModal}
            onStatus={handleStatus}
            onToggleSelect={canAdminister ? toggleSelectEtiqueta : undefined}
            onToggleSelectPagina={canAdminister ? toggleSelectAllPaginaAtual : undefined}
            selectedIds={canAdminister ? selectedIds : undefined}
          />
          <Pagination onPageChange={(page) => setFilters({ ...filters, page })} page={filters.page} pageSize={filters.pageSize} total={total} />
        </>
      )}

      {!canEdit && !canAdminister ? <OperationalNotice>Seu perfil pode visualizar etiquetas, mas nao pode alterar ou marcar emissoes.</OperationalNotice> : null}

      <Modal onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar etiqueta' : 'Nova etiqueta'} wide>
        <EtiquetaForm key={selected?.id ?? 'new-etiqueta'} initialValue={formInitialValue} onApplyPreset={applyPreset} onCancel={closeModal} onSubmit={submitEtiqueta} />
      </Modal>
    </div>
  );
}
