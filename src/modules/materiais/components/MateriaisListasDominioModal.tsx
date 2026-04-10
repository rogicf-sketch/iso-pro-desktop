import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import {
  obterListasDominioMateriaisArmazenadas,
  salvarDominiosDisciplinasMateriais,
  salvarDominiosUnidadesMateriais,
} from '../services/materiais.service';

type Props = {
  open: boolean;
  tipo: 'disciplinas' | 'unidades';
  onClose: () => void;
  onSaved: () => void;
};

export function MateriaisListasDominioModal({ open, tipo, onClose, onSaved }: Props) {
  const [lista, setLista] = useState<string[]>([]);
  const [nova, setNova] = useState('');
  const gate = open ? tipo : 'closed';
  const [prevGate, setPrevGate] = useState<string | null>(null);
  if (gate !== prevGate) {
    setPrevGate(gate);
    if (open) {
      const arm = obterListasDominioMateriaisArmazenadas();
      setLista(tipo === 'disciplinas' ? [...arm.disciplinas] : [...arm.unidades]);
      setNova('');
    }
  }

  const titulo = tipo === 'disciplinas' ? 'Disciplinas' : 'Unidades';
  const placeholder = tipo === 'disciplinas' ? 'Nova disciplina' : 'Nova unidade (ex.: UN, M, KG)';

  function adicionar() {
    const t = nova.trim();
    if (!t) return;
    const lower = t.toLowerCase();
    if (lista.some((x) => x.trim().toLowerCase() === lower)) {
      setNova('');
      return;
    }
    setLista((prev) => [...prev, t].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    setNova('');
  }

  function remover(val: string) {
    setLista((prev) => prev.filter((x) => x !== val));
  }

  function salvar() {
    if (tipo === 'disciplinas') {
      salvarDominiosDisciplinasMateriais(lista);
    } else {
      salvarDominiosUnidadesMateriais(lista);
    }
    onSaved();
    onClose();
  }

  return (
    <Modal onClose={onClose} open={open} title={titulo}>
      <p className="panel-copy" style={{ marginBottom: 12 }}>
        Estas opcoes aparecem nos campos <strong>Disciplina</strong> e <strong>Unidade</strong> ao cadastrar materiais. Valores ja usados em
        materiais existentes continuam disponiveis na lista mesmo que remova daqui.
      </p>
      <ul className="dominio-lista-edicao" style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
        {lista.length === 0 ? (
          <li className="panel-copy" style={{ padding: '8px 0' }}>
            Nenhum item. Adicione abaixo.
          </li>
        ) : (
          lista.map((item) => (
            <li
              key={item}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '6px 0',
                borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
              }}
            >
              <span>{item}</span>
              <Button onClick={() => remover(item)} type="button" variant="danger">
                Remover
              </Button>
            </li>
          ))
        )}
      </ul>
      <div className="form-columns" style={{ marginBottom: 16 }}>
        <Input label={placeholder} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionar())} value={nova} />
        <div className="form-actions" style={{ alignItems: 'flex-end' }}>
          <Button onClick={adicionar} type="button" variant="ghost">
            Adicionar
          </Button>
        </div>
      </div>
      <div className="form-actions">
        <Button onClick={onClose} type="button" variant="ghost">
          Cancelar
        </Button>
        <Button onClick={salvar} type="button">
          Guardar lista
        </Button>
      </div>
    </Modal>
  );
}
