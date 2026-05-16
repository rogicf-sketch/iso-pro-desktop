import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import type { ServiceWriteResult } from '../../../types/common.types';
import { DocumentoItensEditor } from './DocumentoItensEditor';
import type { MetricasPorCodigoMaterial } from '../services/documentoPlanejamento';
import { carregarMetricasPlanejamentoPorCodigo } from '../services/documentos.service';
import type { DocumentoFormData } from '../types/documento.types';

type Props = {
  initialValue: DocumentoFormData;
  onCancel: () => void;
  onSubmit: (data: DocumentoFormData) => Promise<ServiceWriteResult>;
  onReloadAfterConflict?: () => void | Promise<void>;
};

export function DocumentoForm({ initialValue, onCancel, onSubmit, onReloadAfterConflict }: Props) {
  const [form, setForm] = useState<DocumentoFormData>(initialValue);
  const [error, setError] = useState('');
  const [snapshotConflict, setSnapshotConflict] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [metricasPorCodigo, setMetricasPorCodigo] = useState<Map<string, MetricasPorCodigoMaterial>>(new Map());
  const errorBoxRef = useRef<HTMLDivElement>(null);
  const isEditing = Boolean(initialValue.numero || initialValue.descricao || initialValue.itens.length);

  useEffect(() => {
    let cancel = false;
    void carregarMetricasPlanejamentoPorCodigo().then((map) => {
      if (!cancel) setMetricasPorCodigo(map);
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    errorBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSnapshotConflict(false);
    setIsSaving(true);
    const result = await onSubmit(form);

    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel salvar o documento.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
    }

    setIsSaving(false);
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <OperationalNotice tone="warning">
        Regra operacional: o planejamento deve ser salvo com identificacao clara, revisao controlada e itens completos para evitar atendimento incorreto.
      </OperationalNotice>
      {isEditing ? (
        <OperationalNotice>
          Edicao em andamento: revise numero, revisao e quantidades planejadas antes de confirmar alteracoes no documento.
        </OperationalNotice>
      ) : null}
      <div className="form-columns">
        <Input
          label="Numero"
          onChange={(event) => setForm((current) => ({ ...current, numero: event.target.value }))}
          value={form.numero}
        />
        <Input
          label="Revisao"
          onChange={(event) => setForm((current) => ({ ...current, revisao: event.target.value }))}
          value={form.revisao}
        />
        <Input
          label="Data"
          onChange={(event) => setForm((current) => ({ ...current, dataDocumento: event.target.value }))}
          type="date"
          value={form.dataDocumento}
        />
      </div>

      <div className="form-columns">
        <Input
          label="Descricao"
          onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))}
          value={form.descricao}
        />
        <Input
          label="Responsavel"
          onChange={(event) => setForm((current) => ({ ...current, responsavel: event.target.value }))}
          value={form.responsavel}
        />
      </div>

      <label className="field">
        <span>Observacao</span>
        <textarea
          className="input-control text-area"
          onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))}
          rows={3}
          value={form.observacao}
        />
      </label>

      <DocumentoItensEditor
        items={form.itens}
        metricasPorCodigo={metricasPorCodigo}
        onChange={(itens) => setForm((current) => ({ ...current, itens }))}
      />

      <SnapshotConflictHint show={snapshotConflict} onReload={onReloadAfterConflict} />
      {error ? (
        <div className="error-box" ref={errorBoxRef}>
          {error}
        </div>
      ) : null}

      <div className="form-actions">
        <Button onClick={onCancel} variant="ghost">
          Cancelar
        </Button>
        <Button disabled={isSaving} type="submit">
          {isSaving ? 'Salvando...' : 'Salvar documento'}
        </Button>
      </div>
    </form>
  );
}
