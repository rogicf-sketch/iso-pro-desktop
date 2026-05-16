import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import type { ServiceWriteResult } from '../../../types/common.types';
import type { EquipamentoFormData } from '../types/equipamento.types';

type Props = {
  initialValue: EquipamentoFormData;
  onCancel: () => void;
  onSubmit: (data: EquipamentoFormData) => Promise<ServiceWriteResult>;
  onReloadAfterConflict?: () => void | Promise<void>;
};

export function EquipamentoForm({ initialValue, onCancel, onSubmit, onReloadAfterConflict }: Props) {
  const [form, setForm] = useState<EquipamentoFormData>(initialValue);
  const [error, setError] = useState('');
  const [snapshotConflict, setSnapshotConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSnapshotConflict(false);
    setSubmitting(true);
    const result = await onSubmit(form);
    if (!result.success) {
      setError(result.error ?? 'Não foi possível salvar o equipamento.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  return (
    <form className="stack-grid" onSubmit={handleSubmit}>
      <div className="form-columns">
        <Input
          label="Número de frota"
          onChange={(e) => setForm((c) => ({ ...c, codigo: e.target.value }))}
          placeholder="Ex.: F-001, PAT-102"
          value={form.codigo}
        />
        <Input label="Tipo de equipamento" onChange={(e) => setForm((c) => ({ ...c, tipoEquipamento: e.target.value }))} value={form.tipoEquipamento} />
        <Input label="Placa ou identificação" onChange={(e) => setForm((c) => ({ ...c, placa: e.target.value }))} value={form.placa} />
      </div>
      <div className="form-columns">
        <Input label="Operador responsável" onChange={(e) => setForm((c) => ({ ...c, nomeOperador: e.target.value }))} value={form.nomeOperador} />
        <Input label="Telefone do operador" onChange={(e) => setForm((c) => ({ ...c, telefoneOperador: e.target.value }))} value={form.telefoneOperador} />
        <Input label="Setor / frente" onChange={(e) => setForm((c) => ({ ...c, setorResponsavel: e.target.value }))} value={form.setorResponsavel} />
      </div>
      <div className="form-columns">
        <Input label="Empresa contratada" onChange={(e) => setForm((c) => ({ ...c, empresaContratada: e.target.value }))} value={form.empresaContratada} />
        <Input
          label="Número do contrato"
          onChange={(e) => setForm((c) => ({ ...c, numeroContrato: e.target.value }))}
          value={form.numeroContrato}
        />
        <Input
          label="Valor do contrato (opcional)"
          min={0}
          onChange={(e) => {
            const v = e.target.value;
            setForm((c) => ({
              ...c,
              valorContrato: v === '' ? null : Number(v),
            }));
          }}
          step="0.01"
          type="number"
          value={form.valorContrato ?? ''}
        />
      </div>
      <div className="form-columns">
        <Input
          label="Início no projeto"
          onChange={(e) => setForm((c) => ({ ...c, dataInicioProjeto: e.target.value }))}
          type="date"
          value={form.dataInicioProjeto}
        />
        <Input
          label="Fim do contrato"
          onChange={(e) => setForm((c) => ({ ...c, dataFimContrato: e.target.value }))}
          type="date"
          value={form.dataFimContrato}
        />
        <Select
          label="Status no canteiro"
          onChange={(e) =>
            setForm((c) => ({ ...c, statusEquipamento: e.target.value as EquipamentoFormData['statusEquipamento'] }))
          }
          value={form.statusEquipamento}
        >
          <option value="operando">Em operação</option>
          <option value="manutencao">Manutenção</option>
          <option value="parado">Parado</option>
          <option value="em_transito">Em trânsito</option>
        </Select>
      </div>
      <Input label="Observações" onChange={(e) => setForm((c) => ({ ...c, observacoes: e.target.value }))} value={form.observacoes} />

      <SnapshotConflictHint show={snapshotConflict} onReload={onReloadAfterConflict} />
      {error ? <div className="error-box">{error}</div> : null}

      <div className="inline-actions">
        <Button disabled={submitting} type="submit">
          {submitting ? 'Salvando...' : 'Salvar equipamento'}
        </Button>
        <Button onClick={onCancel} variant="ghost">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
