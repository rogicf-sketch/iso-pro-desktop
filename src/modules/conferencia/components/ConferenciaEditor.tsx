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
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Recebimento selecionado</p>
          <h2>{item.fornecedor}</h2>
        </div>
      </div>

      <div className="form-columns">
        <Input label="Nota fiscal" readOnly value={item.notaFiscal} />
        <Input label="Romaneio" readOnly value={item.romaneio} />
        <Input label="Data" readOnly value={item.dataRecebimento} />
      </div>

      <div className="form-columns">
        <Input disabled={!canEdit} label="Conferente" onChange={(event) => onConferenteChange(event.target.value)} value={item.conferente} />
        <Input label="Total recebido" readOnly value={String(totalRecebido)} />
        <Input label="Total conferido" readOnly value={String(totalConferido)} />
      </div>

      <div className="table-shell">
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

      <label className="field">
        <span>Observacoes da conferencia</span>
        <textarea className="input-control text-area" disabled={!canEdit} onChange={(event) => onObservacoesChange(event.target.value)} rows={3} value={item.observacoes} />
      </label>

      {canEdit ? (
        <div className="form-actions">
          <Button onClick={onSubmit}>Salvar conferencia</Button>
        </div>
      ) : null}
    </div>
  );
}
