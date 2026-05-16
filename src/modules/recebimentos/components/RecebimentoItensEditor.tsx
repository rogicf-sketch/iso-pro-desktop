import { useEffect, useRef } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { buscarMaterialPorLeituraCodigo } from '../../materiais/services/materiais.service';
import { roundPesoKg } from '../../../lib/parseDecimal';
import type { RecebimentoItem } from '../types/recebimento.types';

type Props = {
  items: RecebimentoItem[];
  onChange: (items: RecebimentoItem[]) => void;
  readOnly?: boolean;
  /** Em modo direto nao destacamos diferenca entre qtd recebida e conferida (sem fluxo de conferencia). */
  modoRecebimento?: 'direto' | 'aguardando_conferencia';
  /** Quando false, omite o titulo no cabecalho (ex.: secao pai com `rir-card-title`). */
  showHeading?: boolean;
};

function createEmptyItem(): RecebimentoItem {
  return {
    id: crypto.randomUUID(),
    codigoMaterial: '',
    descricaoMaterial: '',
    unidade: 'UN',
    disciplina: '',
    localizacao: '',
    quantidadeRecebida: 0,
    quantidadeConferida: 0,
    pesoUnitario: 0,
    pesoTotal: 0,
    certificado: '',
    observacaoItem: '',
  };
}

