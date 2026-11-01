import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { FonteDadosNotice } from '../../../components/ui/FonteDadosNotice';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { resolveFonteNuvemOk } from '../../../lib/fonteNuvemLista';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { usePageChrome } from '../../../layouts/PageChromeContext';
import { useAuth } from '../../auth/hooks/useAuth';
import { InventarioFilters } from '../components/InventarioFilters';
import { InventarioForm } from '../components/InventarioForm';
import { InventariosTable } from '../components/InventariosTable';
import { useInventarios } from '../hooks/useInventarios';

export function InventarioPage() {
  const { canAccessAction } = useAuth();
  const canExportCsv = canAccessAction('inventario', 'visualizar');
  const cloudStatus = getSupabaseOperationalStatus();
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
    setFilters,
    openCreateModal,
    openEditModal,
    closeModal,
    load,
    submitInventario,
    handleFechar,
    exportarInventarioCsv,
  } = useInventarios();
  const canEdit = canAccessAction('inventario', 'editar');
  const canAdminister = canAccessAction('inventario', 'administrar');

  const fonteNuvemOk = resolveFonteNuvemOk({
    listSource,
    hasCloudConfig,
    staleWhileRevalidate,
    fallbackReason,
  });

  usePageChrome(
    {
      meta:
        loading && total === 0
          ? 'A carregar…'
          : `${total.toLocaleString('pt-BR')} inventários · ${fonteNuvemOk ? 'nuvem' : 'local'}`,
    },
    [loading, total, fonteNuvemOk],
  );

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar panel-header--actions-only">
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

      <ModuleHelp>
        <p className="panel-copy">
          Base operacional para inventarios rotativos e gerais, com contagem, saldo do sistema e fechamento do ciclo. Pode criar e salvar
          apenas o cabecalho (codigo, responsavel, descricao) e incluir itens depois. Marque «Permitir contagem pelo app mobile» para que
          inventarios abertos aparecam no I.S.O PRO Mobile.
        </p>
      </ModuleHelp>

      <FonteDadosNotice
        healthy={fonteNuvemOk}
        fallbackMessage={
          hasCloudConfig
            ? 'Fonte atual: copia local (nuvem vazia ou indisponivel). Cadastros de exemplo nao sao enviados a nuvem.'
            : cloudStatus === 'partial'
              ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
              : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'
        }
      />
      {fallbackReason ? <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice> : null}

      <InventarioFilters filters={filters} onChange={setFilters} />

      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice tone="success">{success}</OperationalNotice> : null}

      {loading ? (
        <OperationalNotice>Carregando inventarios...</OperationalNotice>
      ) : (
        <>
          <InventariosTable
            canAdminister={canAdminister}
            canEdit={canEdit}
            canExportCsv={canExportCsv}
            items={items}
            onClose={handleFechar}
            onEdit={openEditModal}
            onExportCsv={(row) => void exportarInventarioCsv(row)}
          />
          <Pagination
            itemLabel="inventários"
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

      <Modal onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar inventario' : 'Novo inventario'} wide>
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
