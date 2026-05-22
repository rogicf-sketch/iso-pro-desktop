import { useState } from 'react';
import { useModalFormDirty, useModalGuardedClose } from '../../../components/ui/modalFormGuard';
import { Button } from '../../../components/ui/Button';
import { isPlainFormDirty } from '../../../lib/isPlainFormDirty';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import type { ServiceWriteResult } from '../../../types/common.types';
import type { FornecedorFormData } from '../types/fornecedor.types';

type Props = {
  initialValue: FornecedorFormData;
  onCancel: () => void;
  onSubmit: (data: FornecedorFormData) => Promise<ServiceWriteResult>;
  onReloadAfterConflict?: () => void | Promise<void>;
};

export function FornecedorForm({ initialValue, onCancel, onSubmit, onReloadAfterConflict }: Props) {
  const [form, setForm] = useState<FornecedorFormData>(initialValue);
  const [error, setError] = useState('');
  const [snapshotConflict, setSnapshotConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const guardedCancel = useModalGuardedClose(onCancel);
  useModalFormDirty(isPlainFormDirty(initialValue, form));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSnapshotConflict(false);
    setSubmitting(true);
    const result = await onSubmit(form);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel salvar fornecedor.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  return (
    <form className="stack-grid" onSubmit={handleSubmit}>
      <div className="form-columns">
        <Input label="Nome" onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))} value={form.nome} />
        <Input label="CNPJ" onChange={(event) => setForm((current) => ({ ...current, cnpj: event.target.value }))} value={form.cnpj} />
        <Input label="Telefone" onChange={(event) => setForm((current) => ({ ...current, telefone: event.target.value }))} value={form.telefone} />
      </div>

      <div className="form-columns">
        <Input label="Email" onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} value={form.email} />
        <Input label="Endereco" onChange={(event) => setForm((current) => ({ ...current, endereco: event.target.value }))} value={form.endereco} />
        <Select label="Status" onChange={(event) => setForm((current) => ({ ...current, ativo: event.target.value === 'true' }))} value={String(form.ativo)}>
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </Select>
      </div>

      <SnapshotConflictHint show={snapshotConflict} onReload={onReloadAfterConflict} />
      {error ? <div className="error-box">{error}</div> : null}

      <div className="inline-actions">
        <Button disabled={submitting} type="submit">
          {submitting ? 'Salvando...' : 'Salvar fornecedor'}
        </Button>
        <Button onClick={guardedCancel} variant="ghost">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
