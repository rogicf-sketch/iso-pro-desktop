import { Link } from 'react-router-dom';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { FonteDadosNotice } from '../../../components/ui/FonteDadosNotice';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { usePageChrome } from '../../../layouts/PageChromeContext';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { MobileDeviceFilters } from '../components/MobileDeviceFilters';
import { MobileDevicesTable } from '../components/MobileDevicesTable';
import { SupabaseMobileDiagnostics } from '../components/SupabaseMobileDiagnostics';
import { AtendimentoIntegridadeAuditPanel } from '../../atendimento/components/AtendimentoIntegridadeAuditPanel';
import { AtendimentoSyncAdminPanel } from '../../atendimento/components/AtendimentoSyncAdminPanel';
import { useMobileDevices } from '../hooks/useMobileDevices';

export function MobileDevicesPage() {
  const cloudOk = hasSupabaseConfig();
  const { canAccessAction } = useAuth();
  const canAdministerConfiguracoes = canAccessAction('configuracoes', 'administrar');
  const {
    items,
    total,
    loading,
    error,
    filters,
    indicators,
    syncSource,
    syncWarning,
    setFilters,
    reload,
    handleAuthorize,
    handleBlock,
    handleUnblock,
    handleRevoke,
    handleDelete,
    pendingConfirm,
    confirmPendingAction,
    cancelPendingConfirmation,
    confirmLoading,
  } = useMobileDevices();
  const canAdminister = canAccessAction('mobile', 'administrar');
  const fonteNuvemOk = syncSource === 'supabase' && cloudOk;

  usePageChrome(
    {
      meta:
        loading && total === 0
          ? 'A carregar…'
          : `${total.toLocaleString('pt-BR')} dispositivos · ${fonteNuvemOk ? 'nuvem' : 'local'}`,
    },
    [loading, total, fonteNuvemOk],
  );

  const confirmCopy =
    pendingConfirm?.kind === 'authorize'
      ? {
          title: 'Autorizar dispositivo',
          message: 'Confirma a autorizacao deste dispositivo mobile?',
          confirmLabel: 'Confirmar',
          confirmVariant: 'primary' as const,
        }
      : pendingConfirm?.kind === 'block'
        ? {
            title: 'Bloquear dispositivo',
            message: 'Confirma o bloqueio deste dispositivo mobile? O acesso pelo app sera interrompido ate novo desbloqueio.',
            confirmLabel: 'Confirmar',
            confirmVariant: 'primary' as const,
          }
        : pendingConfirm?.kind === 'unblock'
          ? {
              title: 'Desbloquear dispositivo',
              message: 'Confirma o desbloqueio deste dispositivo mobile?',
              confirmLabel: 'Confirmar',
              confirmVariant: 'primary' as const,
            }
          : pendingConfirm?.kind === 'revoke'
            ? {
                title: 'Revogar dispositivo',
                message:
                  'Confirma a revogacao? O aparelho fica pendente na lista e o app pede nova autorizacao — sem apagar o registo.',
                confirmLabel: 'Confirmar',
                confirmVariant: 'primary' as const,
              }
            : pendingConfirm?.kind === 'delete'
              ? {
                  title: 'Excluir dispositivo',
                  message:
                    'Confirma a exclusao? O registo some da lista. O aparelho so volta a aparecer se o app se registar de novo (ex.: nova instalacao). Esta accao nao pode ser desfeita.',
                  confirmLabel: 'Excluir',
                  confirmVariant: 'danger' as const,
                }
              : null;

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar panel-header--actions-only">
        <div className="panel-toolbar">
          <div className="panel-toolbar__group" role="group" aria-label="Lista">
            <span className="panel-toolbar__label">Lista</span>
            <div className="panel-toolbar__buttons">
              <Button onClick={reload} variant="ghost">
                Atualizar lista
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Painel para acompanhar os celulares vinculados ao sistema, autorizar novos aparelhos, bloquear acessos, revogar autorizacao
          (fica pendente) e excluir registos que ja nao fazem parte da operacao.
        </p>
      </ModuleHelp>

      {!cloudOk ? (
        <>
          <OperationalNotice tone="critical">
            Nuvem nao configurada neste browser. Dispositivos reais so aparecem apos ligar o Supabase.
          </OperationalNotice>
          <div className="inline-actions" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <Link className="button button-primary" to="/configuracoes">
              Abrir Configuracoes do sistema
            </Link>
          </div>
          <ModuleHelp>
            <OperationalNotice tone="warning">
              Os aparelhos na tabela podem ser apenas demonstracao local. O registo real fica na nuvem (
              <code>dispositivos_mobile</code>) com a mesma URL e chave do app mobile. Em Configuracoes → Supabase e nuvem,
              grave URL e chave anon e volte aqui para atualizar a lista.
            </OperationalNotice>
            <SupabaseMobileDiagnostics canAdministerConfiguracoes={canAdministerConfiguracoes} />
          </ModuleHelp>
        </>
      ) : canAdministerConfiguracoes ? (
        <ModuleHelp>
          <SupabaseMobileDiagnostics canAdministerConfiguracoes={canAdministerConfiguracoes} collapsedByDefault />
        </ModuleHelp>
      ) : null}

      <FonteDadosNotice
        healthy={fonteNuvemOk}
        fallbackMessage={
          syncWarning
            ? `Fonte atual: fallback local. ${syncWarning}`
            : 'Fonte atual: fallback local (dados de demonstracao ou erro ao ler a nuvem).'
        }
      />
      {canAdminister ? (
        <ModuleHelp>
          <OperationalNotice tone="warning">
            Regra de seguranca: autorize apenas aparelhos validos da operacao. Bloqueio interrompe acesso; revogacao exige nova
            autorizacao (o registo fica pendente); exclusao remove o aparelho da lista.
          </OperationalNotice>
        </ModuleHelp>
      ) : null}

      <div className="cards-grid cards-grid--compact">
        <div className="metric-card metric-card--compact">
          <span className="metric-label">Total vinculados</span>
          <strong>{indicators.total}</strong>
        </div>
        <div className="metric-card metric-card--compact">
          <span className="metric-label">Autorizados</span>
          <strong>{indicators.autorizados}</strong>
        </div>
        <div className="metric-card metric-card--compact">
          <span className="metric-label">Pendentes / bloqueados</span>
          <strong>
            {indicators.pendentes} / {indicators.bloqueados}
          </strong>
        </div>
      </div>

      <div className="section-block">
        <MobileDeviceFilters filters={filters} onChange={setFilters} />

        {error ? <div className="error-box">{error}</div> : null}

        {loading ? (
          <OperationalNotice>Carregando dispositivos mobile...</OperationalNotice>
        ) : (
          <>
            <MobileDevicesTable
              canAdminister={canAdminister}
              items={items}
              onAuthorize={handleAuthorize}
              onBlock={handleBlock}
              onRevoke={handleRevoke}
              onDelete={handleDelete}
              onUnblock={handleUnblock}
            />
            <Pagination
              itemLabel="dispositivos"
              onPageChange={(page) => setFilters({ ...filters, page })}
              page={filters.page}
              pageSize={filters.pageSize}
              total={total}
            />
          </>
        )}
      </div>

      <AtendimentoSyncAdminPanel canAdminister={canAdminister} />
      <AtendimentoIntegridadeAuditPanel canAdminister={canAdminister} />

      {!canAdminister ? (
        <OperationalNotice>
          Seu perfil pode consultar dispositivos mobile, mas nao pode autorizar, bloquear, revogar ou excluir.
        </OperationalNotice>
      ) : null}

      <Modal
        onClose={cancelPendingConfirmation}
        open={Boolean(pendingConfirm && confirmCopy)}
        title={confirmCopy?.title ?? 'Confirmar'}
        wide
      >
        {confirmCopy ? (
          <div className="editor-block">
            <p className="panel-copy" style={{ marginTop: 0 }}>
              {confirmCopy.message}
            </p>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={confirmLoading} onClick={cancelPendingConfirmation} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button
                disabled={confirmLoading}
                onClick={() => void confirmPendingAction()}
                type="button"
                variant={confirmCopy.confirmVariant}
              >
                {confirmLoading ? 'A aplicar...' : confirmCopy.confirmLabel}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
