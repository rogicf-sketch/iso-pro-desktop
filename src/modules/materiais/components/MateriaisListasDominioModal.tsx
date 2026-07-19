import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import {
  obterListasDominioMateriaisArmazenadas,
  salvarDominiosDisciplinasMateriais,
  salvarDominiosUnidadesMateriais,
} from '../services/materiais.service';
import { normalizarSiglaUnidade, rotuloUnidadeCadastro } from '../utils/unidadeCadastroRotulo';

type Props = {
  open: boolean;
  tipo: 'disciplinas' | 'unidades';
  onClose: () => void;
  onSaved: () => void;
};

export function MateriaisListasDominioModal({ open, tipo, onClose, onSaved }: Props) {
  const [lista, setLista] = useState<string[]>([]);
  const [unidadeDescricoes, setUnidadeDescricoes] = useState<Record<string, string>>({});
  const [nova, setNova] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const gate = open ? tipo : 'closed';
  const [prevGate, setPrevGate] = useState<string | null>(null);
  if (gate !== prevGate) {
    setPrevGate(gate);
    if (open) {
      const arm = obterListasDominioMateriaisArmazenadas();
      setLista(tipo === 'disciplinas' ? [...arm.disciplinas] : [...arm.unidades]);
      setUnidadeDescricoes({ ...arm.unidadeDescricoes });
      setNova('');
      setNovaDescricao('');
    }
  }

  const titulo = tipo === 'disciplinas' ? 'Disciplinas' : 'Unidades';
  const isUnidades = tipo === 'unidades';

  function adicionar() {
    if (isUnidades) {
      const sigla = normalizarSiglaUnidade(nova);
      if (!sigla) return;
      if (lista.some((x) => normalizarSiglaUnidade(x) === sigla)) {
        setNova('');
        setNovaDescricao('');
        return;
      }
      const desc = novaDescricao.trim();
      setLista((prev) => [...prev, sigla].sort((a, b) => a.localeCompare(b, 'pt-BR')));
      if (desc) {
        setUnidadeDescricoes((prev) => ({ ...prev, [sigla]: desc }));
      }
      setNova('');
      setNovaDescricao('');
      return;
    }

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
    if (isUnidades) {
      const sigla = normalizarSiglaUnidade(val);
      setUnidadeDescricoes((prev) => {
        const next = { ...prev };
        delete next[sigla];
        return next;
      });
    }
  }

  function salvar() {
    if (tipo === 'disciplinas') {
      salvarDominiosDisciplinasMateriais(lista);
    } else {
      salvarDominiosUnidadesMateriais(lista, unidadeDescricoes);
    }
    onSaved();
    onClose();
  }

  return (
    <Modal onClose={onClose} open={open} title={titulo} wide>
      <p className="panel-copy" style={{ marginBottom: 12 }}>
        {isUnidades ? (
          <>
            Aqui a lista mostra a <strong>sigla e o significado</strong> (ex.: UN — Unidade) para quem opera ou
            inicia no sistema. Nos formulários de materiais continua a aparecer <strong>só a sigla</strong>. Valores já
            usados em materiais existentes continuam disponíveis mesmo que remova daqui.
          </>
        ) : (
          <>
            Estas opções aparecem no campo <strong>Disciplina</strong> ao cadastrar materiais. Valores já usados em
            materiais existentes continuam disponíveis na lista mesmo que remova daqui.
          </>
        )}
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
              <span>{isUnidades ? rotuloUnidadeCadastro(item, unidadeDescricoes) : item}</span>
              <Button onClick={() => remover(item)} type="button" variant="danger">
                Remover
              </Button>
            </li>
          ))
        )}
      </ul>
      <div className="form-columns" style={{ marginBottom: 16 }}>
        {isUnidades ? (
          <>
            <Input
              label="Nova sigla (ex.: UN, M, KG, PC)"
              onChange={(e) => setNova(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionar())}
              value={nova}
            />
            <Input
              label="Significado (ex.: Unidade, Metro, Peça)"
              onChange={(e) => setNovaDescricao(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionar())}
              value={novaDescricao}
            />
          </>
        ) : (
          <Input
            label="Nova disciplina"
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionar())}
            value={nova}
          />
        )}
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
