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
        Dados no servidor mudaram enquanto voce editava. Feche este formulario, atualize a lista e abra o registro novamente antes de salvar.
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
