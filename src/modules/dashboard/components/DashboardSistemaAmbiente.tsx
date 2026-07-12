import { Button } from '../../../components/ui/Button';
import {
  formatBytesParts,
  formatBytesPtBr,
  formatUsoCotaLabel,
  type StorageHealthSnapshot,
} from '../../../lib/storageHealth';

type Props = {
  snapshot: StorageHealthSnapshot | null;
  loading?: boolean;
  onRefresh: () => void;
};

function toneClass(tone: StorageHealthSnapshot['saudeTone']): string {
  if (tone === 'ok') return 'ok';
  if (tone === 'warning') return 'warn';
  if (tone === 'danger') return 'danger';
  return 'neutral';
}

export function DashboardSistemaAmbiente({ snapshot, loading, onRefresh }: Props) {
  const ls = snapshot ? formatBytesParts(snapshot.localStorageEstimateBytes) : null;
  const usageForCota =
    snapshot && snapshot.originQuotaBytes && snapshot.originQuotaBytes > 0
      ? snapshot.originUsageBytes && snapshot.originUsageBytes > 0
        ? snapshot.originUsageBytes
        : snapshot.localStorageEstimateBytes
      : null;
  const usoLabel =
    usageForCota !== null && snapshot?.originQuotaBytes
      ? formatUsoCotaLabel(usageForCota, snapshot.originQuotaBytes)
      : null;
  const usoPctRaw =
    usageForCota !== null && snapshot?.originQuotaBytes
      ? Math.min(100, (usageForCota / snapshot.originQuotaBytes) * 100)
      : null;
  const barWidth = usoPctRaw === null ? 0 : usoPctRaw <= 0 ? 0 : Math.max(usoPctRaw, 1.5);
  const tone = snapshot ? toneClass(snapshot.saudeTone) : 'neutral';

  return (
    <section className="dashboard-local dashboard-local--dense">
      <div className="dashboard-nuvem__head dashboard-nuvem__head--dense">
        <div className="dashboard-nuvem__head-left">
          <h3>Posto local</h3>
          {snapshot ? (
            <span className={`dashboard-live-pill dashboard-live-pill--${tone === 'warn' ? 'warn' : tone === 'danger' ? 'danger' : 'ok'}`}>
              <span className="dashboard-live-pill__dot" aria-hidden />
              {snapshot.saudeLabel}
            </span>
          ) : null}
        </div>
        <Button disabled={loading} onClick={onRefresh} type="button" variant="ghost">
          {loading ? '…' : 'Atualizar'}
        </Button>
      </div>

      {loading && !snapshot ? (
        <div className="dashboard-widget-row">
          {Array.from({ length: 3 }).map((_, i) => (
            <article className="dashboard-widget dashboard-widget--skeleton" key={i}>
              <span className="dashboard-widget-skel" />
              <span className="dashboard-widget-skel dashboard-widget-skel--tall" />
            </article>
          ))}
        </div>
      ) : null}

      {!snapshot && !loading ? (
        <p className="panel-copy">Armazenamento local indisponível.</p>
      ) : null}

      {snapshot ? (
        <div className="dashboard-widget-row">
          <article className={`dashboard-widget dashboard-widget--${tone}`}>
            <span className="dashboard-widget__label">Uso local</span>
            <strong className="dashboard-widget__value">
              {ls?.value}
              {ls?.unit ? <span className="dashboard-widget__unit"> {ls.unit}</span> : null}
            </strong>
            <span className="dashboard-widget__meta">
              {usoLabel ?? '—'} · cota{' '}
              {snapshot.originQuotaBytes !== null ? formatBytesPtBr(snapshot.originQuotaBytes) : '—'}
            </span>
            <div
              className={`dashboard-widget__bar dashboard-widget__bar--${tone === 'warn' ? 'warning' : tone === 'danger' ? 'danger' : 'ok'}`}
              role="progressbar"
              aria-valuenow={usoPctRaw ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${barWidth}%` }} />
            </div>
          </article>

          <article className="dashboard-widget">
            <span className="dashboard-widget__label">Persistência</span>
            <strong className="dashboard-widget__value">Activa</strong>
            <span className="dashboard-widget__meta">Cache · perfil deste posto</span>
          </article>

          <article className="dashboard-widget">
            <span className="dashboard-widget__label">RAM</span>
            <strong className="dashboard-widget__value">
              {snapshot.deviceMemoryGiB !== null ? (
                <>
                  {snapshot.deviceMemoryGiB}
                  <span className="dashboard-widget__unit"> GiB</span>
                </>
              ) : (
                '—'
              )}
            </strong>
            <span className="dashboard-widget__meta">Capacidade do equipamento</span>
          </article>
        </div>
      ) : null}
    </section>
  );
}
