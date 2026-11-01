import { useSearchParams } from 'react-router-dom';
import { ListPageShell, PanelToolbarGroup } from '../../../components/layout/ListPageShell';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { FonteDadosNotice } from '../../../components/ui/FonteDadosNotice';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { IconPlus } from '../../../components/ui/TableActionIcons';
import { usePageChrome } from '../../../layouts/PageChromeContext';
import { resolveFonteNuvemOk } from '../../../lib/fonteNuvemLista';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { EtiquetaFilters } from '../components/EtiquetaFilters';
import { EtiquetaForm } from '../components/EtiquetaForm';
import { EtiquetasRecebimentoPanel } from '../components/EtiquetasRecebimentoPanel';
import { EtiquetasTable } from '../components/EtiquetasTable';
import { useEtiquetas } from '../hooks/useEtiquetas';

type EtiquetasTab = 'historico' | 'recebimento';

export function EtiquetasPage() {
  const { canAccessAction } = useAuth();
  const cloudStatus = getSupabaseOperationalStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: EtiquetasTab = searchParams.get('tab') === 'recebimento' ? 'recebimento' : 'historico';

  function setTab(next: EtiquetasTab) {
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'historico') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setSearchParams(nextParams, { replace: true });
  }

  const {
    items,
    total,
    loading,
    error,
    success,
    fallbackReason,
    listSource,
    staleWhileRevalidate,
    hasCloudConfig,
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
  const temSelecao = selectedIds.size > 0;
  const fonteNuvemOk = resolveFonteNuvemOk({
    listSource,
    hasCloudConfig,
    staleWhileRevalidate,
    fallbackReason,
  });

  usePageChrome(
    {
      meta:
        tab === 'recebimento'
          ? 'Imprimir a partir de recebimentos'
          : loading && total === 0
            ? 'A carregar…'
            : `${total.toLocaleString('pt-BR')} etiquetas · ${fonteNuvemOk ? 'nuvem' : 'local'}`,
    },
    [tab, loading, total, fonteNuvemOk],
  );

  return (
    <>
      <ListPageShell
        className="panel--etiquetas"
        toolbar={
          canEdit ? (
            <PanelToolbarGroup label="Cadastro">
              <Button onClick={openCreateModal}>
                <span className="button-with-icon">
                  <IconPlus />
                  Nova etiqueta
                </span>
              </Button>
            </PanelToolbarGroup>
          ) : undefined
        }
        tabs={
          <div className="panel-tabs" role="tablist" aria-label="Secoes de etiquetas">
            <button
              aria-selected={tab === 'historico'}
              className={`panel-tab${tab === 'historico' ? ' panel-tab--active' : ''}`}
              onClick={() => setTab('historico')}
              role="tab"
              type="button"
            >
              Historico
            </button>
            <button
              aria-selected={tab === 'recebimento'}
              className={`panel-tab${tab === 'recebimento' ? ' panel-tab--active' : ''}`}
              onClick={() => setTab('recebimento')}
              role="tab"
              type="button"
            >
              Imprimir recebimento
            </button>
          </div>
        }
        notices={
          <>
            <ModuleHelp>
              <p className="panel-copy">
                {tab === 'recebimento' ? (
                  <>
                    <strong>Imprimir do recebimento</strong> — NF → itens → pré-visualizar / imprimir.
                  </>
                ) : (
                  <>
                    <strong>Historico</strong> — etiquetas registadas; busca por NF precisa de vinculo ao id do
                    recebimento.
                  </>
                )}
              </p>
            </ModuleHelp>
            <FonteDadosNotice
              healthy={fonteNuvemOk}
              fallbackMessage={
                hasCloudConfig
                  ? 'Cópia local / desatualizada — a nuvem nao confirmou esta lista. Nao use como verdade unica.'
                  : cloudStatus === 'partial'
                    ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
                    : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'
              }
            />
            {fallbackReason ? (
              <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice>
            ) : null}
            {!canEdit && !canAdminister ? (
              <OperationalNotice>
                O seu perfil pode visualizar etiquetas, mas nao pode alterar ou marcar emissoes.
              </OperationalNotice>
            ) : null}
          </>
        }
        filters={tab === 'historico' ? <EtiquetaFilters filters={filters} onChange={setFilters} /> : undefined}
        beforeTable={
          tab === 'historico' ? (
            <>
              {!loading && total === 0 && filters.busca.trim() ? (
                <OperationalNotice tone="warning">
                  Nenhuma etiqueta corresponde a esta busca. Para localizar por NF e necessario vinculo ao recebimento
                  (referencia = id). Se a NF existe mas ainda nao ha etiqueta, use «Imprimir recebimento» ou «Nova
                  etiqueta».
                </OperationalNotice>
              ) : null}
              {error ? <div className="error-box">{error}</div> : null}
              {success ? <OperationalNotice tone="success">{success}</OperationalNotice> : null}
              {loading ? <OperationalNotice>A carregar etiquetas…</OperationalNotice> : null}
              {!loading && canAdminister ? (
                <div className="etiquetas-bulk-bar etiquetas-bulk-bar--compact" role="group" aria-label="Selecao em lote">
                  <span className="panel-copy">
                    Selecionadas: <strong>{selectedIds.size}</strong>
                    {total > 0 ? <span className="panel-copy"> · {total} no filtro</span> : null}
                  </span>
                  <div className="etiquetas-bulk-bar__actions">
                    <Button onClick={() => void selecionarTodosFiltrados()} type="button" variant="ghost">
                      Selecionar todos ({total})
                    </Button>
                    {temSelecao ? (
                      <>
                        <Button onClick={limparSelecaoEtiquetas} type="button" variant="ghost">
                          Limpar selecao
                        </Button>
                        <Button onClick={() => void handleStatusEmLote('impressa')} type="button">
                          Marcar impressas
                        </Button>
                        <Button onClick={() => void handleStatusEmLote('cancelada')} type="button" variant="danger">
                          Cancelar lote
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : undefined
        }
        pagination={
          tab === 'historico' && !loading ? (
            <Pagination
              itemLabel="etiquetas"
              onPageChange={(page) => setFilters({ ...filters, page })}
              page={filters.page}
              pageSize={filters.pageSize}
              total={total}
            />
          ) : undefined
        }
      >
        {tab === 'historico' && !loading ? (
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
        ) : tab === 'recebimento' ? (
          <EtiquetasRecebimentoPanel />
        ) : null}
      </ListPageShell>

      <Modal onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar etiqueta' : 'Nova etiqueta'} wide>
        <EtiquetaForm
          key={selected?.id ?? 'new-etiqueta'}
          initialValue={formInitialValue}
          onApplyPreset={applyPreset}
          onCancel={closeModal}
          onSubmit={submitEtiqueta}
        />
      </Modal>
    </>
  );
}
