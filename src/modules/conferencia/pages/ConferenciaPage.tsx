import { Pagination } from '../../../components/tables/Pagination';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
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

  return (
    <div className="stack-grid">
      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Modulo</p>
            <h2>Conferencia</h2>
          </div>
        </div>

        <ModuleHelp>
          <p className="panel-copy">Fluxo de validacao dos recebimentos que entram primeiro como aguardando conferencia antes de liberar estoque.</p>
        </ModuleHelp>

        <OperationalNotice>
          {cloudStatus === 'ready' && hasCloudConfig
            ? 'Fonte atual: Supabase. Conferencia operando sobre recebimentos sincronizados em nuvem.'
            : cloudStatus === 'partial'
              ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
              : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'}
        </OperationalNotice>
        {fallbackReason ? <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice> : null}

        <SnapshotConflictHint show={snapshotConflict} onReload={() => void load()} />

        <ConferenciaFilters filters={filters} onChange={setFilters} />

        {error ? <div className="error-box">{error}</div> : null}
        {success ? <OperationalNotice>{success}</OperationalNotice> : null}
        {canEdit ? (
          <OperationalNotice tone="warning">
            Regra operacional: divergencias e quantidades fora do recebido devem ser tratadas na conferencia antes da liberacao definitiva para estoque.
          </OperationalNotice>
        ) : null}

        {loading ? (
          <OperationalNotice>Carregando conferencias...</OperationalNotice>
        ) : (
          <>
            <ConferenciasTable items={items} onSelect={selectConferencia} selectedId={selected?.id ?? ''} />
            <Pagination onPageChange={(page) => setFilters({ ...filters, page })} page={filters.page} pageSize={filters.pageSize} total={total} />
          </>
        )}
      </div>

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
      ) : (
        <OperationalNotice>Selecione um recebimento na lista para abrir a conferencia detalhada.</OperationalNotice>
      )}

      {!canEdit ? <OperationalNotice>Seu perfil pode consultar conferencia, mas nao pode concluir ajustes.</OperationalNotice> : null}
    </div>
  );
}
