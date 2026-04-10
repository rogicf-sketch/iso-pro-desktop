import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import type { ServiceWriteResult } from '../../../types/common.types';
import type { ColaboradorFormData } from '../types/colaborador.types';

type Props = {
  initialValue: ColaboradorFormData;
  onSubmit: (data: ColaboradorFormData) => Promise<ServiceWriteResult>;
  onCancel: () => void;
  onReloadAfterConflict?: () => void | Promise<void>;
};

export function ColaboradorForm({ initialValue, onSubmit, onCancel, onReloadAfterConflict }: Props) {
  const [form, setForm] = useState<ColaboradorFormData>(initialValue);
  const [error, setError] = useState('');
  const [snapshotConflict, setSnapshotConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSnapshotConflict(false);
    const result = await onSubmit(form);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel salvar o colaborador.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
    }
    setSaving(false);
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <Select label="Tipo" onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value as ColaboradorFormData['tipo'] }))} value={form.tipo}>
        <option value="interno">Interno</option>
        <option value="externo">Externo</option>
      </Select>
      <Input label="Nome" onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} required value={form.nome} />
      <Input label="Matricula" onChange={(event) => setForm((current) => ({ ...current, matricula: event.target.value }))} value={form.matricula} />
      <Input label="Funcao" onChange={(event) => setForm((current) => ({ ...current, funcao: event.target.value }))} value={form.funcao} />
      <Input label="Empresa" onChange={(event) => setForm((current) => ({ ...current, empresa: event.target.value }))} value={form.empresa} />
      <Input label="Documento" onChange={(event) => setForm((current) => ({ ...current, documento: event.target.value }))} value={form.documento} />
      <Input label="Telefone" onChange={(event) => setForm((current) => ({ ...current, telefone: event.target.value }))} value={form.telefone} />
      <label className="field">
        <span>Observacao</span>
        <textarea
          className="input-control text-area"
          onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))}
          rows={3}
          value={form.observacao}
        />
      </label>

      <SnapshotConflictHint show={snapshotConflict} onReload={onReloadAfterConflict} />
      {error ? <div className="error-box">{error}</div> : null}

      <div className="form-actions">
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancelar
        </Button>
        <Button disabled={saving} type="submit">
          {saving ? 'Salvando...' : 'Salvar colaborador'}
        </Button>
      </div>
    </form>
  );
}
