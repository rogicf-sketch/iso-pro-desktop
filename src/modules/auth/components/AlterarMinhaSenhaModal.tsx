import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { alterarMinhaSenha } from '../services/alterarMinhaSenha.service';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AlterarMinhaSenhaModal({ open, onClose }: Props) {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [senhaNova2, setSenhaNova2] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);

  function resetAndClose() {
    setSenhaAtual('');
    setSenhaNova('');
    setSenhaNova2('');
    setError('');
    setOk('');
    setBusy(false);
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setOk('');
    setBusy(true);
    const result = await alterarMinhaSenha({ senhaAtual, senhaNova, senhaNova2 });
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel alterar a senha.');
      return;
    }
    setOk('Senha actualizada.');
    setSenhaAtual('');
    setSenhaNova('');
    setSenhaNova2('');
  }

  return (
    <Modal onClose={resetAndClose} open={open} title="Alterar minha senha">
      <form className="stack-grid" onSubmit={(e) => void submit(e)}>
        <OperationalNotice>
          Altera apenas a sua senha de acesso. Nao abre o cadastro de utilizadores nem permissões.
        </OperationalNotice>
        <Input
          autoComplete="current-password"
          label="Senha actual"
          onChange={(e) => setSenhaAtual(e.target.value)}
          type="password"
          value={senhaAtual}
        />
        <Input
          autoComplete="new-password"
          label="Senha nova"
          onChange={(e) => setSenhaNova(e.target.value)}
          type="password"
          value={senhaNova}
        />
        <Input
          autoComplete="new-password"
          label="Confirmar senha nova"
          onChange={(e) => setSenhaNova2(e.target.value)}
          type="password"
          value={senhaNova2}
        />
        {error ? <div className="error-box">{error}</div> : null}
        {ok ? <OperationalNotice tone="success">{ok}</OperationalNotice> : null}
        <div className="inline-actions">
          <Button disabled={busy} type="submit">
            {busy ? 'A guardar…' : 'Guardar senha'}
          </Button>
          <Button onClick={resetAndClose} type="button" variant="ghost">
            Fechar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
