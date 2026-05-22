import { useState } from 'react';
import { useModalFormDirty, useModalGuardedClose } from '../../../components/ui/modalFormGuard';
import { Button } from '../../../components/ui/Button';
import { isPlainFormDirty } from '../../../lib/isPlainFormDirty';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { Select } from '../../../components/ui/Select';
import { imprimirEtiquetaHtml } from '../utils/imprimirEtiquetaHtml';
import { EtiquetaPreview } from './EtiquetaPreview';
import type { EtiquetaFormData } from '../types/etiqueta.types';

type Props = {
  initialValue: EtiquetaFormData;
  onCancel: () => void;
  onApplyPreset: (modelo: EtiquetaFormData['modelo'], formato: EtiquetaFormData['formato']) => { larguraMm: number; alturaMm: number };
  onSubmit: (data: EtiquetaFormData) => Promise<{ success: boolean; error?: string }>;
};

export function EtiquetaForm({ initialValue, onCancel, onApplyPreset, onSubmit }: Props) {
  const [form, setForm] = useState<EtiquetaFormData>(initialValue);
  const [error, setError] = useState('');
  const guardedCancel = useModalGuardedClose(onCancel);
  useModalFormDirty(isPlainFormDirty(initialValue, form));
  const isThermal = form.formato === 'termica_58' || form.formato === 'termica_80';

  function handlePreset(modelo: EtiquetaFormData['modelo'], formato: EtiquetaFormData['formato']) {
    const preset = onApplyPreset(modelo, formato);
    setForm((current) => ({ ...current, modelo, formato, larguraMm: preset.larguraMm, alturaMm: preset.alturaMm }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const result = await onSubmit(form);
    if (!result.success) setError(result.error ?? 'Nao foi possivel salvar a etiqueta.');
  }

  return (
    <form className="stack-grid" onSubmit={handleSubmit}>
      <OperationalNotice tone="warning">
        Regra operacional: confirme modelo, formato e dimensoes antes de salvar para evitar impressao fora do padrao da operacao.
      </OperationalNotice>
      {isThermal ? (
        <OperationalNotice>
          Formato termico selecionado: revise largura, altura e quantidade de copias para evitar desperdicio de rolo.
        </OperationalNotice>
      ) : (
        <OperationalNotice>
          Formato A4 selecionado: revise distribuicao do layout para manter leitura e padronizacao visual.
        </OperationalNotice>
      )}
      <div className="form-grid">
        <div className="form-columns">
          <Input label="Titulo" onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} value={form.titulo} />
          <Input label="Codigo" onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value }))} value={form.codigo} />
          <Input label="Copias" min={1} onChange={(event) => setForm((current) => ({ ...current, quantidadeCopias: Number(event.target.value || 1) }))} type="number" value={String(form.quantidadeCopias)} />
        </div>

        <Input label="Descricao" onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} value={form.descricao} />

        <div className="form-columns">
          <Select label="Modelo" onChange={(event) => handlePreset(event.target.value as EtiquetaFormData['modelo'], form.formato)} value={form.modelo}>
            <option value="simples">Simples</option>
            <option value="colorido">Neutro refinado</option>
            <option value="industrial">Industrial</option>
            <option value="cartao">Cartao</option>
            <option value="segregacao">Segregacao (etiqueta: Segregado)</option>
            <option value="liberacao">Liberacao (etiqueta: Liberado)</option>
          </Select>
          <Select label="Formato" onChange={(event) => handlePreset(form.modelo, event.target.value as EtiquetaFormData['formato'])} value={form.formato}>
            <option value="a4_2col">A4 2 colunas</option>
            <option value="a4_1col">A4 1 coluna</option>
            <option value="termica_58">Termica 58mm</option>
            <option value="termica_80">Termica 80mm</option>
          </Select>
          <Select label="Modulo origem" onChange={(event) => setForm((current) => ({ ...current, moduloOrigem: event.target.value as EtiquetaFormData['moduloOrigem'] }))} value={form.moduloOrigem}>
            <option value="livre">Livre</option>
            <option value="materiais">Materiais</option>
            <option value="recebimentos">Recebimentos</option>
            <option value="qualidade">Qualidade</option>
          </Select>
        </div>

        <div className="form-columns">
          <Input label="Largura (mm)" onChange={(event) => setForm((current) => ({ ...current, larguraMm: Number(event.target.value || 0) }))} type="number" value={String(form.larguraMm)} />
          <Input label="Altura (mm)" onChange={(event) => setForm((current) => ({ ...current, alturaMm: Number(event.target.value || 0) }))} type="number" value={String(form.alturaMm)} />
          <Input label="Referencia" onChange={(event) => setForm((current) => ({ ...current, referenciaId: event.target.value }))} value={form.referenciaId} />
        </div>

        <Input label="Criado por" onChange={(event) => setForm((current) => ({ ...current, criadoPor: event.target.value }))} value={form.criadoPor} />

        <label className="field">
          <span>Observacoes</span>
          <textarea className="input-control text-area" onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))} rows={3} value={form.observacoes} />
        </label>

        {error ? <div className="error-box">{error}</div> : null}

        <div className="form-actions">
          <Button onClick={guardedCancel} variant="ghost">
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!imprimirEtiquetaHtml(form)) {
                window.alert('Nao foi possivel abrir a impressao. Verifique se o navegador bloqueou pop-ups.');
              }
            }}
            type="button"
            variant="ghost"
          >
            Imprimir preview
          </Button>
          <Button type="submit">Salvar etiqueta</Button>
        </div>
      </div>

      <EtiquetaPreview form={form} />
    </form>
  );
}
