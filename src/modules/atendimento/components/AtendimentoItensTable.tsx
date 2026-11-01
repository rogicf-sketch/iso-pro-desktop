import { useEffect, useRef, useState } from 'react';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { coerceRecebimentoQuantidade } from '../../../lib/parseDecimal';
import type { AtendimentoDocumentoLinha } from '../types/atendimento.types';

type Props = {
  items: AtendimentoDocumentoLinha[];
  idsMarcados: Set<string>;
  onToggleMarca: (documentoItemId: string, marcado: boolean) => void;
  onMarcarTodos: (marcado: boolean) => void;
  onChangeQuantidade: (id: string, value: number) => void;
  /** Preenche min(pendente, saldo) na linha. */
  onPreencherMaximo?: (id: string) => void;
};

/** Situacao do item face ao estoque (nao confundir com status do documento «Pendente»). */
export function situacaoSaldoAtendimento(saldoDisponivel: number, quantidadePendente: number): {
  text: string;
  tone: 'ok' | 'warning' | 'danger';
} {
  const saldo = Number(saldoDisponivel) || 0;
  const pendente = Number(quantidadePendente) || 0;
  if (saldo <= 0) return { text: 'Sem saldo', tone: 'danger' };
  if (saldo >= pendente && pendente > 0) return { text: 'Pode atender', tone: 'ok' };
  return { text: 'Saldo parcial', tone: 'warning' };
}

/** Exibe quantidade limpa (sem 19.9970001); vazio se zero. */
export function formatQtdOperacaoDisplay(value: number): string {
  const n = coerceRecebimentoQuantidade(value);
  if (!Number.isFinite(n) || n === 0) return '';
  // Ate 3 casas uteis; remove zeros a direita (20, 0.72, 3.593).
  const fixed = n.toFixed(6).replace(/\.?0+$/, '');
  return fixed.replace('.', ',');
}

function parseQtdOperacaoDigitada(raw: string): number {
  const t = raw.trim();
  if (!t) return 0;
  return Math.max(0, coerceRecebimentoQuantidade(t));
}

type QtyCellProps = {
  item: AtendimentoDocumentoLinha;
  marcado: boolean;
  onChangeQuantidade: (id: string, value: number) => void;
  onPreencherMaximo?: (id: string) => void;
  onEnterNext: (currentId: string) => void;
  inputRef: (el: HTMLInputElement | null) => void;
};

function QtyCell({
  item,
  marcado,
  onChangeQuantidade,
  onPreencherMaximo,
  onEnterNext,
  inputRef,
}: QtyCellProps) {
  const committed = formatQtdOperacaoDisplay(item.quantidadeNestaOperacao);
  const [draft, setDraft] = useState(committed);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(committed);
  }, [committed, focused, item.documentoItemId]);

  function commit(raw: string) {
    const parsed = parseQtdOperacaoDigitada(raw);
    const max = Math.max(
      0,
      Math.min(Number(item.quantidadePendente) || 0, Number(item.saldoDisponivel) || 0),
    );
    const next = Math.min(parsed, max);
    onChangeQuantidade(item.documentoItemId, next);
    setDraft(formatQtdOperacaoDisplay(next));
  }

  return (
    <input
      aria-label={`Quantidade nesta operacao para ${item.codigoMaterial}`}
      className="input-control atendimento-qty-input"
      disabled={!marcado}
      inputMode="decimal"
      onBlur={() => {
        setFocused(false);
        commit(draft);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => {
        setFocused(true);
        event.target.select();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(draft);
          onEnterNext(item.documentoItemId);
          return;
        }
        // * = máximo da linha (parcial rapido)
        if (event.key === '*' || (event.key === 'm' && (event.ctrlKey || event.metaKey))) {
          event.preventDefault();
          const max = Math.max(
            0,
            Math.min(Number(item.quantidadePendente) || 0, Number(item.saldoDisponivel) || 0),
          );
          const shown = formatQtdOperacaoDisplay(max);
          setDraft(shown);
          if (onPreencherMaximo) onPreencherMaximo(item.documentoItemId);
          else onChangeQuantidade(item.documentoItemId, max);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(committed);
          (event.target as HTMLInputElement).blur();
        }
      }}
      placeholder="qtd"
      ref={inputRef}
      title="Digite a quantidade. Enter = próximo. * = máximo da linha."
      type="text"
      value={focused ? draft : committed}
    />
  );
}

export function AtendimentoItensTable({
  items,
  idsMarcados,
  onToggleMarca,
  onMarcarTodos,
  onChangeQuantidade,
  onPreencherMaximo,
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

  /** Enter: proxima linha marcada; se nao houver, proxima com saldo. */
  function focusProximaQuantidade(currentId: string) {
    const idx = items.findIndex((item) => item.documentoItemId === currentId);
    if (idx < 0) return;

    const tryFocus = (id: string) => {
      const nextEl = qtyInputRefs.current.get(id);
      if (!nextEl || nextEl.disabled) return false;
      nextEl.focus();
      nextEl.select();
      return true;
    };

    for (let j = idx + 1; j < items.length; j++) {
      const id = items[j]!.documentoItemId;
      if (idsMarcados.has(id) && tryFocus(id)) return;
    }
    for (let j = idx + 1; j < items.length; j++) {
      const row = items[j]!;
      if ((Number(row.saldoDisponivel) || 0) > 0 && tryFocus(row.documentoItemId)) return;
    }
  }

  return (
    <div className="table-shell atendimento-itens-shell">
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
            <th title="Digite a quantidade e Enter para o proximo item">Qtd nesta operacao</th>
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
                <td title={item.descricaoMaterial}>{item.descricaoMaterial}</td>
                <td>{item.quantidadeProjeto}</td>
                <td>{item.quantidadeAtendida}</td>
                <td>{item.quantidadePendente}</td>
                <td>{item.saldoDisponivel}</td>
                <td>
                  <StatusBadge {...situacaoSaldoAtendimento(item.saldoDisponivel, item.quantidadePendente)} />
                </td>
                <td>
                  <div className="atendimento-qty-cell">
                    <QtyCell
                      item={item}
                      marcado={idsMarcados.has(item.documentoItemId)}
                      onChangeQuantidade={onChangeQuantidade}
                      onPreencherMaximo={onPreencherMaximo}
                      onEnterNext={focusProximaQuantidade}
                      inputRef={(el) => setQtyRef(item.documentoItemId, el)}
                    />
                    {onPreencherMaximo && idsMarcados.has(item.documentoItemId) ? (
                      <button
                        className="atendimento-qty-max"
                        disabled={(Number(item.saldoDisponivel) || 0) <= 0}
                        onClick={() => onPreencherMaximo(item.documentoItemId)}
                        title="Preencher máximo (pendente limitado ao saldo)"
                        type="button"
                      >
                        máx
                      </button>
                    ) : null}
                  </div>
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
