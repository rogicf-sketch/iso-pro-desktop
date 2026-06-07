import { useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { OperationalNotice } from './ui/OperationalNotice';
import {
  ISO_PRO_SNAPSHOT_CONFLICT_EVENT,
  ISO_PRO_SNAPSHOT_REFRESH_EVENT,
  requestSnapshotRefresh,
} from '../lib/snapshotSessionSync';
import { invalidateIsoProSnapshotCache, SNAPSHOT_CONFLICT_MESSAGE } from '../lib/isoProSnapshot';

export function SnapshotSessionBanner() {
  const [conflictMessage, setConflictMessage] = useState('');
  const [refreshHint, setRefreshHint] = useState('');

  useEffect(() => {
    function onConflict(ev: Event) {
      const detail = (ev as CustomEvent<{ message?: string }>).detail;
      setConflictMessage(detail?.message?.trim() || SNAPSHOT_CONFLICT_MESSAGE);
    }
    function onRefresh(ev: Event) {
      const detail = (ev as CustomEvent<{ reason?: string }>).detail;
      setRefreshHint(detail?.reason?.trim() || 'Outra sessão atualizou os dados.');
    }
    window.addEventListener(ISO_PRO_SNAPSHOT_CONFLICT_EVENT, onConflict);
    window.addEventListener(ISO_PRO_SNAPSHOT_REFRESH_EVENT, onRefresh);
    return () => {
      window.removeEventListener(ISO_PRO_SNAPSHOT_CONFLICT_EVENT, onConflict);
      window.removeEventListener(ISO_PRO_SNAPSHOT_REFRESH_EVENT, onRefresh);
    };
  }, []);

  if (!conflictMessage && !refreshHint) return null;

  function handleReload() {
    invalidateIsoProSnapshotCache();
    setConflictMessage('');
    setRefreshHint('');
    window.location.reload();
  }

  return (
    <div className="snapshot-session-banner stack-grid" role="status">
      {conflictMessage ? (
        <OperationalNotice tone="warning">{conflictMessage}</OperationalNotice>
      ) : null}
      {refreshHint ? <OperationalNotice tone="neutral">{refreshHint}</OperationalNotice> : null}
      <div className="form-actions">
        <Button type="button" variant="ghost" onClick={handleReload}>
          Recarregar dados
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            invalidateIsoProSnapshotCache();
            requestSnapshotRefresh({ reason: 'Recarregamento manual.' });
            setConflictMessage('');
            setRefreshHint('');
          }}
        >
          Atualizar cache
        </Button>
      </div>
    </div>
  );
}
