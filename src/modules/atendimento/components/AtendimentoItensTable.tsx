import { useEffect, useRef } from 'react';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { AtendimentoDocumentoLinha } from '../types/atendimento.types';

type Props = {
  items: AtendimentoDocumentoLinha[];
  idsMarcados: Set<string>;
  onToggleMarca: (documentoItemId: string, marcado: boolean) => void;
  onMarcarTodos: (marcado: boolean) => void;
  onChangeQuantidade: (id: string, value: number) => void;
};

export function AtendimentoItensTable({
  items,
  idsMarcados,
  onToggleMarca,
  onMarcarTodos,
  onChangeQuantidade,
}: Props) {
  const qtyInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const n = items.length;
  const marcadosCount = items.filter((item) => idsMarcados.has(item.documentoItemId)).length;
  const todosMarcados = n > 0 && marcadosCount === n;
  const algunsMarcados = marcadosCount > 0 && marcadosCount < n;

  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (el) el.indeterminate = algunsMarcados;
  }, [algunsMarcados]);

  function setQtyRef(id: string, el: HTMLInputElement | null) {
    if (el) qtyInputRefs.current.set(id, el);
    else qtyInputRefs.current.delete(id);
  }

  function focusProximaQuantidade(currentId: string) {
    const idx = items.findIndex((item) => item.documentoItemId === currentId);
    if (idx < 0) return;
    for (let j = idx + 1; j < items.length; j++) {
      const id = items[j]!.documentoItemId;
      if (!idsMarcados.has(id)) continue;
      const nextEl = qtyInputRefs.current.get(id);
      nextEl?.focus();
      nextEl?.select();
      return;
    }
  }

  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 44 }} title="Incluir linha nesta operacao">
              <input
                aria-label="Selecionar todos os itens"
                checked={todosMarcados}
                onChange={() => onMarcarTodos(!todosMarcados)}
                ref={headerCheckboxRef}
                type="checkbox"
              />
            </th>
            <th>Codigo</th>
            <th>Descricao</th>
            <th>Qtd projeto</th>
            <th>Qtd atendida</th>
            <th>Pendente</th>
            <th>Saldo</th>
            <th>Situacao</th>
            <th>Qtd nesta operacao</th>
          </tr>
        </thead>
        <tbody>
          {items.length ? (
            items.map((item) => (
              <tr key={item.documentoItemId}>
                <td>
                  <input
                    aria-label={`Incluir item ${item.codigoMaterial}`}
                    checked={idsMarcados.has(item.documentoItemId)}
                    onChange={(e) => onToggleMarca(item.documentoItemId, e.target.checked)}
                    type="checkbox"
                  />
                </td>
                <td>{item.codigoMaterial}</td>
                <td>{item.descricaoMaterial}</td>
                <td>{item.quantidadeProjeto}</td>
                <td>{item.quantidadeAtendida}</td>
                <td>{item.quantidadePendente}</td>
                <td>{item.saldoDisponivel}</td>
                <td>
                  <StatusBadge
                    text={item.saldoDisponivel >= item.quantidadePendente ? 'Pode atender' : 'Saldo parcial'}
                    tone={item.saldoDisponivel >= item.quantidadePendente ? 'ok' : 'warning'}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Quantidade nesta operacao para ${item.codigoMaterial}`}
                    className="input-control"
                    disabled={!idsMarcados.has(item.documentoItemId)}
                    inputMode="decimal"
                    min={0}
                    onChange={(event) =>
                      onChangeQuantidade(item.documentoItemId, Number(event.target.value || 0))
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        focusProximaQuantidade(item.documentoItemId);
                      }
                    }}
                    ref={(el) => setQtyRef(item.documentoItemId, el)}
                    step={0.001}
                    type="number"
                    value={String(item.quantidadeNestaOperacao)}
                  />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="table-empty" colSpan={9}>
                Nenhum item pendente neste documento.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
