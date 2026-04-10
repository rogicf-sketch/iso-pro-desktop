import { useCallback, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { Select } from '../../../components/ui/Select';
import { useAuth } from '../../auth/hooks/useAuth';
import { buscarRecebimentoPorId, listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import type { Recebimento, RecebimentoListItem } from '../../recebimentos/types/recebimento.types';
import { getEtiquetaPreset } from '../services/etiquetas.service';
import type { EtiquetaCodigosOpcao, EtiquetaFormato, EtiquetaModelo } from '../types/etiqueta.types';
import {
  imprimirEtiquetasRecebimentoHtml,
  montarHtmlEtiquetasItensRecebimento,
  quantidadeExibidaEtiquetaItem,
} from '../utils/imprimirEtiquetasRecebimento';

export function EtiquetasRecebimentoPanel() {
  const { canAccessAction } = useAuth();
  const podeEtiqueta = canAccessAction('etiquetas', 'editar');
  const podeReceb = canAccessAction('recebimentos', 'visualizar');

  const [buscaReceb, setBuscaReceb] = useState('');
  const [listaRecebimentos, setListaRecebimentos] = useState<RecebimentoListItem[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [recebimentoAtual, setRecebimentoAtual] = useState<Recebimento | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [modelo, setModelo] = useState<EtiquetaModelo>('industrial');
  const [formato, setFormato] = useState<EtiquetaFormato>('a4_2col');
  const [copiasPorItem, setCopiasPorItem] = useState(1);
  const [codigosNaEtiqueta, setCodigosNaEtiqueta] = useState<EtiquetaCodigosOpcao>('ambos');
  const [logoNaEtiqueta, setLogoNaEtiqueta] = useState(true);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const preset = useMemo(() => getEtiquetaPreset(modelo, formato), [modelo, formato]);

  const buscarListaRecebimentos = useCallback(async () => {
    if (!podeReceb) {
      setMsg('Sem permissao para consultar recebimentos.');
      return;
    }
    setMsg('');
    setCarregandoLista(true);
    setRecebimentoAtual(null);
    setSelectedItemIds(new Set());
    setPreviewHtml(null);
    const result = await listarRecebimentos({
      busca: buscaReceb,
      status: 'todos',
      modo: 'todos',
      page: 1,
      pageSize: 80,
    });
    setCarregandoLista(false);
    if (!result.success || !result.data) {
      setMsg(result.error ?? 'Nao foi possivel buscar recebimentos.');
      setListaRecebimentos([]);
      return;
    }
    setListaRecebimentos(result.data.items);
    if (!result.data.items.length) {
      setMsg('Nenhum recebimento encontrado para esta busca (NF, romaneio ou fornecedor).');
    }
  }, [buscaReceb, podeReceb]);

  const carregarItensRecebimento = useCallback(
    async (id: string) => {
      if (!podeReceb) return;
      setCarregandoDetalhe(true);
      setMsg('');
      setPreviewHtml(null);
      setSelectedItemIds(new Set());
      const result = await buscarRecebimentoPorId(id);
      setCarregandoDetalhe(false);
      if (!result.success || !result.data) {
        setMsg(result.error ?? 'Recebimento nao encontrado.');
        setRecebimentoAtual(null);
        return;
      }
      setRecebimentoAtual(result.data);
      const todos = new Set(result.data.itens.map((i) => i.id));
      setSelectedItemIds(todos);
    },
    [podeReceb],
  );

  const itensSelecionados = useMemo(() => {
    if (!recebimentoAtual) return [];
    return recebimentoAtual.itens.filter((i) => selectedItemIds.has(i.id));
  }, [recebimentoAtual, selectedItemIds]);

  function toggleItem(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selecionarTodosItens() {
    if (!recebimentoAtual) return;
    setSelectedItemIds(new Set(recebimentoAtual.itens.map((i) => i.id)));
  }

  function limparSelecaoItens() {
    setSelectedItemIds(new Set());
  }

  async function gerarPreview() {
    if (!podeEtiqueta) {
      setMsg('Sem permissao para gerar etiquetas.');
      return;
    }
    if (!recebimentoAtual || !itensSelecionados.length) {
      setMsg('Selecione um recebimento e ao menos um item.');
      setPreviewHtml(null);
      return;
    }
    setMsg('');
    const html = await montarHtmlEtiquetasItensRecebimento({
      recebimento: {
        notaFiscal: recebimentoAtual.notaFiscal,
        romaneio: recebimentoAtual.romaneio,
        fornecedor: recebimentoAtual.fornecedor,
        dataRecebimento: recebimentoAtual.dataRecebimento,
      },
      itens: itensSelecionados,
      modelo,
      formato,
      larguraMm: preset.larguraMm,
      alturaMm: preset.alturaMm,
      copiasPorItem,
      codigos: codigosNaEtiqueta,
      logoNaEtiqueta,
    });
    setPreviewHtml(html);
  }

  async function imprimirDoc() {
    if (!podeEtiqueta) return;
    if (!recebimentoAtual || !itensSelecionados.length) {
      setMsg('Selecione ao menos um item.');
      return;
    }
    setMsg('');
    const html = await montarHtmlEtiquetasItensRecebimento({
      recebimento: {
        notaFiscal: recebimentoAtual.notaFiscal,
        romaneio: recebimentoAtual.romaneio,
        fornecedor: recebimentoAtual.fornecedor,
        dataRecebimento: recebimentoAtual.dataRecebimento,
      },
      itens: itensSelecionados,
      modelo,
      formato,
      larguraMm: preset.larguraMm,
      alturaMm: preset.alturaMm,
      copiasPorItem,
      codigos: codigosNaEtiqueta,
      logoNaEtiqueta,
    });
    if (!imprimirEtiquetasRecebimentoHtml(html)) {
      setMsg('Nao foi possivel abrir a janela de impressao. Verifique o bloqueador de popups.');
    }
  }

  if (!podeEtiqueta && !podeReceb) {
    return null;
  }

  return (
    <div className="section-block" style={{ marginBottom: 24 }}>
      <h3 className="panel-kicker" style={{ marginBottom: 8 }}>
        Impressao a partir de recebimentos
      </h3>
      <p className="panel-copy" style={{ marginBottom: 12 }}>
        Busca inteligente por NF, romaneio ou fornecedor (trechos, segmentos e numeros flexiveis, como na consulta mobile). Abra um recebimento
        para listar os itens, marque os que deseja etiquetar, escolha modelo e formato e gere a pre-visualizacao.
      </p>

      <div className="filters-grid" style={{ marginBottom: 12 }}>
        <Input
          label="Buscar recebimento"
          onChange={(e) => setBuscaReceb(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void buscarListaRecebimentos();
          }}
          placeholder="NF, romaneio ou fornecedor (busca inteligente)"
          value={buscaReceb}
        />
        <div className="form-actions" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Button disabled={!podeReceb || carregandoLista} onClick={() => void buscarListaRecebimentos()} type="button">
            {carregandoLista ? 'Buscando...' : 'Buscar recebimentos'}
          </Button>
        </div>
      </div>

      {listaRecebimentos.length > 0 ? (
        <div className="table-shell" style={{ marginBottom: 16 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>NF</th>
                <th>Data</th>
                <th>Fornecedor</th>
                <th>Status</th>
                <th>Itens</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {listaRecebimentos.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.notaFiscal || '—'}</strong>
                  </td>
                  <td>{r.dataRecebimento}</td>
                  <td>{r.fornecedor}</td>
                  <td>{r.status}</td>
                  <td>{r.totalItens}</td>
                  <td>
                    <Button
                      onClick={() => void carregarItensRecebimento(r.id)}
                      type="button"
                      variant={recebimentoAtual?.id === r.id ? 'primary' : 'ghost'}
                    >
                      {recebimentoAtual?.id === r.id ? 'Carregado' : 'Ver itens'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {carregandoDetalhe ? <OperationalNotice>Carregando itens...</OperationalNotice> : null}

      {recebimentoAtual ? (
        <>
          <OperationalNotice>
            Recebimento selecionado: NF <strong>{recebimentoAtual.notaFiscal || '—'}</strong> — {recebimentoAtual.fornecedor} —{' '}
            {recebimentoAtual.itens.length} item(ns). Marque os que deseja imprimir.
            {' As etiquetas usam a quantidade recebida registrada neste recebimento.'}
          </OperationalNotice>

          <div className="form-actions" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
            <Button onClick={selecionarTodosItens} type="button" variant="ghost">
              Selecionar todos os itens
            </Button>
            <Button onClick={limparSelecaoItens} type="button" variant="ghost">
              Limpar selecao
            </Button>
          </div>

          <div className="table-shell" style={{ marginBottom: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th>Codigo</th>
                  <th>Descricao</th>
                  <th title="Quantidade recebida no recebimento (valor impresso na etiqueta)">
                    Qtd etiqueta
                  </th>
                  <th>Un</th>
                  <th>Localizacao</th>
                  <th>Disciplina</th>
                </tr>
              </thead>
              <tbody>
                {recebimentoAtual.itens.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <input
                        aria-label={`Selecionar ${it.codigoMaterial}`}
                        checked={selectedItemIds.has(it.id)}
                        onChange={() => toggleItem(it.id)}
                        type="checkbox"
                      />
                    </td>
                    <td>{it.codigoMaterial}</td>
                    <td>{it.descricaoMaterial}</td>
                    <td>{quantidadeExibidaEtiquetaItem(it)}</td>
                    <td>{it.unidade}</td>
                    <td>{it.localizacao}</td>
                    <td>{it.disciplina}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="form-columns" style={{ marginBottom: 12 }}>
            <Select label="Modelo" onChange={(e) => setModelo(e.target.value as EtiquetaModelo)} value={modelo}>
              <option value="simples">Simples</option>
              <option value="colorido">Neutro refinado</option>
              <option value="industrial">Industrial</option>
              <option value="cartao">Cartao</option>
              <option value="segregacao">Segregacao — etiqueta mostra «Segregado»</option>
              <option value="liberacao">Liberacao — etiqueta mostra «Liberado»</option>
            </Select>
            <Select label="Formato" onChange={(e) => setFormato(e.target.value as EtiquetaFormato)} value={formato}>
              <option value="a4_2col">A4 2 colunas</option>
              <option value="a4_1col">A4 1 coluna</option>
              <option value="termica_58">Termica 58mm</option>
              <option value="termica_80">Termica 80mm</option>
            </Select>
            <Input
              label="Copias por item"
              min={1}
              onChange={(e) => setCopiasPorItem(Math.max(1, Number(e.target.value) || 1))}
              type="number"
              value={String(copiasPorItem)}
            />
            <Select
              label="Codigos na etiqueta"
              onChange={(e) => setCodigosNaEtiqueta(e.target.value as EtiquetaCodigosOpcao)}
              value={codigosNaEtiqueta}
            >
              <option value="nenhum">Nenhum</option>
              <option value="codigo_barras">Somente codigo de barras</option>
              <option value="qrcode">Somente QR Code</option>
              <option value="ambos">Codigo de barras e QR Code</option>
            </Select>
          </div>

          <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input
              checked={logoNaEtiqueta}
              onChange={(e) => setLogoNaEtiqueta(e.target.checked)}
              type="checkbox"
            />
            <span>Mostrar logo da empresa em cada etiqueta (defina o logo em Configuracoes)</span>
          </label>

          <div className="form-actions" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
            <Button disabled={!podeEtiqueta || !itensSelecionados.length} onClick={() => void gerarPreview()} type="button">
              Gerar pre-visualizacao
            </Button>
            <Button disabled={!podeEtiqueta || !itensSelecionados.length} onClick={() => void imprimirDoc()} type="button">
              Imprimir
            </Button>
          </div>

          {previewHtml ? (
            <div className="editor-block">
              <p className="panel-copy" style={{ marginBottom: 8 }}>
                Pre-visualizacao ({itensSelecionados.length} item(ns), {copiasPorItem} copia(s) cada)
              </p>
              <iframe
                sandbox="allow-same-origin allow-scripts allow-modals"
                srcDoc={previewHtml}
                style={{
                  backgroundColor: '#e8edf3',
                  border: '1px solid var(--border-subtle, #cbd5e1)',
                  borderRadius: 8,
                  minHeight: 360,
                  width: '100%',
                }}
                title="Pre-visualizacao etiquetas recebimento"
              />
            </div>
          ) : null}
        </>
      ) : null}

      {msg ? <OperationalNotice tone="warning">{msg}</OperationalNotice> : null}
    </div>
  );
}
