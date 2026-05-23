import { useMemo, useState } from 'react';
import { useModalFormDirty, useModalGuardedClose } from '../../../components/ui/modalFormGuard';
import { Button } from '../../../components/ui/Button';
import { isPlainFormDirty } from '../../../lib/isPlainFormDirty';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { MaterialFormData } from '../types/material.types';

type Props = {
  initialValue: MaterialFormData;
  disciplinas: string[];
  unidades: string[];
  onCancel: () => void;
  onSubmit: (data: MaterialFormData) => Promise<{ success: boolean; error?: string }>;
};

function opcoesSelectComValorAtual(lista: string[], valorAtual: string): string[] {
  const t = valorAtual.trim();
  if (!t) return lista;
  const has = lista.some((x) => x.trim().toLowerCase() === t.toLowerCase());
  if (has) return lista;
  return [...lista, t].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function MaterialForm({ initialValue, disciplinas, unidades, onCancel, onSubmit }: Props) {
  const [form, setForm] = useState<MaterialFormData>(initialValue);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const guardedCancel = useModalGuardedClose(onCancel);
  useModalFormDirty(isPlainFormDirty(initialValue, form));

  const opcoesDisciplina = useMemo(() => opcoesSelectComValorAtual(disciplinas, form.disciplina), [disciplinas, form.disciplina]);
  const opcoesUnidade = useMemo(() => opcoesSelectComValorAtual(unidades, form.unidade), [unidades, form.unidade]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsSaving(true);

    const result = await onSubmit(form);

    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel salvar o material.');
    }

    setIsSaving(false);
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="form-columns">
        <Input
          label="Codigo"
          onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value }))}
          value={form.codigo}
        />
        <Input
          autoComplete="off"
          label="Codigo de barras (EAN-13)"
          onChange={(event) => setForm((current) => ({ ...current, codigoBarras: event.target.value }))}
          placeholder="Deixe vazio para gerar automaticamente ao salvar"
          spellCheck={false}
          title="Apenas digitos. Vazio = gera EAN-13 interno na inclusao."
          value={form.codigoBarras}
        />
      </div>

      <div className="form-columns">
        <Input
          label="Descricao"
          onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))}
          value={form.descricao}
        />
      </div>

      <div className="form-columns">
        <Input
          label="Diametro"
          onChange={(event) => setForm((current) => ({ ...current, diametro: event.target.value }))}
          value={form.diametro}
        />
        <Select
          label="Disciplina"
          onChange={(event) => setForm((current) => ({ ...current, disciplina: event.target.value }))}
          title="Lista configuravel no modulo Materiais, botao Disciplinas."
          value={form.disciplina}
        >
          <option value="">Selecione</option>
          {opcoesDisciplina.map((disciplina) => (
            <option key={disciplina} value={disciplina}>
              {disciplina}
            </option>
          ))}
        </Select>
      </div>

      <div className="form-columns">
        <Select
          label="Unidade"
          onChange={(event) => setForm((current) => ({ ...current, unidade: event.target.value }))}
          title="Lista configuravel no modulo Materiais, botao Unidades."
          value={form.unidade}
        >
          <option value="">Selecione</option>
          {opcoesUnidade.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
        <Input
          label="Peso"
          min="0"
          onChange={(event) => setForm((current) => ({ ...current, peso: Number(event.target.value || 0) }))}
          step="0.001"
          type="number"
          value={String(form.peso)}
        />
      </div>

      <div className="form-columns">
        <Input
          label="Alerta estoque (% do planejamento)"
          max="100"
          min="0"
          onChange={(event) =>
            setForm((current) => ({ ...current, estoqueMinimo: Number(event.target.value || 0) }))
          }
          step="1"
          title="Percentual da quantidade total planejada nos documentos. Ex.: 20 = alerta quando saldo <= 20% do planejado. 0 = desligado."
          type="number"
          value={String(form.estoqueMinimo)}
        />

        <Select
          label="Status"
          onChange={(event) => setForm((current) => ({ ...current, ativo: event.target.value === 'true' }))}
          value={String(form.ativo)}
        >
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </Select>
      </div>

      <label className="field">
        <span>Observacao</span>
        <textarea
          className="input-control text-area"
          onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value }))}
          rows={4}
          value={form.observacao}
        />
      </label>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="form-actions">
        <Button onClick={guardedCancel} variant="ghost">
          Cancelar
        </Button>
        <Button disabled={isSaving} type="submit">
          {isSaving ? 'Salvando...' : 'Salvar material'}
        </Button>
      </div>
    </form>
  );
}
