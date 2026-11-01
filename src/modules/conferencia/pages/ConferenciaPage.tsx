import { useMemo } from 'react';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { FonteDadosNotice } from '../../../components/ui/FonteDadosNotice';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import { resolveFonteNuvemOk } from '../../../lib/fonteNuvemLista';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { usePageChrome } from '../../../layouts/PageChromeContext';
import { useAuth } from '../../auth/hooks/useAuth';
import { ConferenciaEditor } from '../components/ConferenciaEditor';
import { ConferenciaFilters } from '../components/ConferenciaFilters';
import { ConferenciasTable } from '../components/ConferenciasTable';
import { useConferencia } from '../hooks/useConferencia';

export function ConferenciaPage() {
  const { canAccessAction } = useAuth();
  const cloudStatus = getSupabaseOperationalStatus();
  const {
    items,
    total,
    loading,
    error,
    success,
    fallbackReason,
    snapshotConflict,
    listSource,
    staleWhileRevalidate,
    hasCloudConfig,
    filters,
    selected,
    totaisSelecionados,
    setFilters,
    selectConferencia,
    setSelected,
    updateQuantidade,
    submitConferencia,
    load,
  } = useConferencia();

  const canEdit = canAccessAction('conferencia', 'editar');

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
          : `${total.toLocaleString('pt-BR')} recebimentos · ${fonteNuvemOk ? 'nuvem' : 'local'}`,
    },
    [loading, total, fonteNuvemOk],
  );

  const editorTitle = useMemo(() => {
    if (!selected) return 'Conferência';
    const nf = selected.notaFiscal?.trim() || '—';
    return `Conferir NF ${nf}`;
  }, [selected]);

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar panel-header--actions-only">
        <div className="panel-toolbar">
          <div className="panel-toolbar__group" role="group" aria-label="Lista de conferência">
            <span className="panel-toolbar__label">Lista</span>
            <div className="panel-toolbar__buttons">
              <Button onClick={() => void load()} type="button" variant="ghost">
                Atualizar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Valide recebimentos em aguardo antes de liberar estoque. Clique numa linha para conferir.
          {canEdit ? ' Divergências devem ser tratadas antes da liberação definitiva.' : ''}
        </p>
      </ModuleHelp>

      <FonteDadosNotice
        healthy={fonteNuvemOk}
        fallbackMessage={
          hasCloudConfig
            ? 'Fonte atual: fallback local. A lista ainda nao veio da nuvem (rede ou sync).'
            : cloudStatus === 'partial'
              ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
              : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'
        }
      />
      {fallbackReason ? <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice> : null}

      <SnapshotConflictHint show={snapshotConflict} onReload={() => void load()} />

      <ConferenciaFilters filters={filters} onChange={setFilters} />

      {error ? (
        error.includes('totalmente conferido') ? (
          <OperationalNotice tone="warning">{error}</OperationalNotice>
        ) : (
          <div className="error-box">{error}</div>
        )
      ) : null}
      {success ? <OperationalNotice tone="success">{success}</OperationalNotice> : null}

      {loading ? (
        <OperationalNotice>Carregando conferencias...</OperationalNotice>
      ) : (
        <>
          <ConferenciasTable items={items} onSelect={selectConferencia} selectedId={selected?.id ?? ''} />
          <Pagination
            itemLabel="conferências"
            onPageChange={(page) => setFilters({ ...filters, page })}
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
          />
        </>
      )}

      {!canEdit ? (
        <OperationalNotice>Seu perfil pode consultar conferencia, mas nao pode concluir ajustes.</OperationalNotice>
      ) : null}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={editorTitle}
        wide
        size="wide"
      >
        {selected ? (
          <>
            {selected.status === 'divergente' ? (
              <OperationalNotice tone="critical">
                Atencao: este recebimento possui divergencia e requer validacao cuidadosa antes da conclusao da conferencia.
              </OperationalNotice>
            ) : null}
            <ConferenciaEditor
              canEdit={canEdit}
              item={selected}
              onConferenteChange={(value) => setSelected((current) => (current ? { ...current, conferente: value } : current))}
              onObservacoesChange={(value) => setSelected((current) => (current ? { ...current, observacoes: value } : current))}
              onQuantidadeChange={updateQuantidade}
              onSubmit={submitConferencia}
              totalConferido={totaisSelecionados.conferido}
              totalRecebido={totaisSelecionados.recebido}
            />
          </>
        ) : null}
      </Modal>
    </div>
  );
}
