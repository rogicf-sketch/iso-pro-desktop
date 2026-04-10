import { Button } from '../../../components/ui/Button';
import { formatBytesPtBr, type StorageHealthSnapshot } from '../../../lib/storageHealth';
import { IconDatabaseStack, IconLocalStorage, IconMemoryChip, IconSaudePulse } from './dashboardEnvIcons';

type Props = {
  snapshot: StorageHealthSnapshot | null;
  loading?: boolean;
  onRefresh: () => void;
};

function footerToneClass(tone: StorageHealthSnapshot['saudeTone']): string {
  if (tone === 'ok') return 'dashboard-env-footer--green';
  if (tone === 'warning') return 'dashboard-env-footer--amber';
  if (tone === 'danger') return 'dashboard-env-footer--red';
  return 'dashboard-env-footer--slate';
}

export function DashboardSistemaAmbiente({ snapshot, loading, onRefresh }: Props) {
  const pct = snapshot?.usoPercent;
  const showBar = typeof pct === 'number';

  return (
    <div className="section-block dashboard-sistema-ambiente">
      <div className="dashboard-sistema-head">
        <div>
          <p className="panel-kicker">Dados locais</p>
          <h3>Armazenamento do sistema e ambiente local</h3>
        </div>
        <Button disabled={loading} onClick={onRefresh} type="button" variant="ghost">
          {loading ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>

      <p className="panel-copy dashboard-sistema-lead">
        Estes numeros referem-se ao espaco reservado ao I.S.O PRO neste computador (perfil do navegador/Electron), incluindo dados locais e cache —{' '}
        <strong>nao</strong> e o uso total do disco rigido.
      </p>

      {loading && !snapshot ? (
        <div className="dashboard-env-loading">
          <span className="dashboard-env-spinner" aria-hidden />
          <p className="panel-copy">Carregando dados do ambiente...</p>
        </div>
      ) : null}

      {!snapshot && !loading ? (
        <p className="panel-copy">Nao foi possivel ler o armazenamento do ambiente.</p>
      ) : null}

      {snapshot ? (
        <div className="dashboard-env-grid">
          <article className="dashboard-env-card">
            <span className="dashboard-env-card-title">Saude do armazenamento</span>
            <div className="dashboard-env-icon-ring">
              <IconSaudePulse className="dashboard-env-svg" />
            </div>
            <div className="dashboard-env-card-body">
              <strong className="dashboard-env-card-value">{snapshot.saudeLabel}</strong>
              <p className="dashboard-env-card-hint">
                {showBar
                  ? `Cerca de ${pct}% da cota do aplicativo em uso.`
                  : 'Cota detalhada indisponivel neste ambiente.'}
              </p>
              {showBar ? (
                <div className="dashboard-env-mini-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div
                    className={`dashboard-env-mini-fill dashboard-env-mini-fill--${snapshot.saudeTone}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : null}
            </div>
            <div className={`dashboard-env-footer ${footerToneClass(snapshot.saudeTone)}`}>
              {showBar ? <span>{pct}% uso da cota</span> : <span>Monitoramento basico</span>}
            </div>
          </article>

          <article className="dashboard-env-card">
            <span className="dashboard-env-card-title">Espaco do app (origem)</span>
            <div className="dashboard-env-icon-ring">
              <IconDatabaseStack className="dashboard-env-svg" />
            </div>
            <div className="dashboard-env-card-body">
              <strong className="dashboard-env-card-value">
                {snapshot.originUsageBytes !== null ? formatBytesPtBr(snapshot.originUsageBytes) : '—'}
              </strong>
              <p className="dashboard-env-card-hint">
                {snapshot.originQuotaBytes !== null
                  ? `Cota: ${formatBytesPtBr(snapshot.originQuotaBytes)}`
                  : 'Cota nao informada pelo navegador.'}
              </p>
            </div>
            <div className="dashboard-env-footer dashboard-env-footer--blue">
              <span>Dados e cache do perfil</span>
            </div>
          </article>

          <article className="dashboard-env-card">
            <span className="dashboard-env-card-title">localStorage (estimado)</span>
            <div className="dashboard-env-icon-ring">
              <IconLocalStorage className="dashboard-env-svg" />
            </div>
            <div className="dashboard-env-card-body">
              <strong className="dashboard-env-card-value">{formatBytesPtBr(snapshot.localStorageEstimateBytes)}</strong>
              <p className="dashboard-env-card-hint">Configuracoes e registros em texto no navegador.</p>
            </div>
            <div className="dashboard-env-footer dashboard-env-footer--blue">
              <span>Persistencia local</span>
            </div>
          </article>

          <article className="dashboard-env-card">
            <span className="dashboard-env-card-title">Memoria do dispositivo</span>
            <div className="dashboard-env-icon-ring">
              <IconMemoryChip className="dashboard-env-svg" />
            </div>
            <div className="dashboard-env-card-body">
              <strong className="dashboard-env-card-value">
                {snapshot.deviceMemoryGiB !== null ? `${snapshot.deviceMemoryGiB} GiB RAM` : 'N/D'}
              </strong>
              <p className="dashboard-env-card-hint">Faixa aproximada informada pelo navegador (nao e uso em tempo real).</p>
            </div>
            <div className="dashboard-env-footer dashboard-env-footer--blue">
              <span>Referencia de hardware</span>
            </div>
          </article>
        </div>
      ) : null}
    </div>
  );
}
