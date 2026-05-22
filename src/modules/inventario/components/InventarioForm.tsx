import { useState } from 'react';
import { useModalFormDirty, useModalGuardedClose } from '../../../components/ui/modalFormGuard';
import { Button } from '../../../components/ui/Button';
import { isPlainFormDirty } from '../../../lib/isPlainFormDirty';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import type { ServiceWriteResult } from '../../../types/common.types';
import type { InventarioFormData, InventarioItem } from '../types/inventario.types';

type Props = {
  initialValue: InventarioFormData;
  onSubmit: (data: InventarioFormData) => Promise<ServiceWriteResult>;
  onCancel: () => void;
  onReloadAfterConflict?: () => void | Promise<void>;
};

const emptyItem: InventarioItem = {
  id: '',
  codigoMaterial: '',
  descricaoMaterial: '',
  unidade: 'UN',
  saldoSistema: 0,
  quantidadeContada: 0,
};

export function InventarioForm({ initialValue, onSubmit, onCancel, onReloadAfterConflict }: Props) {
  const [form, setForm] = useState<InventarioFormData>(initialValue);
  const [error, setError] = useState('');
  const [snapshotConflict, setSnapshotConflict] = useState(false);
  const guardedCancel = useModalGuardedClose(onCancel);
  useModalFormDirty(isPlainFormDirty(initialValue, form));
  const hasDivergence = form.itens.some((item) => item.quantidadeContada !== item.saldoSistema);

  function updateItem(index: number, patch: Partial<InventarioItem>) {
    setForm((current) => ({
      ...current,
      itens: current.itens.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSnapshotConflict(false);
    const result = await onSubmit(form);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel salvar o inventario.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <OperationalNotice tone="warning">
        Regra operacional: inventario exige contagem consistente e registro fiel do saldo encontrado para sustentar ajustes posteriores.
      </OperationalNotice>
      {hasDivergence ? (
        <OperationalNotice tone="critical">
          Atencao: ha divergencias entre saldo do sistema e quantidade contada. Revise os itens antes de fechar a apuracao.
        </OperationalNotice>
      ) : (
        <OperationalNotice>Sem divergencias detectadas no momento entre saldo do sistema e contagem informada.</OperationalNotice>
      )}
      <div className="form-columns">
        <Input
          label="Codigo"
          onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value }))}
          value={form.codigo}
        />
        <Input
          label="Responsavel"
          onChange={(event) => setForm((current) => ({ ...current, responsavel: event.target.value }))}
          value={form.responsavel}
        />
        <Input
          label="Data"
          onChange={(event) => setForm((current) => ({ ...current, dataInventario: event.target.value }))}
          type="date"
          value={form.dataInventario}
        />
      </div>

      <Input
        label="Descricao"
        onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))}
        value={form.descricao}
      />

      <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
        <input
          checked={form.contagemMobileHabilitada}
          onChange={(event) => setForm((current) => ({ ...current, contagemMobileHabilitada: event.target.checked }))}
          type="checkbox"
        />
        <span>Permitir contagem pelo app mobile (inventario criado no PC aparece no telemovel)</span>
      </label>

      <div className="editor-block">
        <div className="editor-header">
          <div>
            <p className="panel-kicker">Itens</p>
            <strong>Contagem do inventario</strong>
          </div>
          <Button
            onClick={() =>
              setForm((current) => ({
                ...current,
                itens: [...current.itens, { ...emptyItem, id: crypto.randomUUID() }],
              }))
            }
            variant="ghost"
          >
            Adicionar item
          </Button>
        </div>

        <div className="editor-list">
          {form.itens.map((item, index) => (
            <div className="editor-item" key={item.id || index}>
              <div className="form-columns">
                <Input
                  label="Codigo material"
                  onChange={(event) => updateItem(index, { codigoMaterial: event.target.value })}
                  value={item.codigoMaterial}
                />
                <Input
                  label="Unidade"
                  onChange={(event) => updateItem(index, { unidade: event.target.value })}
                  value={item.unidade}
                />
                <Input
                  label="Saldo sistema"
                  onChange={(event) => updateItem(index, { saldoSistema: Number(event.target.value || 0) })}
                  type="number"
                  value={String(item.saldoSistema)}
                />
              </div>
              <Input
                label="Descricao material"
                onChange={(event) => updateItem(index, { descricaoMaterial: event.target.value })}
                value={item.descricaoMaterial}
              />
              <div className="form-columns">
                <Input
                  label="Quantidade contada"
                  onChange={(event) => updateItem(index, { quantidadeContada: Number(event.target.value || 0) })}
                  type="number"
                  value={String(item.quantidadeContada)}
                />
                <div />
                <div className="inline-actions">
                  <Button
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        itens: current.itens.filter((_, itemIndex) => itemIndex !== index),
                      }))
                    }
                    variant="danger"
                  >
                    Remover item
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Observacoes</span>
        <textarea
          className="input-control text-area"
          onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
          rows={4}
          value={form.observacoes}
        />
      </label>

      <SnapshotConflictHint show={snapshotConflict} onReload={onReloadAfterConflict} />
      {error ? <div className="error-box">{error}</div> : null}

      <div className="form-actions">
        <Button onClick={guardedCancel} variant="ghost">
          Cancelar
        </Button>
        <Button type="submit">Salvar inventario</Button>
      </div>
    </form>
  );
}
