import { Button } from './Button';
import { OperationalNotice } from './OperationalNotice';

type Props = {
  show: boolean;
  onReload?: () => void | Promise<void>;
};

export function SnapshotConflictHint({ show, onReload }: Props) {
  if (!show) {
    return null;
  }

  return (
    <div className="stack-grid">
      <OperationalNotice tone="warning">
        <strong>Conflito de concorrência.</strong> Outro posto (PC ou telemóvel) gravou este material enquanto
        editava. Não continue no mesmo desenho sem actualizar — feche o formulário, toque em «Recarregar dados» e
        só depois volte a bipar/registar. Evite dois operadores no mesmo desenho ao mesmo tempo.
      </OperationalNotice>
      {onReload ? (
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={() => void onReload()}>
            Recarregar dados
          </Button>
        </div>
      ) : null}
    </div>
  );
}
