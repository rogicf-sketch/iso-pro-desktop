import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { LISTA_BUSCA_DEBOUNCE_MS } from '../../../lib/listaBuscaDebounce';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
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
import { IconFullscreenEnter, IconFullscreenExit } from '../../../components/ui/FullscreenIcons';

type EtiquetaPreviewChromeProps = {
  copiasPorItem: number;
  iframeMinHeight: number;
  itemCount: number;
  onOpenLightbox?: () => void;
  previewHtml: string;
};

function EtiquetaRecebimentoPreviewChrome({
  copiasPorItem,
  iframeMinHeight,
  itemCount,
  onOpenLightbox,
  previewHtml,
}: EtiquetaPreviewChromeProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [browserFs, setBrowserFs] = useState(false);

  useEffect(() => {
    function sync() {
      setBrowserFs(document.fullscreenElement === shellRef.current);
    }
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  async function toggleBrowserFullscreen() {
    const el = shellRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      /* API indisponível ou recusada */
    }
  }

  const isLightbox = !onOpenLightbox;
  const iframeStyle: CSSProperties = {
    backgroundColor: '#e8edf3',
    border: '1px solid var(--border-subtle, #cbd5e1)',
    borderRadius: 8,
    display: 'block',
    width: '100%',
  };
  if (browserFs) {
    iframeStyle.height = '100%';
  } else if (isLightbox) {
    iframeStyle.minHeight = 0;
    iframeStyle.height = '100%';
  } else {
    iframeStyle.minHeight = iframeMinHeight;
  }

  return (
    <div className="etiqueta-preview-shell" ref={shellRef}>
      <div className="etiqueta-preview-toolbar">
        <p className="etiqueta-preview-toolbar__meta">
          Pre-visualizacao ({itemCount} item(ns), {copiasPorItem} copia(s) cada)
        </p>
        <div className="etiqueta-preview-toolbar__actions">
          <button
            aria-label={browserFs ? 'Sair da tela inteira' : 'Tela inteira (pre-visualizacao)'}
            className="icon-button"
            onClick={() => void toggleBrowserFullscreen()}
            title={browserFs ? 'Sair da tela inteira' : 'Tela inteira'}
            type="button"
          >
            <span className="etiqueta-preview-fs-icon">{browserFs ? <IconFullscreenExit /> : <IconFullscreenEnter />}</span>
          </button>
          {onOpenLightbox ? (
            <Button onClick={onOpenLightbox} type="button" variant="ghost">
              Tela grande
            </Button>
          ) : null}
        </div>
      </div>
      <div className={onOpenLightbox ? 'etiqueta-preview-scroll' : 'etiqueta-preview-scroll etiqueta-preview-scroll--lightbox'}>
        <iframe
          sandbox="allow-same-origin allow-scripts allow-modals"
          srcDoc={previewHtml}
          style={iframeStyle}
          title="Pre-visualizacao etiquetas recebimento"
        />
      </div>
    </div>
  );
}

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
  const [previewLightboxOpen, setPreviewLightboxOpen] = useState(false);
  const [msg, setMsg] = useState('');

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listaBuscaSeqRef = useRef(0);

  useEffect(() => {
    if (!previewHtml) setPreviewLightboxOpen(false);
  }, [previewHtml]);

  const preset = useMemo(() => getEtiquetaPreset(modelo, formato), [modelo, formato]);

  const runListBuscaRecebimentos = useCallback(
    async (busca: string, resetSelecao: boolean) => {
      if (!podeReceb) {
        setMsg('Sem permissao para consultar recebimentos.');
        return;
      }
      const seq = ++listaBuscaSeqRef.current;
      setMsg('');
      setCarregandoLista(true);
      if (resetSelecao) {
        setRecebimentoAtual(null);
        setSelectedItemIds(new Set());
        setPreviewHtml(null);
      }
      const result = await listarRecebimentos({
        busca,
        status: 'todos',
        modo: 'todos',
        page: 1,
        pageSize: 80,
      });
      if (seq !== listaBuscaSeqRef.current) return;
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
    },
    [podeReceb],
  );

  useEffect(() => {
    if (!podeReceb) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const q = buscaReceb.trim();
      if (q.length < 1) {
        listaBuscaSeqRef.current += 1;
        setListaRecebimentos([]);
        setMsg('');
        setCarregandoLista(false);
        return;
      }
      void runListBuscaRecebimentos(q, false);
    }, LISTA_BUSCA_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [buscaReceb, podeReceb, runListBuscaRecebimentos]);

  const buscarListaRecebimentos = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    void runListBuscaRecebimentos(buscaReceb.trim(), true);
  }, [buscaReceb, runListBuscaRecebimentos]);

  /** Mantem o texto e a lista de resultados; so fecha o recebimento e a pre-visualizacao para escolher outra NF na mesma lista. */
  const fecharRecebimentoSelecionado = useCallback(() => {
    setRecebimentoAtual(null);
    setSelectedItemIds(new Set());
    setPreviewHtml(null);
    setMsg('');
  }, []);

  /** Campo vazio, sem lista, sem recebimento — estado inicial da busca. */
  const limparBuscaEResultados = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    listaBuscaSeqRef.current += 1;
    setBuscaReceb('');
    setListaRecebimentos([]);
    setRecebimentoAtual(null);
    setSelectedItemIds(new Set());
    setPreviewHtml(null);
    setMsg('');
    setCarregandoLista(false);
  }, []);

  const podeLimparBusca =
    Boolean(buscaReceb.trim()) || listaRecebimentos.length > 0 || recebimentoAtual !== null || Boolean(previewHtml);

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
    <div className="section-block rir-form-professional" style={{ marginBottom: 24 }}>
      <h3 className="panel-kicker" style={{ marginBottom: 8 }}>
        Impressao a partir de recebimentos
      </h3>
      <ModuleHelp>
        <p className="panel-copy" style={{ marginBottom: 12 }}>
          Busca inteligente por NF, romaneio ou fornecedor (trechos, segmentos e numeros flexiveis, como na consulta mobile). Os resultados
          aparecem automaticamente apos uma breve pausa ao digitar (~{LISTA_BUSCA_DEBOUNCE_MS} ms); tambem pode usar <strong>Enter</strong> ou{' '}
          <strong>Buscar recebimentos</strong> (inclui busca com campo vazio — primeiros registos). Use <strong>Limpar busca</strong> para
          esconder a lista e voltar ao estado inicial; com um recebimento aberto, <strong>Outra NF</strong> fecha so esse recebimento e mantem
          a lista para escolher outra linha. Abra um recebimento para listar os itens, marque os que deseja etiquetar, escolha modelo e formato
          e gere a pre-visualizacao.
        </p>
      </ModuleHelp>

      <div className="filters-grid" style={{ marginBottom: 12 }}>
        <Input
          label="Buscar recebimento"
          onChange={(e) => setBuscaReceb(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void buscarListaRecebimentos();
          }}
          placeholder="Digite NF, romaneio ou fornecedor — lista apos pausa ou Enter"
          value={buscaReceb}
        />
        <div className="form-actions" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <Button disabled={!podeReceb || carregandoLista} onClick={() => void buscarListaRecebimentos()} type="button">
            {carregandoLista ? 'Buscando...' : 'Buscar recebimentos'}
          </Button>
          <Button
            disabled={!podeReceb || !podeLimparBusca}
            onClick={limparBuscaEResultados}
            type="button"
            variant="ghost"
          >
            Limpar busca
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

          <div className="form-actions" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <Button onClick={fecharRecebimentoSelecionado} type="button" variant="ghost">
              Outra NF (voltar à lista de recebimentos)
            </Button>
            <Button disabled={!podeReceb} onClick={limparBuscaEResultados} type="button" variant="ghost">
              Limpar busca e nova pesquisa
            </Button>
          </div>

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

          <section className="rir-card">
            <h4 className="rir-card-title">Modelo e impressao</h4>
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

            <div className="form-actions" style={{ flexWrap: 'wrap', marginBottom: 0 }}>
              <Button disabled={!podeEtiqueta || !itensSelecionados.length} onClick={() => void gerarPreview()} type="button">
                Gerar pre-visualizacao
              </Button>
              <Button disabled={!podeEtiqueta || !itensSelecionados.length} onClick={() => void imprimirDoc()} type="button">
                Imprimir
              </Button>
            </div>
          </section>

          {previewHtml ? (
            <div className="editor-block" style={{ marginTop: 4 }}>
              <EtiquetaRecebimentoPreviewChrome
                copiasPorItem={copiasPorItem}
                iframeMinHeight={440}
                itemCount={itensSelecionados.length}
                onOpenLightbox={() => setPreviewLightboxOpen(true)}
                previewHtml={previewHtml}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {previewHtml ? (
        <Modal
          onClose={() => {
            if (document.fullscreenElement) {
              void document.exitFullscreen().catch(() => undefined);
            }
            setPreviewLightboxOpen(false);
          }}
          open={previewLightboxOpen}
          size="fullscreen"
          title="Pre-visualizacao de etiquetas"
        >
          <EtiquetaRecebimentoPreviewChrome
            copiasPorItem={copiasPorItem}
            iframeMinHeight={560}
            itemCount={itensSelecionados.length}
            previewHtml={previewHtml}
          />
        </Modal>
      ) : null}

      {msg ? <OperationalNotice tone="warning">{msg}</OperationalNotice> : null}
    </div>
  );
}
