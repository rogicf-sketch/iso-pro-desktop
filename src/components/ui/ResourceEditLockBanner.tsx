import { Button } from './Button';
import { OperationalNotice } from './OperationalNotice';

type Props = {
  aviso: string;
  canForceRelease?: boolean;
  forcing?: boolean;
  onForceRelease?: () => void;
};

/** Aviso de lock de edicao + botao admin para forcar libertar. */
export function ResourceEditLockBanner({
  aviso,
  canForceRelease,
  forcing,
  onForceRelease,
}: Props) {
  if (!aviso) return null;
  return (
    <OperationalNotice tone="critical">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <span style={{ flex: '1 1 220px' }}>{aviso}</span>
        {canForceRelease && onForceRelease ? (
          <Button disabled={forcing} onClick={onForceRelease} type="button" variant="ghost">
            {forcing ? 'A libertar…' : 'Forçar libertar (admin)'}
          </Button>
        ) : null}
      </div>
    </OperationalNotice>
  );
}