export function RecebimentoItensEditor({
  items,
  onChange,
  readOnly = false,
  modoRecebimento,
  showHeading = true,
}: Props) {
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const puxandoCadastroRef = useRef<Set<string>>(new Set());

  async function aoSairDoCodigoMaterial(itemId: string) {
    if (readOnly) return;
    const item = itemsRef.current.find((i) => i.id === itemId);
    if (!item) return;
    const codigo = item.codigoMaterial.trim();
    if (!codigo) return;
    if (puxandoCadastroRef.current.has(itemId)) return;
    puxandoCadastroRef.current.add(itemId);
    try {
      const result = await buscarMaterialPorLeituraCodigo(codigo);
      if (!result.success || !result.data) return;
      const m = result.data;
      const qtd = Number(item.quantidadeRecebida) || 0;
      const pu = Number(m.peso) || 0;
      onChange(
        itemsRef.current.map((row) => {
          if (row.id !== itemId) return row;
          const next: RecebimentoItem = { ...row };
          if (m.disciplina.trim()) next.disciplina = m.disciplina.trim();
          if (m.unidade.trim()) next.unidade = m.unidade.trim();
          if (!row.descricaoMaterial.trim() && m.descricao.trim()) {
            next.descricaoMaterial = m.descricao.trim();
          }
          if (pu > 0) {
            next.pesoUnitario = pu;
            next.pesoTotal = roundPesoKg(qtd * pu);
          }
          return next;
        }),
      );
    } finally {
      puxandoCadastroRef.current.delete(itemId);
    }
  }

  function updateItem(id: string, patch: Partial<RecebimentoItem>) {
    onChange(
      items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch } as RecebimentoItem;
        if ('pesoTotal' in patch && !('quantidadeRecebida' in patch) && !('pesoUnitario' in patch)) {
          return {
            ...next,
            pesoTotal: roundPesoKg(Number(next.pesoTotal) || 0),
            pesoUnitario: roundPesoKg(Number(next.pesoUnitario) || 0),
          };
        }
        if ('quantidadeRecebida' in patch || 'pesoUnitario' in patch) {
          const q = Number(next.quantidadeRecebida) || 0;
          const pu = Number(next.pesoUnitario) || 0;
          next.pesoTotal = roundPesoKg(q * pu);
        }
        return next;
      }),
    );
  }

  function addItem() {
    onChange([...items, createEmptyItem()]);
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  const headerComConteudo = showHeading || !readOnly;

  return (
    <div className="editor-block">
      {headerComConteudo ? (
        <div className="editor-header">
          {showHeading ? <strong>Itens do recebimento</strong> : <span aria-hidden />}
          {readOnly ? null : (
            <Button onClick={addItem} type="button" variant="ghost">
              Adicionar item
            </Button>
          )}
        </div>
      ) : null}

      <div className="editor-list">
        {items.map((item) => {
          const linhaComFaltaConferencia =
            readOnly &&
            modoRecebimento !== 'direto' &&
            Number(item.quantidadeRecebida) > 0 &&
            Number(item.quantidadeConferida) < Number(item.quantidadeRecebida);
          return (
          <div
            className={linhaComFaltaConferencia ? 'editor-item editor-item--conferencia-falta' : 'editor-item'}
            key={item.id}
          >
            <div className="form-columns">
              <Input
                disabled={readOnly}
                label="Codigo"
                onBlur={() => void aoSairDoCodigoMaterial(item.id)}
                onChange={(event) => updateItem(item.id, { codigoMaterial: event.target.value })}
                title="Ao sair do campo, disciplina, unidade e peso sao preenchidos a partir do cadastro de materiais (codigo ativo)."
                value={item.codigoMaterial}
              />
              <Input
                disabled={readOnly}
                label="Descricao"
                onChange={(event) => updateItem(item.id, { descricaoMaterial: event.target.value })}
                value={item.descricaoMaterial}
              />
              <Input
                disabled={readOnly}
                label="Unidade"
                onChange={(event) => updateItem(item.id, { unidade: event.target.value })}
                value={item.unidade}
              />
            </div>

            <div className="form-columns">
              <Input
                disabled={readOnly}
                label="Disciplina"
                onChange={(event) => updateItem(item.id, { disciplina: event.target.value })}
                value={item.disciplina}
              />
              <Input
                disabled={readOnly}
                label="Localizacao"
                onChange={(event) => updateItem(item.id, { localizacao: event.target.value })}
                placeholder="Ex.: A-12 / Prateleira 3"
                value={item.localizacao}
              />
              <Input
                disabled={readOnly}
                label="Qtd. recebida"
                min="0"
                onChange={(event) => updateItem(item.id, { quantidadeRecebida: Number(event.target.value || 0) })}
                step="0.001"
                type="number"
                value={String(item.quantidadeRecebida)}
              />
              <Input
                disabled={readOnly}
                label="Qtd. conferida"
                min="0"
                onChange={(event) => updateItem(item.id, { quantidadeConferida: Number(event.target.value || 0) })}
                step="0.001"
                type="number"
                value={String(item.quantidadeConferida)}
              />
              <Input
                disabled={readOnly}
                label="Peso unitario (kg)"
                min="0"
                onChange={(event) =>
                  updateItem(item.id, { pesoUnitario: roundPesoKg(Number(event.target.value || 0)) })
                }
                step="0.01"
                title="Em campos numericos do navegador o separador decimal e o ponto (ex.: 2.39 kg)."
                type="number"
                value={String(item.pesoUnitario ?? 0)}
              />
              <Input
                disabled={readOnly}
                label="Peso total (kg)"
                min="0"
                onChange={(event) =>
                  updateItem(item.id, { pesoTotal: roundPesoKg(Number(event.target.value || 0)) })
                }
                step="0.01"
                title="Calculado como quantidade x peso unitario; arredondado a 2 casas. O ponto e decimal (ex.: 14.82), nao milhar."
                type="number"
                value={String(item.pesoTotal ?? 0)}
              />
              <Input
                disabled={readOnly}
                label="Certificado"
                onChange={(event) => updateItem(item.id, { certificado: event.target.value })}
                placeholder="Nº ou referencia (opcional)"
                value={item.certificado ?? ''}
              />
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Observacao do item</span>
                <textarea
                  className="input-control"
                  disabled={readOnly}
                  rows={2}
                  title="Notas por linha (ex.: divergencia na conferencia). Aparece no app campo ao conferir."
                  placeholder="Opcional — motivo de diferenca de quantidade, embalagem, etc."
                  value={item.observacaoItem ?? ''}
                  onChange={(event) => updateItem(item.id, { observacaoItem: event.target.value })}
                />
              </label>
            </div>

            {readOnly ? null : (
              <Button onClick={() => removeItem(item.id)} type="button" variant="danger">
                Remover item
              </Button>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
