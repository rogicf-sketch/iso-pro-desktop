import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import type { MetricasPorCodigoMaterial } from '../services/documentoPlanejamento';
import { resolverStatusLinhaDocumento } from '../services/documentoPlanejamento';
import type { DocumentoItem } from '../types/documento.types';

type Props = {
  items: DocumentoItem[];
  onChange: (items: DocumentoItem[]) => void;
  /** Opcional: quando carregado, exibe status por linha (pendente / parcial / recebido / atendido). */
  metricasPorCodigo?: Map<string, MetricasPorCodigoMaterial>;
};

function createEmptyItem(): DocumentoItem {
  return {
    id: crypto.randomUUID(),
    codigoMaterial: '',
    descricaoMaterial: '',
    unidade: 'UN',
    quantidadeProjeto: 0,
    quantidadeAtendida: 0,
  };
}

function statusPlanejamentoLinhaMeta(status: ReturnType<typeof resolverStatusLinhaDocumento>) {
  if (status === 'atendido') return createStatusMeta('Atendido', 'ok');
  if (status === 'recebido') return createStatusMeta('Recebido', 'neutral');
  if (status === 'parcial') return createStatusMeta('Parcial', 'warning');
  return createStatusMeta('Pendente', 'danger');
}

export function DocumentoItensEditor({ items, onChange, metricasPorCodigo }: Props) {
  function updateItem(id: string, patch: Partial<DocumentoItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addItem() {
    onChange([...items, createEmptyItem()]);
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  return (
    <div className="editor-block">
      <div className="editor-header">
        <strong>Itens do documento</strong>
        <Button onClick={addItem} variant="ghost">
          Adicionar item
        </Button>
      </div>

      <div className="editor-list">
        {items.map((item) => {
          const statusLinha =
            metricasPorCodigo && item.codigoMaterial.trim()
              ? resolverStatusLinhaDocumento(item, metricasPorCodigo)
              : null;

          return (
            <div className="editor-item" key={item.id}>
              <div className="form-columns">
                <Input
                  label="Codigo"
                  onChange={(event) => updateItem(item.id, { codigoMaterial: event.target.value })}
                  value={item.codigoMaterial}
                />
                <Input
                  label="Descricao"
                  onChange={(event) => updateItem(item.id, { descricaoMaterial: event.target.value })}
                  value={item.descricaoMaterial}
                />
                <Input
                  label="Unidade"
                  onChange={(event) => updateItem(item.id, { unidade: event.target.value })}
                  value={item.unidade}
                />
              </div>

              <div className="form-columns">
                <Input
                  label="Quantidade do documento"
                  min="0"
                  onChange={(event) => updateItem(item.id, { quantidadeProjeto: Number(event.target.value || 0) })}
                  step="0.001"
                  type="number"
                  value={String(item.quantidadeProjeto)}
                />
                <Input disabled label="Qtd. atendida" type="number" value={String(item.quantidadeAtendida)} />
                {statusLinha ? (
                  <label className="field">
                    <span>Status (planej.)</span>
                    <div style={{ paddingTop: 8 }}>
                      {(() => {
                        const meta = statusPlanejamentoLinhaMeta(statusLinha);
                        return <StatusBadge text={meta.text} tone={meta.tone} />;
                      })()}
                    </div>
                  </label>
                ) : null}
              </div>

              <Button onClick={() => removeItem(item.id)} variant="danger">
                Remover item
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
