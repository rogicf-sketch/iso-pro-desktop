import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { Conferencia } from '../types/conferencia.types';

type Props = {
  item: Conferencia;
  canEdit: boolean;
  totalRecebido: number;
  totalConferido: number;
  onConferenteChange: (value: string) => void;
  onObservacoesChange: (value: string) => void;
  onQuantidadeChange: (itemId: string, value: number) => void;
  onSubmit: () => void;
};

export function ConferenciaEditor({
  item,
  canEdit,
  totalRecebido,
  totalConferido,
  onConferenteChange,
  onObservacoesChange,
  onQuantidadeChange,
  onSubmit,
}: Props) {
  return (
    <div className="conferencia-editor">
      <div className="conferencia-editor__chrome">
        <span className="conferencia-editor__meta">
          <strong>{item.fornecedor}</strong>
          <span className="conferencia-editor__sep">·</span>
          NF {item.notaFiscal || '—'}
          <span className="conferencia-editor__sep">·</span>
          {item.romaneio ? `Rom. ${item.romaneio}` : 'Sem romaneio'}
          <span className="conferencia-editor__sep">·</span>
          {item.dataRecebimento}
        </span>
        <span className="conferencia-editor__totais">
          Recebido <strong>{totalRecebido}</strong>
          <span className="conferencia-editor__sep">·</span>
          Conferido <strong>{totalConferido}</strong>
        </span>
      </div>

      <div className="form-columns conferencia-editor__fields">
        <Input disabled={!canEdit} label="Conferente" onChange={(event) => onConferenteChange(event.target.value)} value={item.conferente} />
        <label className="field" style={{ gridColumn: 'span 2' }}>
          <span>Observacoes</span>
          <textarea
            className="input-control text-area"
            disabled={!canEdit}
            onChange={(event) => onObservacoesChange(event.target.value)}
            rows={2}
            value={item.observacoes}
          />
        </label>
      </div>

      <div className="table-shell conferencia-editor__itens">
        <table className="data-table">
          <thead>
            <tr>
              <th>Codigo</th>
              <th>Descricao</th>
              <th>Unidade</th>
              <th>Localizacao</th>
              <th>Recebido</th>
              <th>Conferido</th>
            </tr>
          </thead>
          <tbody>
            {item.itens.map((linha) => (
              <tr key={linha.id}>
                <td>{linha.codigoMaterial}</td>
                <td>{linha.descricaoMaterial}</td>
                <td>{linha.unidade}</td>
                <td>{linha.localizacao || '—'}</td>
                <td>{linha.quantidadeRecebida}</td>
                <td style={{ minWidth: 120 }}>
                  <input
                    className="input-control"
                    disabled={!canEdit}
                    min={0}
                    onChange={(event) => onQuantidadeChange(linha.id, Number(event.target.value))}
                    type="number"
                    value={linha.quantidadeConferida}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="form-actions conferencia-editor__actions">
          <Button onClick={onSubmit}>Salvar conferencia</Button>
        </div>
      ) : null}
    </div>
  );
}
