import { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { readConfiguracoes, salvarConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import type { RirProcedimentoCadastroItem } from '../../configuracoes/types/configuracao.types';

type Props = {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
};

export function RirProcedimentoModal({ open, onClose, canEdit }: Props) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [base, setBase] = useState('');
  const [revisao, setRevisao] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  const lista = useMemo(() => {
    void versao;
    return readConfiguracoes().rirProcedimentosCadastro ?? [];
  }, [versao]);

  function limparForm() {
    setBase('');
    setRevisao('');
    setEditId(null);
  }

  async function salvar() {
    setError('');
    setSuccess('');
    if (!canEdit) return;
    const b = base.trim();
    const r = revisao.trim();
    if (!b || !r) {
      setError('Preencha base e revisao do procedimento.');
      return;
    }
    const cfg = readConfiguracoes();
    const atual: RirProcedimentoCadastroItem[] = [...(cfg.rirProcedimentosCadastro ?? [])];
    const agora = new Date().toISOString().slice(0, 10);
    if (editId) {
      const ix = atual.findIndex((x) => x.id === editId);
      if (ix === -1) return;
      atual[ix] = { ...atual[ix], base: b, revisao: r, atualizadoEm: agora };
    } else {
      atual.push({ id: crypto.randomUUID(), base: b, revisao: r, atualizadoEm: agora });
    }
    const result = await salvarConfiguracoes({ ...cfg, rirProcedimentosCadastro: atual });
    if (!result.success) {
      setError(result.error ?? 'Falha ao salvar.');
      return;
    }
    setSuccess('Procedimento salvo.');
    limparForm();
    setVersao((v) => v + 1);
  }

  function editar(p: RirProcedimentoCadastroItem) {
    setEditId(p.id);
    setBase(p.base);
    setRevisao(p.revisao);
  }

  async function excluir(id: string) {
    if (!canEdit || !window.confirm('Excluir este procedimento da lista de sugestoes?')) return;
    const cfg = readConfiguracoes();
    const atual = (cfg.rirProcedimentosCadastro ?? []).filter((x) => x.id !== id);
    const result = await salvarConfiguracoes({ ...cfg, rirProcedimentosCadastro: atual });
    if (!result.success) setError(result.error ?? 'Falha ao excluir.');
    else {
      setSuccess('Removido.');
      setVersao((v) => v + 1);
    }
    if (editId === id) limparForm();
  }

  return (
    <Modal onClose={onClose} open={open} title="Nº do procedimento — cadastro" wide>
      <OperationalNotice tone="warning">
        Cadastre o procedimento vigente (base + revisao). As entradas aparecem como sugestoes no campo <strong>Nº Procedimento</strong> ao criar ou editar um RIR.
      </OperationalNotice>
      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice>{success}</OperationalNotice> : null}
      {!canEdit ? <OperationalNotice>Seu perfil nao pode alterar esta lista.</OperationalNotice> : null}

      <div className="form-columns" style={{ marginTop: 12 }}>
        <Input disabled={!canEdit} label="Base do documento" onChange={(e) => setBase(e.target.value)} placeholder="Ex.: PE-TUB-003" value={base} />
        <Input disabled={!canEdit} label="Revisao" onChange={(e) => setRevisao(e.target.value)} placeholder="Ex.: REV.2" value={revisao} />
      </div>
      <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
        {canEdit ? (
          <>
            <Button onClick={() => void salvar()} type="button">
              Salvar
            </Button>
            <Button onClick={limparForm} type="button" variant="ghost">
              Limpar formulario
            </Button>
          </>
        ) : null}
      </div>

      <p className="panel-copy" style={{ marginTop: 16 }}>
        <strong>Registros</strong>
      </p>
      <div className="table-wrap" style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--surface-border)', borderRadius: 8 }}>
        <table className="data-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Procedimento</th>
              <th>Atualizado</th>
              <th style={{ width: 120 }}>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: 16, color: 'var(--muted)' }}>
                  Nenhum procedimento cadastrado.
                </td>
              </tr>
            ) : (
              lista.map((p) => (
                <tr key={p.id}>
                  <td>
                    <code>{p.base}</code> {p.revisao}
                  </td>
                  <td>{p.atualizadoEm}</td>
                  <td>
                    {canEdit ? (
                      <>
                        <Button onClick={() => editar(p)} type="button" variant="ghost">
                          Editar
                        </Button>
                        <Button onClick={() => void excluir(p.id)} type="button" variant="ghost">
                          Excluir
                        </Button>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
