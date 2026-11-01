import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { traduzirErroImpressaoIsoPro } from '../../../lib/traduzirErroImpressaoIsoPro';
import { listaBuscaDebounceMs } from '../../../lib/listaBuscaDebounce';
import { abrirPreVisualizacaoHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import { PAGEDJS_SCRIPT_FILENAME } from '../../../lib/relatorioPagedConstants';
import { substituirPagedJsPorInline } from '../../../lib/relatorioPagedJsBundle';
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
import { IconFullscreenEnter, IconFullscreenExit } from '../../../components/ui/FullscreenIcons';

/** HTML no iframe in-app: srcdoc (nao blob:) + fontes absolutas para o tema escuro da app. */
function prepararHtmlPreviewEtiquetaIframe(html: string): string {
  let out = html.includes(PAGEDJS_SCRIPT_FILENAME) ? substituirPagedJsPorInline(html) : html;
  if (typeof window !== 'undefined') {
    try {
      const fontsPrefix = new URL('./fonts/', window.location.href).href;
      out = out.replace(/\.\/fonts\//g, fontsPrefix);
    } catch {
      /* ignore */
    }
  }
  return out;
}

type EtiquetaPreviewChromeProps = {
  copiasPorItem: number;
  iframeMinHeight: number;
  itemCount: number;
  onOpenLightbox?: () => void;
  previewBusy?: boolean;
  previewHtml: string;
};

function EtiquetaRecebimentoPreviewChrome({
  copiasPorItem,
  iframeMinHeight,
  itemCount,
  onOpenLightbox,
  previewBusy = false,
  previewHtml,
}: EtiquetaPreviewChromeProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [browserFs, setBrowserFs] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !previewHtml.trim()) return;
    iframe.removeAttribute('src');
    iframe.srcdoc = prepararHtmlPreviewEtiquetaIframe(previewHtml);
  }, [previewHtml]);

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
            <Button disabled={previewBusy} onClick={onOpenLightbox} type="button" variant="ghost">
              {previewBusy ? 'A abrir…' : 'Tela grande'}
            </Button>
          ) : null}
        </div>
      </div>
      <div className={onOpenLightbox ? 'etiqueta-preview-scroll' : 'etiqueta-preview-scroll etiqueta-preview-scroll--lightbox'}>
        <iframe
          ref={iframeRef}
          sandbox="allow-same-origin allow-scripts allow-modals allow-popups"
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
  const [previewBusy, setPreviewBusy] = useState(false);
  const [imprimirBusy, setImprimirBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listaBuscaSeqRef = useRef(0);
  const itensRecebRef = useRef<HTMLDivElement | null>(null);

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
      // Evita disparar RPC a cada dígito isolado; NF típica ≥ 3.
      if (q.length < 3) {
        listaBuscaSeqRef.current += 1;
        setListaRecebimentos([]);
        setMsg(q.length > 0 ? 'Digite pelo menos 3 caracteres (NF, romaneio ou fornecedor).' : '');
        setCarregandoLista(false);
        return;
      }
      void runListBuscaRecebimentos(q, false);
    }, listaBuscaDebounceMs(buscaReceb));
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
      window.requestAnimationFrame(() => {
        itensRecebRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
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
      paraPreviewInApp: true,
    });
    setPreviewHtml(html);
  }

  async function abrirPreVisualizacaoTelaGrande() {
    if (!previewHtml?.trim() || !recebimentoAtual) return;
    setPreviewBusy(true);
    setMsg('');
    try {
      const titulo = `Etiquetas recebimento ${recebimentoAtual.notaFiscal || '—'}`;
      const res = await abrirPreVisualizacaoHtmlRelatorio(previewHtml, { tituloCarregamento: titulo });
      if (!res.ok) {
        setMsg(traduzirErroImpressaoIsoPro(res.error ?? 'Não foi possível abrir a pré-visualização em tela grande.'));
      }
    } finally {
      setPreviewBusy(false);
    }
  }

  async function imprimirDoc() {
    if (!podeEtiqueta) return;
    if (!recebimentoAtual || !itensSelecionados.length) {
      setMsg('Selecione ao menos um item.');
      return;
    }
    setImprimirBusy(true);
    setMsg('');
    try {
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
        paraPreviewInApp: false,
      });
      if (!(await imprimirEtiquetasRecebimentoHtml(html, recebimentoAtual.notaFiscal || 'etiquetas'))) {
        setMsg(
          traduzirErroImpressaoIsoPro(
            'Não foi possível imprimir. Use «Tela grande» e o botão «Imprimir / PDF» na janela de pré-visualização.',
          ),
        );
      }
    } finally {
      setImprimirBusy(false);
    }
  }

  if (!podeEtiqueta && !podeReceb) {
    return null;
  }

  return (
    <div className="etiquetas-recebimento">
      {!recebimentoAtual ? (
        <div className="etiquetas-busca-row">
          <Input
            label="Buscar recebimento"
            onChange={(e) => setBuscaReceb(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void buscarListaRecebimentos();
            }}
            placeholder="NF, romaneio ou fornecedor"
            value={buscaReceb}
          />
          <div className="etiquetas-busca-row__actions">
            <Button disabled={!podeReceb || carregandoLista} onClick={() => void buscarListaRecebimentos()} type="button">
              {carregandoLista ? 'A buscar…' : 'Buscar'}
            </Button>
            <Button disabled={!podeReceb || !podeLimparBusca} onClick={limparBuscaEResultados} type="button" variant="ghost">
              Limpar
            </Button>
          </div>
        </div>
      ) : null}

      {listaRecebimentos.length > 0 && !recebimentoAtual ? (
        <div className="table-shell etiquetas-receb-lista">
          <table className="data-table">
            <thead>
              <tr>
                <th>NF</th>
                <th>Data</th>
                <th>Fornecedor</th>
                <th>Status</th>
                <th>Itens</th>
                <th>Ações</th>
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
                    <Button onClick={() => void carregarItensRecebimento(r.id)} type="button" variant="ghost">
                      Ver itens
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {carregandoDetalhe ? <OperationalNotice>A carregar itens…</OperationalNotice> : null}

      {recebimentoAtual ? (
        <>
          <div className="etiquetas-bulk-bar etiquetas-bulk-bar--compact etiquetas-nf-chrome">
            <span className="etiquetas-nf-chrome__meta">
              NF <strong>{recebimentoAtual.notaFiscal || '—'}</strong>
              <span className="etiquetas-nf-chrome__sep">·</span>
              {recebimentoAtual.fornecedor}
              <span className="etiquetas-nf-chrome__sep">·</span>
              {recebimentoAtual.itens.length} item(ns)
              {selectedItemIds.size > 0 ? (
                <>
                  <span className="etiquetas-nf-chrome__sep">·</span>
                  {selectedItemIds.size} selecionado(s)
                </>
              ) : null}
            </span>
            <div className="etiquetas-bulk-bar__actions">
              <Button onClick={fecharRecebimentoSelecionado} type="button" variant="ghost">
                Outra NF
              </Button>
              <Button disabled={!podeReceb} onClick={limparBuscaEResultados} type="button" variant="ghost">
                Nova pesquisa
              </Button>
              <Button onClick={selecionarTodosItens} type="button" variant="ghost">
                Selecionar todos
              </Button>
              <Button onClick={limparSelecaoItens} type="button" variant="ghost">
                Limpar seleção
              </Button>
              <Button disabled={!podeEtiqueta || !itensSelecionados.length} onClick={() => void gerarPreview()} type="button" variant="ghost">
                Pré-visualizar
              </Button>
              <Button disabled={!podeEtiqueta || !itensSelecionados.length || imprimirBusy} onClick={() => void imprimirDoc()} type="button">
                {imprimirBusy ? 'A imprimir…' : 'Imprimir'}
              </Button>
            </div>
          </div>

          <div className="etiquetas-print-rail">
            <div className="form-columns form-columns--etiquetas-print">
              <Select label="Modelo" onChange={(e) => setModelo(e.target.value as EtiquetaModelo)} value={modelo}>
                <option value="simples">Simples</option>
                <option value="colorido">Neutro refinado</option>
                <option value="industrial">Industrial</option>
                <option value="cartao">Cartão</option>
                <option value="segregacao">Segregação — «Segregado»</option>
                <option value="liberacao">Liberação — «Liberado»</option>
              </Select>
              <Select label="Formato" onChange={(e) => setFormato(e.target.value as EtiquetaFormato)} value={formato}>
                <option value="a4_3col">A4 3 colunas (denso)</option>
                <option value="a4_2col">A4 2 colunas</option>
                <option value="a4_1col">A4 1 coluna</option>
                <option value="termica_58">Térmica 58mm</option>
                <option value="termica_80">Térmica 80mm</option>
              </Select>
              <Input
                label="Cópias por item"
                min={1}
                onChange={(e) => setCopiasPorItem(Math.max(1, Number(e.target.value) || 1))}
                type="number"
                value={String(copiasPorItem)}
              />
              <Select
                label="Códigos na etiqueta"
                onChange={(e) => setCodigosNaEtiqueta(e.target.value as EtiquetaCodigosOpcao)}
                value={codigosNaEtiqueta}
              >
                <option value="nenhum">Nenhum</option>
                <option value="codigo_barras">Somente código de barras</option>
                <option value="qrcode">Somente QR Code</option>
                <option value="ambos">Código de barras e QR Code</option>
              </Select>
            </div>
            <label className="field field--inline etiquetas-print-rail__logo">
              <input checked={logoNaEtiqueta} onChange={(e) => setLogoNaEtiqueta(e.target.checked)} type="checkbox" />
              <span>Logo na etiqueta</span>
            </label>
          </div>

          <div className="table-shell etiquetas-receb-itens" ref={itensRecebRef}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th>Código</th>
                  <th>Descrição</th>
                  <th title="Quantidade recebida no recebimento (valor impresso na etiqueta)">Qtd etiqueta</th>
                  <th>Un</th>
                  <th>Localização</th>
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

          {previewHtml ? (
            <div className="etiquetas-preview-block">
              <EtiquetaRecebimentoPreviewChrome
                copiasPorItem={copiasPorItem}
                iframeMinHeight={220}
                itemCount={itensSelecionados.length}
                onOpenLightbox={() => void abrirPreVisualizacaoTelaGrande()}
                previewBusy={previewBusy}
                previewHtml={previewHtml}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {msg ? <OperationalNotice tone="warning">{msg}</OperationalNotice> : null}
    </div>
  );
}
