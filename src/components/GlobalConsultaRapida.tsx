import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Modal } from './ui/Modal';
import { useAuth } from '../modules/auth/hooks/useAuth';

const GLOBAL_CONSULTA_INPUT_ID = 'global-consulta-rapida-input';

export function GlobalConsultaRapida() {
  const { canAccessModule } = useAuth();
  const navigate = useNavigate();
  const canMateriais = canAccessModule('materiais');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    if (!canMateriais) return;

    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      event.preventDefault();
      setOpen(true);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canMateriais]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => document.getElementById(GLOBAL_CONSULTA_INPUT_ID)?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [open]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/materiais?tab=consulta&q=${encodeURIComponent(q)}`);
    close();
  }

  if (!canMateriais) return null;

  return (
    <Modal onClose={close} open={open} title="Consulta rapida por codigo" wide>
      <form onSubmit={handleSubmit}>
        <p className="panel-copy" style={{ marginBottom: 12 }}>
          Abre a consulta em <strong>Materiais</strong> sem fechar a tela em que voce esta. Digite o codigo ou bip o
          codigo de barras.
        </p>
        <Input
          id={GLOBAL_CONSULTA_INPUT_ID}
          label="Codigo do material"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ex.: TB-0001"
          value={query}
        />
        <div className="form-actions" style={{ marginTop: 16 }}>
          <Button onClick={close} type="button" variant="ghost">
            Cancelar
          </Button>
          <Button disabled={!query.trim()} type="submit">
            Consultar em Materiais
          </Button>
        </div>
      </form>
    </Modal>
  );
}
