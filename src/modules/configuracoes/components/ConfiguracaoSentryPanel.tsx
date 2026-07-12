import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { captureMessage } from '../../../lib/errorReporting';

type Props = {
  canAdminister: boolean;
};

/** Painel TI: estado do DSN + smoke test (iso.sentry_smoke_test). */
export function ConfiguracaoSentryPanel({ canAdminister }: Props) {
  const dsn = String(import.meta.env.VITE_SENTRY_DSN ?? '').trim();
  const enabled = Boolean(dsn);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!canAdminister) return null;

  return (
    <div className="panel" style={{ marginTop: '1rem' }}>
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Observabilidade</p>
          <h2>Sentry</h2>
        </div>
      </div>

      {enabled ? (
        <OperationalNotice>
          DSN activo neste build. Eventos <code>iso.*</code> (conflito, dual-write, outbox, MFA) seguem para o Sentry.
        </OperationalNotice>
      ) : (
        <OperationalNotice tone="warning">
          Sem <code>VITE_SENTRY_DSN</code> neste build — erros ficam só no console. Para activar: criar projecto em{' '}
          <a href="https://sentry.io" rel="noreferrer" target="_blank">
            sentry.io
          </a>
          , copiar o DSN e correr{' '}
          <code>npm run sentry:ativar -- -Dsn &quot;https://…&quot;</code> (depois rebuild web/PC).
        </OperationalNotice>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <Button
          disabled={busy}
          type="button"
          variant="ghost"
          onClick={() => {
            setBusy(true);
            setFeedback(null);
            try {
              captureMessage('iso.sentry_smoke_test', {
                source: 'configuracoes',
                at: new Date().toISOString(),
              });
              setFeedback(
                enabled
                  ? 'Evento iso.sentry_smoke_test enviado. Confirme em sentry.io (Issues) em ~1 minuto.'
                  : 'DSN ausente — evento só no console deste PC. Cole o DSN e faça rebuild para ver no Sentry.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Enviar evento de teste
        </Button>
      </div>

      {feedback ? <OperationalNotice>{feedback}</OperationalNotice> : null}
    </div>
  );
}
