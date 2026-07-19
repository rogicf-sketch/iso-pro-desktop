import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import {
  buscarMaterialPorLeituraCodigo,
  carregarMateriaisDoCadastro,
} from '../../materiais/services/materiais.service';
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
    localizacao: '',
  };
}

function statusPlanejamentoLinhaMeta(status: ReturnType<typeof resolverStatusLinhaDocumento>) {
  if (status === 'atendido') return createStatusMeta('Atendido', 'ok');
  if (status === 'recebido') return createStatusMeta('Recebido', 'info');
  if (status === 'parcial') return createStatusMeta('Parcial', 'warning');
  return createStatusMeta('Pendente', 'danger');
}

type RascunhoNovoItem = {
  codigoMaterial: string;
  descricaoMaterial: string;
  unidade: string;
  quantidadeProjeto: string;
};

const rascunhoVazio = (): RascunhoNovoItem => ({
  codigoMaterial: '',
  descricaoMaterial: '',
  unidade: 'UN',
  quantidadeProjeto: '',
});

export function DocumentoItensEditor({ items, onChange, metricasPorCodigo }: Props) {
  const [painelNovoAberto, setPainelNovoAberto] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoNovoItem>(rascunhoVazio);
  const [erroPainel, setErroPainel] = useState('');
  const [materiaisOpcoes, setMateriaisOpcoes] = useState<{ value: string; label: string }[]>([]);
  const [carregandoCadastro, setCarregandoCadastro] = useState(false);
  const painelRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  const puxandoCadastroRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!painelNovoAberto) return;
    let cancel = false;
    setCarregandoCadastro(true);
    void carregarMateriaisDoCadastro()
      .then((lista) => {
        if (cancel) return;
        const opcoes = lista
          .filter((m) => m.ativo !== false && m.codigo.trim())
          .map((m) => ({
            value: m.codigo.trim(),
            label: `${m.codigo.trim()} — ${m.descricao.trim() || '(sem descricao)'}`,
          }))
          .sort((a, b) => a.value.localeCompare(b.value, 'pt-BR'));
        setMateriaisOpcoes(opcoes);
      })
      .catch(() => {
        if (!cancel) setMateriaisOpcoes([]);
      })
      .finally(() => {
        if (!cancel) setCarregandoCadastro(false);
      });
    return () => {
      cancel = true;
    };
  }, [painelNovoAberto]);

  useEffect(() => {
    if (!painelNovoAberto) return;
    painelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [painelNovoAberto]);

  const codigosJaNoDocumento = useMemo(
    () => new Set(items.map((item) => item.codigoMaterial.trim().toLowerCase()).filter(Boolean)),
    [items],
  );

  function updateItem(id: string, patch: Partial<DocumentoItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function aoSairDoCodigoMaterial(itemId: string) {
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
      onChange(
        itemsRef.current.map((row) => {
          if (row.id !== itemId) return row;
          return {
            ...row,
            codigoMaterial: m.codigo.trim() || row.codigoMaterial,
            descricaoMaterial: m.descricao.trim() || row.descricaoMaterial,
            unidade: m.unidade.trim() || row.unidade || 'UN',
          };
        }),
      );
    } finally {
      puxandoCadastroRef.current.delete(itemId);
    }
  }

  function abrirPainelNovo() {
    setErroPainel('');
    setRascunho(rascunhoVazio());
    setPainelNovoAberto(true);
  }

  function fecharPainelNovo() {
    setPainelNovoAberto(false);
    setErroPainel('');
    setRascunho(rascunhoVazio());
  }

  function aoEscolherMaterial(codigo: string) {
    const opt = materiaisOpcoes.find((o) => o.value === codigo);
    const label = opt?.label ?? codigo;
    const sep = label.indexOf(' — ');
    const descricao = sep >= 0 ? label.slice(sep + 3).trim() : '';
    setRascunho((atual) => ({
      ...atual,
      codigoMaterial: codigo,
      descricaoMaterial: descricao && descricao !== '(sem descricao)' ? descricao : atual.descricaoMaterial,
    }));
    void (async () => {
      const result = await buscarMaterialPorLeituraCodigo(codigo);
      if (!result.success || !result.data) return;
      const m = result.data;
      setRascunho((atual) => ({
        ...atual,
        codigoMaterial: m.codigo.trim() || atual.codigoMaterial,
        descricaoMaterial: m.descricao.trim() || atual.descricaoMaterial,
        unidade: m.unidade.trim() || atual.unidade || 'UN',
      }));
    })();
  }

  function aoDigitarCodigo(query: string) {
    const q = query.trim();
    if (!q) return;
    const exact = materiaisOpcoes.find((o) => o.value.toLowerCase() === q.toLowerCase());
    if (exact && exact.value !== rascunho.codigoMaterial) {
      aoEscolherMaterial(exact.value);
    }
  }

  function confirmarNovoItem() {
    setErroPainel('');
    const codigo = rascunho.codigoMaterial.trim();
    const descricao = rascunho.descricaoMaterial.trim();
    const unidade = rascunho.unidade.trim() || 'UN';
    const qtd = Number(rascunho.quantidadeProjeto.replace(',', '.'));
    if (!codigo) {
      setErroPainel('Selecione ou informe o codigo do material.');
      return;
    }
    if (!descricao) {
      setErroPainel('Informe a descricao do material.');
      return;
    }
    if (!Number.isFinite(qtd) || qtd <= 0) {
      setErroPainel('Informe uma quantidade valida maior que zero.');
      return;
    }
    if (codigosJaNoDocumento.has(codigo.toLowerCase())) {
      setErroPainel(`O material ${codigo} ja esta neste documento. Altere a quantidade na linha existente.`);
      return;
    }
    const novo: DocumentoItem = {
      ...createEmptyItem(),
      codigoMaterial: codigo,
      descricaoMaterial: descricao,
      unidade,
      quantidadeProjeto: qtd,
    };
    onChange([novo, ...items]);
    fecharPainelNovo();
  }

  function removeItem(id: string) {
    const alvo = items.find((item) => item.id === id);
    if (alvo && Number(alvo.quantidadeAtendida) > 0) return;
    onChange(items.filter((item) => item.id !== id));
  }

  return (
    <div className="editor-block">
      <div className="editor-header">
        <strong>Itens do documento</strong>
        <Button disabled={painelNovoAberto} onClick={abrirPainelNovo} type="button" variant="ghost">
          Adicionar item
        </Button>
      </div>

      {painelNovoAberto ? (
        <div
          className="editor-item"
          ref={painelRef}
          style={{
            marginBottom: 16,
            borderColor: 'rgba(56, 170, 255, 0.45)',
            background: 'rgba(30, 159, 255, 0.08)',
          }}
        >
          <strong style={{ display: 'block', marginBottom: 10 }}>Novo item</strong>
          <p className="panel-copy" style={{ marginBottom: 12, fontSize: '0.9rem' }}>
            Busque no cadastro (digite codigo ou descricao), confirme a quantidade e adicione. Depois ajuste a revisao
            do documento no cabecalho, se estiver a subir revisao.
          </p>
          <div className="form-columns">
            <SearchableSelect
              disabled={carregandoCadastro}
              label={carregandoCadastro ? 'Codigo (a carregar cadastro…)' : 'Codigo (cadastro)'}
              onChange={aoEscolherMaterial}
              onQueryChange={aoDigitarCodigo}
              options={materiaisOpcoes}
              placeholder="Digite codigo ou cole do cadastro"
              value={rascunho.codigoMaterial}
            />
            <Input
              label="Descricao"
              onChange={(event) => setRascunho((atual) => ({ ...atual, descricaoMaterial: event.target.value }))}
              value={rascunho.descricaoMaterial}
            />
            <Input
              label="Unidade"
              onChange={(event) => setRascunho((atual) => ({ ...atual, unidade: event.target.value }))}
              value={rascunho.unidade}
            />
          </div>
          <div className="form-columns" style={{ marginTop: 8 }}>
            <Input
              label="Quantidade do documento"
              min="0"
              onChange={(event) => setRascunho((atual) => ({ ...atual, quantidadeProjeto: event.target.value }))}
              step="0.001"
              type="number"
              value={rascunho.quantidadeProjeto}
            />
          </div>
          {erroPainel ? (
            <div className="error-box" style={{ marginTop: 10 }}>
              {erroPainel}
            </div>
          ) : null}
          <div className="form-actions" style={{ marginTop: 12 }}>
            <Button onClick={fecharPainelNovo} type="button" variant="ghost">
              Cancelar
            </Button>
            <Button onClick={confirmarNovoItem} type="button">
              Adicionar ao documento
            </Button>
          </div>
        </div>
      ) : null}

      <div className="editor-list">
        {items.map((item) => {
          const statusLinha =
            metricasPorCodigo && item.codigoMaterial.trim()
              ? resolverStatusLinhaDocumento(item, metricasPorCodigo)
              : null;
          const atendida = Math.max(0, Number(item.quantidadeAtendida) || 0);
          const podeRemover = atendida <= 0;

          return (
            <div className="editor-item" key={item.id}>
              <div className="form-columns">
                <Input
                  label="Codigo"
                  onBlur={() => void aoSairDoCodigoMaterial(item.id)}
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

              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Localização no estoque (separação) — opcional</span>
                <textarea
                  className="input-control"
                  onChange={(event) => updateItem(item.id, { localizacao: event.target.value })}
                  placeholder={
                    'Na folha de campo, o sistema usa primeiro as localizações dos recebimentos (várias NFs). Preencha aqui só como complemento quando ainda não houver recebimento com endereço para este código.'
                  }
                  rows={3}
                  spellCheck={false}
                  value={item.localizacao ?? ''}
                />
              </label>

              <div className="form-columns">
                <Input
                  label="Quantidade do documento"
                  min={String(atendida)}
                  onChange={(event) => {
                    const next = Number(event.target.value || 0);
                    updateItem(item.id, { quantidadeProjeto: Math.max(atendida, next) });
                  }}
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

              {podeRemover ? (
                <Button onClick={() => removeItem(item.id)} type="button" variant="danger">
                  Remover item
                </Button>
              ) : (
                <p className="panel-copy" style={{ marginTop: 8, fontSize: '0.85rem', opacity: 0.85 }}>
                  Item com atendimento: nao pode ser removido. Pode aumentar a quantidade ou subir a revisao do
                  documento.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
