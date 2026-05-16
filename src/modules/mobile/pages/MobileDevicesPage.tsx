import { Link } from 'react-router-dom';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { hasSupabaseConfig } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { MobileDeviceFilters } from '../components/MobileDeviceFilters';
import { MobileDevicesTable } from '../components/MobileDevicesTable';
import { SupabaseMobileDiagnostics } from '../components/SupabaseMobileDiagnostics';
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
    pendingConfirm,
    confirmPendingAction,
    cancelPendingConfirmation,
    confirmLoading,
  } = useMobileDevices();
  const canAdminister = canAccessAction('mobile', 'administrar');

  const confirmCopy =
    pendingConfirm?.kind === 'authorize'
      ? {
          title: 'Autorizar dispositivo',
          message: 'Confirma a autorizacao deste dispositivo mobile?',
        }
      : pendingConfirm?.kind === 'block'
        ? {
            title: 'Bloquear dispositivo',
            message: 'Confirma o bloqueio deste dispositivo mobile? O acesso pelo app sera interrompido ate novo desbloqueio.',
          }
        : pendingConfirm?.kind === 'unblock'
          ? {
              title: 'Desbloquear dispositivo',
              message: 'Confirma o desbloqueio deste dispositivo mobile?',
            }
          : pendingConfirm?.kind === 'revoke'
            ? {
                title: 'Revogar dispositivo',
                message:
                  'Confirma a revogacao deste dispositivo mobile? Sera necessaria nova autorizacao para voltar a usar o app neste aparelho.',
              }
            : null;

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Modulo</p>
          <h2>Dispositivos mobile</h2>
        </div>
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
          Painel para acompanhar os celulares vinculados ao sistema, autorizar novos aparelhos, bloquear acessos e revogar dispositivos que nao
          fazem mais parte da operacao.
        </p>
      </ModuleHelp>

      {!cloudOk ? (
        <>
          <OperationalNotice tone="critical">
            <strong>Porque o teu telemovel nao aparece para autorizar:</strong> este browser <strong>nao esta ligado ao Supabase</strong>.
            Os 3 aparelhos na tabela sao <strong>solo de demonstracao</strong> (local no PC). O registo real do mobile fica na nuvem na
            tabela <code>dispositivos_mobile</code>, mas <strong>só aparece aqui</strong> depois de configurares a mesma URL e chave que no
            app mobile.
          </OperationalNotice>
          <div className="inline-actions" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <Link className="button button-primary" to="/configuracoes">
              Abrir Configuracoes do sistema
            </Link>
            <span style={{ fontSize: '0.9rem', opacity: 0.9 }}>
              Secao &quot;Supabase e nuvem&quot; → colar URL e chave anon → botao <strong>Salvar</strong> no fim da pagina → voltar a
              Dispositivos mobile → <strong>Atualizar lista</strong>
            </span>
          </div>
        </>
      ) : null}

      <SupabaseMobileDiagnostics canAdministerConfiguracoes={canAdministerConfiguracoes} />
      <OperationalNotice>
        {`Fonte atual: ${syncSource === 'supabase' ? 'Supabase (nuvem)' : 'fallback local (dados de demonstracao ou erro ao ler a nuvem)'}.`}
        {syncWarning ? ` Aviso: ${syncWarning}` : ''}
      </OperationalNotice>
      {canAdminister ? (
        <OperationalNotice tone="warning">
          Regra de seguranca: autorize apenas aparelhos validos da operacao. Bloqueio interrompe acesso e revogacao exige nova autorizacao do dispositivo.
        </OperationalNotice>
      ) : null}

      <div className="cards-grid">
        <div className="metric-card">
          <span className="metric-label">Total vinculados</span>
          <strong>{indicators.total}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Autorizados</span>
          <strong>{indicators.autorizados}</strong>
        </div>
        <div className="metric-card">
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
              onUnblock={handleUnblock}
            />
            <Pagination
              onPageChange={(page) => setFilters({ ...filters, page })}
              page={filters.page}
              pageSize={filters.pageSize}
              total={total}
            />
          </>
        )}
      </div>

      {!canAdminister ? (
        <OperationalNotice>Seu perfil pode consultar dispositivos mobile, mas nao pode autorizar, bloquear ou revogar.</OperationalNotice>
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
              <Button disabled={confirmLoading} onClick={() => void confirmPendingAction()} type="button">
                {confirmLoading ? 'A aplicar...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
