import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION } from '../../../appMeta';
import { PanelToolbarGroup } from '../../../components/layout/ListPageShell';
import { Button } from '../../../components/ui/Button';
import { AutocompleteField } from '../../../components/ui/AutocompleteField';
import { FonteDadosNotice } from '../../../components/ui/FonteDadosNotice';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import { preVisualizarRelatorioProfissional, nomeArquivoRelatorioPdf } from '../../../lib/relatorioProfissional';
import { traduzirErroImpressaoIsoPro } from '../../../lib/traduzirErroImpressaoIsoPro';
import { resolveFonteNuvemOk } from '../../../lib/fonteNuvemLista';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { usePageChrome } from '../../../layouts/PageChromeContext';
import { useAuth } from '../../auth/hooks/useAuth';
import { AtendimentoBuscaDocumento } from '../components/AtendimentoBuscaDocumento';
import { AtendimentoFormHeader } from '../components/AtendimentoFormHeader';
import { AtendimentoHistoricoTable } from '../components/AtendimentoHistoricoTable';
import { AtendimentoItensTable } from '../components/AtendimentoItensTable';
import { AtendimentoLeitorModal } from '../components/AtendimentoLeitorModal';
import { AtendimentoSessaoRetiradaPanel } from '../components/AtendimentoSessaoRetiradaPanel';
import { totalizarLinhas, useAtendimento } from '../hooks/useAtendimento';
import type { Atendimento } from '../types/atendimento.types';
import { montarHtmlRecibo, montarHtmlReciboConsolidado } from '../utils/imprimirReciboAtendimento';
import { montarHtmlReciboEstorno } from '../utils/imprimirReciboEstorno';
import { montarReciboVisualizarHistorico } from '../utils/montarReciboVisualizarHistorico';
import { atendimentoTemVariosDocumentos } from '../utils/estornoDocumento.utils';
import { formatDocumentoNumeroDisplay } from '../utils/formatDocumentoNumeroDisplay';

export function AtendimentoPage() {
  const { canAccessAction } = useAuth();
  const cloudStatus = getSupabaseOperationalStatus();
  const {
    documentos,
    historico,
    historicoTotalCount,
    historicoPage,
    setHistoricoPage,
    historicoBusca,
    setHistoricoBusca,
    historicoPeriodo,
    setHistoricoPeriodo,
    historicoLoading,
    historicoFetchError,
    ensureHistoricoCarregado,
    recarregarHistorico,
    colaboradores,
    selectedDocumento,
    selectedDocumentoId,
    atendente,
    recebedorTipo,
    recebedorColaboradorId,
    recebedor,
    recebedorEmpresa,
    recebedorDocumento,
    recebedorTelefone,
    autorizadorInterno,
    motivoRetirada,
    loading,
    error,
    success,
    snapshotConflict,
    documentoLockAviso,
    documentoLockBloqueado,
    fallbackReason,
    listSource,
    hasCloudConfig,
    setSelectedDocumentoId,
    setAtendente,
    setRecebedorTipo,
    setRecebedorColaboradorId,
    setRecebedor,
    setRecebedorEmpresa,
    setRecebedorDocumento,
    setRecebedorTelefone,
    setAutorizadorInterno,
    setMotivoRetirada,
    updateLinha,
    preencherMaximoLinha,
    preencherMaximosMarcados,
    load,
    pedirConfirmacaoAtendimento,
    podeRegistrarAtendimento,
    motivoBloqueioAtendimento,
    gravandoAtendimento,
    confirmacaoAtendimento,
    cancelarConfirmacaoAtendimento,
    confirmarAtendimentoNoModal,
    reciboOpcional,
    dispensarImpressaoRecibo,
    imprimirReciboEfechar,
    reciboEstornoOpcional,
    dispensarImpressaoReciboEstorno,
    imprimirReciboEstornoEfechar,
    estornoAlvo,
    estornoDocLoading,
    estornoDocInfo,
    estornoNomeQuemEstorna,
    estornoNomeQuemDevolve,
    estornoMotivo,
    setEstornoNomeQuemEstorna,
    setEstornoNomeQuemDevolve,
    setEstornoMotivo,
    fecharModalEstorno,
    executarImpressaoReciboEstorno,
    confirmarEstornoFinal,
    estornoConfirmando,
    iniciarEstorno,
    estornoLinhas,
    setEstornoLinhas,
    estornoDuplicadosAviso,
    idsMarcados,
    itensSelecionados,
    toggleMarcaItem,
    marcarTodosItens,
    exportarAtendimentosMateriaisExcel,
    exportarEstornosExcel,
    exportingAtendimentosCsv,
    exportingEstornosCsv,
    leitorPainel,
    processarLeituraCodigoBarras,
    confirmarLeitorComQuantidade,
    continuarLeitorBipando,
    fecharLeitorPainel,
    sessaoRetirada,
    removerLinhaSessaoRetirada,
    limparSessaoRetirada,
    podeConfirmarSessaoRetirada,
    motivoBloqueioSessaoRetirada,
    pedirConfirmacaoSessaoRetirada,
    confirmacaoSessaoRetirada,
    cancelarConfirmacaoSessaoRetirada,
    confirmarSessaoRetiradaNoModal,
    reciboSessaoOpcional,
    dispensarImpressaoReciboSessao,
    imprimirReciboSessaoEfechar,
    reciboImprimindo,
    adicionarDocumentoPendenteRemoto,
  } = useAtendimento();
  const canEdit = canAccessAction('atendimento', 'editar');
  const canAdminister = canAccessAction('atendimento', 'administrar');
  const canExportAtendimentos = canAccessAction('atendimento', 'visualizar');

  const leitorCodigoRef = useRef<HTMLInputElement>(null);
  const leitorDebounceRef = useRef<number | undefined>(undefined);
  const leitorProcessandoRef = useRef(false);
  const estornoQtdRefs = useRef<(HTMLInputElement | null)[]>([]);
  const estornoConfirmarRef = useRef<HTMLButtonElement | null>(null);
  const [leitorCodigoBuffer, setLeitorCodigoBuffer] = useState('');
  /** Leitura em processamento (cadastro + busca de desenhos na nuvem) - feedback "aguarde" junto ao campo. */
  const [leituraEmCurso, setLeituraEmCurso] = useState(false);
  const [reciboHistoricoLoadingId, setReciboHistoricoLoadingId] = useState<string | null>(null);
  const [reciboSessaoPreviewLoading, setReciboSessaoPreviewLoading] = useState(false);
  const [reciboAviso, setReciboAviso] = useState<string | null>(null);
  /** WMS: Operacao (bipe) vs Arquivo (historico) - default = bancada de obra. */
  const [zona, setZona] = useState<'operacao' | 'historico'>('operacao');
  const [gravandoElapsedSec, setGravandoElapsedSec] = useState(0);

  useEffect(() => {
    if (!gravandoAtendimento) {
      setGravandoElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setGravandoElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [gravandoAtendimento]);

  usePageChrome(
    {
      meta:
        zona === 'historico'
          ? historicoLoading
            ? 'A carregar histórico…'
            : `${historicoTotalCount.toLocaleString('pt-BR')} lotes · ${listSource === 'supabase' && hasCloudConfig ? 'nuvem' : 'arquivo'} · v${APP_VERSION}`
          : loading
            ? 'A carregar…'
            : fallbackReason.includes('segundo plano')
              ? 'A concluir a lista de desenhos…'
              : `${documentos.length.toLocaleString('pt-BR')} docs · ${
                  listSource === 'supabase' || hasCloudConfig ? 'nuvem' : 'local'
                } · v${APP_VERSION}`,
    },
    [zona, historicoLoading, historicoTotalCount, loading, documentos.length, listSource, hasCloudConfig, fallbackReason],
  );

  const avisoRetiranteLeitor = useMemo(() => {
    if (!atendente.trim()) return 'Informe o atendente antes de confirmar o lote final.';
    if (recebedorTipo === 'interno' && !recebedorColaboradorId.trim()) {
      return 'Selecione o colaborador atendido (quem retirou) antes de confirmar a retirada.';
    }
    if (recebedorTipo === 'externo' && !recebedor.trim()) {
      return 'Informe o retirante externo antes de confirmar o lote final.';
    }
    return undefined;
  }, [atendente, recebedorTipo, recebedorColaboradorId, recebedor]);

  const focarLeitor = useCallback(() => {
    window.setTimeout(() => leitorCodigoRef.current?.focus(), 0);
  }, []);

  const enviarLeitura = useCallback(
    (raw: string) => {
      const scan = raw.trim();
      if (!scan || leitorProcessandoRef.current) return;
      window.clearTimeout(leitorDebounceRef.current);
      leitorProcessandoRef.current = true;
      setLeitorCodigoBuffer('');
      // Nao roubar o foco de quem esta a preencher outro campo (nome/empresa/motivo):
      // so re-focar o leitor se o cursor estava nele quando a leitura comecou.
      const leitorTinhaFoco = document.activeElement === leitorCodigoRef.current;
      setLeituraEmCurso(true);
      void processarLeituraCodigoBarras(scan).finally(() => {
        leitorProcessandoRef.current = false;
        setLeituraEmCurso(false);
        if (leitorTinhaFoco) focarLeitor();
      });
    },
    [processarLeituraCodigoBarras, focarLeitor],
  );

  const onLeitorChange = useCallback(
    (value: string) => {
      setLeitorCodigoBuffer(value);
      window.clearTimeout(leitorDebounceRef.current);
      if (value.trim().length < 3) return;
      leitorDebounceRef.current = window.setTimeout(() => {
        // Se o utilizador ja saiu do campo do leitor, o texto nao e um bipe - nao processar.
        if (document.activeElement !== leitorCodigoRef.current) return;
        enviarLeitura(value);
      }, 150);
    },
    [enviarLeitura],
  );

  const onLeitorKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' && e.key !== 'Tab') return;
      e.preventDefault();
      enviarLeitura(e.currentTarget.value);
    },
    [enviarLeitura],
  );

  /** Sugestoes: atendente/recebedor do lote + colaboradores ativos; filtra ao digitar; aceita texto livre e colar. */
  useEffect(() => {
    estornoQtdRefs.current = [];
  }, [estornoAlvo?.id]);

  useEffect(() => {
    if (!loading && canEdit) {
      const t = window.setTimeout(() => {
        // So focar o leitor se o utilizador nao estiver a escrever noutro campo.
        const ativo = document.activeElement;
        const digitandoNoutroCampo =
          ativo instanceof HTMLElement &&
          ativo !== leitorCodigoRef.current &&
          (ativo.tagName === 'INPUT' || ativo.tagName === 'TEXTAREA' || ativo.tagName === 'SELECT');
        if (!digitandoNoutroCampo) leitorCodigoRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(t);
    }
  }, [loading, canEdit]);

  const focarProximaQtdEstorno = useCallback(
    (fromIndex: number) => {
      if (!estornoAlvo) return;
      for (let i = fromIndex + 1; i < estornoAlvo.itens.length; i++) {
        const it = estornoAlvo.itens[i];
        const cfg = estornoLinhas[it.id];
        if (cfg?.marcado) {
          const el = estornoQtdRefs.current[i];
          el?.focus();
          el?.select();
          return;
        }
      }
      estornoConfirmarRef.current?.focus();
    },
    [estornoAlvo, estornoLinhas],
  );

  const focarQtdEstornoAnterior = useCallback(
    (fromIndex: number) => {
      if (!estornoAlvo) return;
      for (let i = fromIndex - 1; i >= 0; i--) {
        const it = estornoAlvo.itens[i];
        const cfg = estornoLinhas[it.id];
        if (cfg?.marcado) {
          const el = estornoQtdRefs.current[i];
          el?.focus();
          el?.select();
          return;
        }
      }
    },
    [estornoAlvo, estornoLinhas],
  );

  const fetchOpcoesNomeEstorno = useCallback(
    async (query: string) => {
      const q = query.trim().toLowerCase();
      const fromColab = colaboradores
        .filter((c) => c.nome && (q === '' || c.nome.toLowerCase().includes(q)))
        .map((c) => c.nome.trim())
        .filter(Boolean);

      const contexto: string[] = [];
      if (estornoAlvo) {
        if (estornoAlvo.atendente?.trim()) contexto.push(estornoAlvo.atendente.trim());
        if (estornoAlvo.recebedor?.trim()) contexto.push(estornoAlvo.recebedor.trim());
      }
      const contextoFiltrado = q === '' ? contexto : contexto.filter((n) => n.toLowerCase().includes(q));

      return [...new Set([...contextoFiltrado, ...fromColab])].slice(0, 50);
    },
    [colaboradores, estornoAlvo],
  );

  async function handleVerReciboHistorico(item: Atendimento) {
    setReciboHistoricoLoadingId(item.id);
    try {
      const recibo = await montarReciboVisualizarHistorico(item);
      if (recibo.tipo === 'estorno') {
        const html = await montarHtmlReciboEstorno(recibo.dados);
        const res = await preVisualizarRelatorioProfissional({
          html,
          fileName: nomeArquivoRelatorioPdf(item.numero, 'recibo-estorno'),
          titulo: `Recibo de estorno ${item.numero}`,
          tipoNuvem: 'recibo_estorno',
        });
        if (!res.ok) {
          setReciboAviso(
            traduzirErroImpressaoIsoPro(
              res.error ??
                'Nao foi possivel abrir a pre-visualizacao do recibo de estorno.',
            ),
          );
        }
        return;
      }
      const html = await montarHtmlRecibo(recibo.dados);
      const res = await preVisualizarRelatorioProfissional({
        html,
        fileName: nomeArquivoRelatorioPdf(item.numero, 'recibo'),
        titulo: `Recibo ${item.numero}`,
        tipoNuvem: 'recibo_atendimento',
      });
      if (!res.ok) {
        setReciboAviso(
          traduzirErroImpressaoIsoPro(
            res.error ??
              'Nao foi possivel abrir a pre-visualizacao. Use "Imprimir / PDF" no fluxo de confirmacao do atendimento.',
          ),
        );
      }
    } finally {
      setReciboHistoricoLoadingId(null);
    }
  }

  async function handleVisualizarReciboSessaoConsolidada() {
    if (!reciboSessaoOpcional) return;
    setReciboSessaoPreviewLoading(true);
    try {
      const html = await montarHtmlReciboConsolidado(reciboSessaoOpcional);
      const res = await preVisualizarRelatorioProfissional({
        html,
        fileName: nomeArquivoRelatorioPdf(reciboSessaoOpcional.referencia, 'recibo-consolidado'),
        titulo: `Recibo consolidado ${reciboSessaoOpcional.referencia}`,
        tipoNuvem: 'recibo_sessao',
      });
      if (!res.ok) {
        setReciboAviso(
          traduzirErroImpressaoIsoPro(
            res.error ??
              'Nao foi possivel abrir a pre-visualizacao. Use "Imprimir / PDF" na janela de visualizacao.',
          ),
        );
      }
    } finally {
      setReciboSessaoPreviewLoading(false);
    }
  }

  return (
    <div
      className={`panel atendimento-panel${zona === 'historico' ? ' atendimento-panel--historico' : ' atendimento-panel--operacao'}`}
      data-e2e="atendimento-page"
    >
      <h2 className="visually-hidden" data-e2e="atendimento-title">
        Atendimento
      </h2>
      {zona === 'historico' ? (
        <div className="panel-header panel-header--toolbar panel-header--actions-only">
          <div className="panel-toolbar">
            <PanelToolbarGroup label="Arquivo" aria-label="Arquivo de lotes">
              <Button onClick={() => void recarregarHistorico()} type="button" variant="ghost">
                Atualizar
              </Button>
              {canExportAtendimentos ? (
                <>
                  <Button
                    onClick={() => void exportarAtendimentosMateriaisExcel()}
                    type="button"
                    variant="ghost"
                    disabled={exportingAtendimentosCsv || exportingEstornosCsv}
                  >
                    {exportingAtendimentosCsv ? 'A exportar…' : 'Exportar atendimentos'}
                  </Button>
                  <Button
                    onClick={() => void exportarEstornosExcel()}
                    type="button"
                    variant="ghost"
                    disabled={exportingAtendimentosCsv || exportingEstornosCsv}
                  >
                    {exportingEstornosCsv ? 'A exportar…' : 'Exportar estornos'}
                  </Button>
                </>
              ) : null}
            </PanelToolbarGroup>
          </div>
        </div>
      ) : null}

      {zona === 'historico' ? (
        <ModuleHelp>
          <p className="panel-copy">Arquivo de retiradas (consulta e estorno). A bancada de bipe fica em Operação.</p>
        </ModuleHelp>
      ) : null}

      <FonteDadosNotice
        healthy={
          loading ||
          resolveFonteNuvemOk({ listSource, hasCloudConfig, fallbackReason }) ||
          Boolean(fallbackReason?.includes('segundo plano'))
        }
        fallbackMessage={
          hasCloudConfig
            ? 'Fonte atual: fallback local. Pendentes ainda nao vieram da nuvem (rede ou sync).'
            : cloudStatus === 'partial'
              ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
              : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'
        }
      />
      {!loading && fallbackReason && !fallbackReason.includes('segundo plano') ? (
        <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice>
      ) : null}

      <SnapshotConflictHint show={snapshotConflict} onReload={() => void load()} />
      {documentoLockAviso ? (
        <OperationalNotice tone={documentoLockBloqueado ? 'critical' : 'warning'}>{documentoLockAviso}</OperationalNotice>
      ) : null}
      {error ? <div className="error-box">{error}</div> : null}
      {exportingAtendimentosCsv || exportingEstornosCsv ? (
        <OperationalNotice>
          {exportingAtendimentosCsv
            ? 'A exportar atendimentos (periodo seleccionado)… Aguarde o download.'
            : 'A exportar estornos (periodo seleccionado)… Aguarde o download.'}
        </OperationalNotice>
      ) : null}
      {reciboAviso ? <OperationalNotice tone="critical">{reciboAviso}</OperationalNotice> : null}
      {success ? <OperationalNotice tone="success">{success}</OperationalNotice> : null}
      {!canEdit ? (
        <OperationalNotice tone="warning">
          Seu perfil pode consultar saldos e historico, mas o registro de baixas permanece bloqueado.
        </OperationalNotice>
      ) : null}

      <div className="panel-tabs" role="tablist" aria-label="Zonas do atendimento">
        <button
          aria-selected={zona === 'operacao'}
          className={`panel-tab${zona === 'operacao' ? ' panel-tab--active' : ''}`}
          onClick={() => setZona('operacao')}
          role="tab"
          type="button"
        >
          Operacao
        </button>
        <button
          aria-selected={zona === 'historico'}
          className={`panel-tab${zona === 'historico' ? ' panel-tab--active' : ''}`}
          onClick={() => {
            setZona('historico');
            ensureHistoricoCarregado();
          }}
          role="tab"
          type="button"
        >
          Historico
          {historico.length > 0 ? ` (${historico.length})` : ''}
        </button>
      </div>

      {zona === 'operacao' ? (
        <div className="atendimento-operacao-scroll">
          <div className="atendimento-ops-rail">
            <div className="atendimento-ops-top">
              {canEdit ? (
                <label className="field atendimento-leitor-field" htmlFor="atendimento-leitor-codigo">
                  <span>Leitor USB</span>
                  <input
                    autoComplete="off"
                    className="input-control"
                    id="atendimento-leitor-codigo"
                    onChange={(e) => onLeitorChange(e.target.value)}
                    onKeyDown={onLeitorKeyDown}
                    placeholder="Bipe o material — Enter confirma"
                    ref={leitorCodigoRef}
                    spellCheck={false}
                    type="text"
                    value={leitorCodigoBuffer}
                  />
                </label>
              ) : null}
              <div className="atendimento-ops-doc">
                <AtendimentoBuscaDocumento
                  documentos={documentos}
                  onDocumentoRemoto={adicionarDocumentoPendenteRemoto}
                  onSelect={setSelectedDocumentoId}
                  selectedDocumentoId={selectedDocumentoId}
                />
              </div>
            </div>
            {leituraEmCurso ? (
              <p className="atendimento-ops-hint">A identificar material e desenhos pendentes…</p>
            ) : null}

            <AtendimentoFormHeader
              atendente={atendente}
              autorizadorInterno={autorizadorInterno}
              colaboradores={colaboradores}
              colaboradoresCarregados={!loading}
              motivoRetirada={motivoRetirada}
              onAtendenteChange={setAtendente}
              onAutorizadorInternoChange={setAutorizadorInterno}
              onMotivoRetiradaChange={setMotivoRetirada}
              onRecebedorChange={setRecebedor}
              onRecebedorColaboradorIdChange={setRecebedorColaboradorId}
              onRecebedorDocumentoChange={setRecebedorDocumento}
              onRecebedorEmpresaChange={setRecebedorEmpresa}
              onRecebedorTelefoneChange={setRecebedorTelefone}
              onRecebedorTipoChange={setRecebedorTipo}
              recebedor={recebedor}
              recebedorColaboradorId={recebedorColaboradorId}
              recebedorDocumento={recebedorDocumento}
              recebedorEmpresa={recebedorEmpresa}
              recebedorTelefone={recebedorTelefone}
              recebedorTipo={recebedorTipo}
            />

            {canEdit ? (
              <AtendimentoSessaoRetiradaPanel
                linhas={sessaoRetirada}
                loading={loading}
                motivoBloqueio={motivoBloqueioSessaoRetirada}
                onConfirmar={pedirConfirmacaoSessaoRetirada}
                onLimpar={limparSessaoRetirada}
                onRemoverLinha={removerLinhaSessaoRetirada}
                podeConfirmar={podeConfirmarSessaoRetirada}
              />
            ) : null}
          </div>

          {selectedDocumento ? (
            <div className="atendimento-doc-block">
              <div className="atendimento-doc-head">
                <span className="atendimento-doc-head__title">
                  <strong>
                    {formatDocumentoNumeroDisplay(selectedDocumento.numero)} Rev.{' '}
                    {selectedDocumento.revisao}
                  </strong>
                  <span className="atendimento-doc-head__meta">
                    {selectedDocumento.descricao}
                    {selectedDocumento.responsavel ? ` · ${selectedDocumento.responsavel}` : ''}
                  </span>
                </span>
                {itensSelecionados.length === 0 &&
                selectedDocumento.linhas.some((l) => idsMarcados.has(l.documentoItemId)) ? (
                  <span className="atendimento-ops-hint atendimento-ops-hint--warn">
                    Itens com qtd. zero — ajuste saldo ou quantidade.
                  </span>
                ) : null}
              </div>

              <AtendimentoItensTable
                idsMarcados={idsMarcados}
                items={selectedDocumento.linhas}
                onChangeQuantidade={updateLinha}
                onMarcarTodos={marcarTodosItens}
                onPreencherMaximo={preencherMaximoLinha}
                onToggleMarca={toggleMarcaItem}
              />

              <div className="inline-actions atendimento-doc-actions">
                <span className="panel-copy">
                  Total: <strong>{totalizarLinhas(selectedDocumento.linhas)}</strong>
                  {canEdit ? (
                    <Button
                      disabled={loading || idsMarcados.size === 0}
                      onClick={preencherMaximosMarcados}
                      style={{ marginLeft: 8 }}
                      title="Preenche o máximo em todas as linhas marcadas"
                      type="button"
                      variant="ghost"
                    >
                      Máximos marcados
                    </Button>
                  ) : null}
                  {canEdit && !podeRegistrarAtendimento && !loading && motivoBloqueioAtendimento ? (
                    <span className="atendimento-ops-hint atendimento-ops-hint--warn">
                      {' '}
                      · {motivoBloqueioAtendimento}
                    </span>
                  ) : null}
                </span>
                {canEdit ? (
                  <Button
                    disabled={loading || !podeRegistrarAtendimento}
                    onClick={pedirConfirmacaoAtendimento}
                    title={motivoBloqueioAtendimento && !loading ? motivoBloqueioAtendimento : undefined}
                    type="button"
                  >
                    Confirmar atendimento
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="atendimento-ops-empty">
              {loading || fallbackReason.includes('segundo plano')
                ? 'A carregar desenhos pendentes…'
                : 'Selecione um documento pendente para ver os itens e registar o atendimento.'}
            </p>
          )}
        </div>
      ) : (
        <div className="atendimento-historico-body">
          {historicoFetchError ? <div className="error-box">{historicoFetchError}</div> : null}

          <AtendimentoHistoricoTable
            busca={historicoBusca}
            canAdminister={canAdminister}
            items={historico}
            loading={historicoLoading}
            onBuscaChange={setHistoricoBusca}
            onEstornar={iniciarEstorno}
            onPageChange={setHistoricoPage}
            onPeriodoChange={setHistoricoPeriodo}
            onVerRecibo={handleVerReciboHistorico}
            page={historicoPage}
            periodo={historicoPeriodo}
            reciboCarregandoId={reciboHistoricoLoadingId}
            totalCount={historicoTotalCount}
          />
        </div>
      )}

      <Modal
        onClose={() => {
          if (!gravandoAtendimento) cancelarConfirmacaoAtendimento();
        }}
        open={Boolean(confirmacaoAtendimento)}
        title="Confirmar atendimento"
        wide
      >
        {confirmacaoAtendimento ? (
          <div className="editor-block">
            <p>
              Confirmar o atendimento do documento{' '}
              <strong>{formatDocumentoNumeroDisplay(confirmacaoAtendimento.documentoNumero)}</strong> com{' '}
              <strong>{confirmacaoAtendimento.itemCount}</strong> item(ns) e total de{' '}
              <strong>{confirmacaoAtendimento.totalUnidades}</strong> unidade(s)?
            </p>
            {gravandoAtendimento ? (
              <OperationalNotice>
                A registrar o atendimento na nuvem
                {gravandoElapsedSec > 0 ? ` (${gravandoElapsedSec}s)` : ''}
                ... nao feche esta janela.
                {gravandoElapsedSec >= 35
                  ? ' Ainda a processar. Se falhar, abra Historico antes de tentar de novo (nao duplica).'
                  : gravandoElapsedSec >= 20
                    ? ' Ligacao lenta - se falhar, clique Confirmar de novo (nao duplica).'
                    : ' Pode levar alguns segundos.'}
              </OperationalNotice>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={gravandoAtendimento} onClick={cancelarConfirmacaoAtendimento} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button disabled={gravandoAtendimento} onClick={() => void confirmarAtendimentoNoModal()} type="button">
                {gravandoAtendimento
                  ? gravandoElapsedSec > 0
                    ? `A gravar... ${gravandoElapsedSec}s`
                    : 'A gravar...'
                  : 'Confirmar'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={() => {
          if (!gravandoAtendimento) cancelarConfirmacaoSessaoRetirada();
        }}
        open={Boolean(confirmacaoSessaoRetirada)}
        title="Confirmar retirada (varios desenhos)"
        wide
      >
        {confirmacaoSessaoRetirada ? (
          <div className="editor-block">
            <p>
              Confirmar retirada com <strong>{confirmacaoSessaoRetirada.documentoCount}</strong> desenho(s),{' '}
              <strong>{confirmacaoSessaoRetirada.itemCount}</strong> item(ns) e total de{' '}
              <strong>{confirmacaoSessaoRetirada.totalUnidades}</strong> unidade(s)?
            </p>
            <p className="panel-copy">
              O sistema registrara um lote por desenho (rastreio e estorno) e emitira um recibo consolidado para
              assinatura unica.
            </p>
            <table className="data-table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Desenho</th>
                  <th>Codigo</th>
                  <th>Descricao</th>
                  <th>UN</th>
                  <th>Qtd</th>
                </tr>
              </thead>
              <tbody>
                {sessaoRetirada.map((linha) => (
                  <tr key={`${linha.documentoId}-${linha.documentoItemId}`}>
                    <td>
                      {formatDocumentoNumeroDisplay(linha.documentoNumero)} Rev. {linha.documentoRevisao}
                    </td>
                    <td>{linha.codigoMaterial}</td>
                    <td>{linha.descricaoMaterial}</td>
                    <td>{linha.unidade}</td>
                    <td>{linha.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {gravandoAtendimento ? (
              <OperationalNotice>
                A registrar a retirada na nuvem
                {gravandoElapsedSec > 0 ? ` (${gravandoElapsedSec}s)` : ''}
                ... nao feche esta janela.
                {gravandoElapsedSec >= 35
                  ? ' Ainda a processar. Se falhar, abra Historico antes de tentar de novo (nao duplica).'
                  : gravandoElapsedSec >= 20
                    ? ' Ligacao lenta - se falhar, clique Confirmar de novo (nao duplica).'
                    : ' Pode levar alguns segundos.'}
              </OperationalNotice>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={gravandoAtendimento} onClick={cancelarConfirmacaoSessaoRetirada} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button disabled={gravandoAtendimento} onClick={() => void confirmarSessaoRetiradaNoModal()} type="button">
                {gravandoAtendimento
                  ? gravandoElapsedSec > 0
                    ? `A gravar... ${gravandoElapsedSec}s`
                    : 'A gravar...'
                  : 'Confirmar retirada'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={dispensarImpressaoReciboSessao}
        open={Boolean(reciboSessaoOpcional)}
        title="Recibo consolidado de retirada"
        wide
      >
        {reciboSessaoOpcional ? (
          <div className="editor-block">
            <p>
              Retirada registrada em <strong>{reciboSessaoOpcional.secoes.length}</strong> desenho(s). Lotes:{' '}
              <strong>{reciboSessaoOpcional.numerosLotes.join(', ')}</strong>. Deseja imprimir o recibo consolidado?
            </p>
            <p className="panel-copy">
              Revise o recibo na pre-visualizacao antes de imprimir. O documento lista todos os desenhos e materiais desta
              retirada.
            </p>
            <div className="form-actions" style={{ marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
              <Button onClick={dispensarImpressaoReciboSessao} type="button" variant="ghost">
                Nao
              </Button>
              <Button
                disabled={reciboSessaoPreviewLoading || reciboImprimindo}
                onClick={() => void handleVisualizarReciboSessaoConsolidada()}
                type="button"
                variant="ghost"
              >
                {reciboSessaoPreviewLoading ? 'Abrindo...' : 'Visualizar recibo'}
              </Button>
              <Button
                disabled={reciboImprimindo}
                onClick={() => void imprimirReciboSessaoEfechar()}
                type="button"
              >
                {reciboImprimindo ? 'A gerar PDF...' : 'Sim, imprimir recibo unico'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal onClose={fecharModalEstorno} open={Boolean(estornoAlvo)} title="Estornar atendimento" wide>
        {estornoAlvo ? (
          <div className="editor-block stack-grid">
            {estornoDocLoading || !estornoDocInfo ? (
              <OperationalNotice>Carregando dados do documento...</OperationalNotice>
            ) : (
              <>
                <p className="panel-copy">
                  Preencha os dados do estorno. O recibo impresso inclui documento, itens, motivo e assinaturas. O estorno so e aplicado ao confirmar.
                </p>
                {estornoDuplicadosAviso.length > 0 ? (
                  <OperationalNotice>
                    <strong>Atencao - mesmo material em outro lote:</strong> estornar este lote{' '}
                    <strong>nao</strong> altera retiradas registadas noutros protocolos. Confirme se esta no lote correto.
                    <ul className="stack-grid" style={{ marginTop: '0.5rem' }}>
                      {estornoDuplicadosAviso.map((av) => (
                        <li key={`${av.loteId}-${av.codigoMaterial}`}>
                          Lote <strong>{av.loteNumero}</strong> ({av.origem === 'mobile' ? 'Mobile' : 'PC'}) -{' '}
                          {av.codigoMaterial} no desenho <strong>{av.documentoNumero}</strong>:{' '}
                          {av.quantidadeAtendida} {av.recebedor ? `· recebedor ${av.recebedor}` : ''} ·{' '}
                          {new Date(av.dataAtendimento).toLocaleString('pt-BR')}
                        </li>
                      ))}
                    </ul>
                  </OperationalNotice>
                ) : null}
                <div className="document-summary">
                  <strong>{estornoDocInfo.titulo}</strong>
                  <p className="panel-copy">{estornoDocInfo.descricao}</p>
                  {atendimentoTemVariosDocumentos(estornoAlvo) ? null : (
                    <p className="panel-copy">Responsavel (documento): {estornoDocInfo.responsavel}</p>
                  )}
                  <p className="panel-copy">
                    Atendimento <strong>{estornoAlvo.numero}</strong> - retirada em{' '}
                    {new Date(estornoAlvo.dataAtendimento).toLocaleString('pt-BR')}
                  </p>
                </div>

                <div className="form-columns">
                  <AutocompleteField
                    fetchOptions={fetchOpcoesNomeEstorno}
                    id="estorno-operador"
                    label="Quem esta estornando (operador)"
                    onChange={setEstornoNomeQuemEstorna}
                    placeholder="Digite para buscar, selecione ou cole o nome"
                    value={estornoNomeQuemEstorna}
                  />
                  <AutocompleteField
                    fetchOptions={fetchOpcoesNomeEstorno}
                    id="estorno-devolve"
                    label="Quem esta devolvendo o material"
                    onChange={setEstornoNomeQuemDevolve}
                    placeholder="Digite para buscar, selecione ou cole o nome"
                    value={estornoNomeQuemDevolve}
                  />
                </div>
                <label className="field">
                  <span>Motivo do estorno</span>
                  <textarea
                    className="input-control text-area"
                    onChange={(e) => setEstornoMotivo(e.target.value)}
                    rows={4}
                    value={estornoMotivo}
                  />
                </label>

                <div className="section-block">
                  <h3 className="panel-kicker" style={{ marginBottom: 8 }}>
                    Itens a estornar
                  </h3>
                  <p className="panel-copy">
                    Marque os materiais deste lote que serao devolvidos e ajuste a quantidade (pode ser menor que a retirada). Itens desmarcados nao entram no estorno.
                  </p>
                  <OperationalNotice>
                    Modo rapido na coluna &quot;Qtd a estornar&quot;: <strong>Enter</strong> proxima linha habilitada;{' '}
                    <strong>Shift+Enter</strong> linha anterior; <strong>Setas</strong> para cima/baixo entre linhas; na ultima linha,{' '}
                    <strong>Enter</strong> vai para Confirmar estorno.
                  </OperationalNotice>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', fontSize: '0.9rem' }}>
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}></th>
                          {atendimentoTemVariosDocumentos(estornoAlvo) ? <th>Documento</th> : null}
                          <th>Codigo</th>
                          <th>Descricao</th>
                          <th>UN</th>
                          <th>Qtd no lote</th>
                          <th>Qtd a estornar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {estornoAlvo.itens.map((it, rowIndex) => {
                          const cfg = estornoLinhas[it.id] ?? { marcado: false, quantidade: it.quantidadeAtendida };
                          const mostrarColDoc = atendimentoTemVariosDocumentos(estornoAlvo);
                          return (
                            <tr key={it.id}>
                              <td>
                                <input
                                  aria-label={`Incluir ${it.codigoMaterial} no estorno`}
                                  checked={cfg.marcado}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setEstornoLinhas((c) => ({
                                      ...c,
                                      [it.id]: {
                                        marcado: checked,
                                        quantidade: checked ? Math.min(c[it.id]?.quantidade ?? it.quantidadeAtendida, it.quantidadeAtendida) : 0,
                                      },
                                    }));
                                  }}
                                  type="checkbox"
                                />
                              </td>
                              {mostrarColDoc ? (
                                <td>{it.documentoNumero?.trim() || estornoAlvo.documentoNumero || '-'}</td>
                              ) : null}
                              <td>{it.codigoMaterial}</td>
                              <td>{it.descricaoMaterial}</td>
                              <td>{it.unidade}</td>
                              <td>{it.quantidadeAtendida}</td>
                              <td>
                                <input
                                  ref={(el) => {
                                    estornoQtdRefs.current[rowIndex] = el;
                                  }}
                                  aria-label={`Quantidade a estornar para ${it.codigoMaterial}`}
                                  className="input-control"
                                  disabled={!cfg.marcado}
                                  max={it.quantidadeAtendida}
                                  min={0}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    const q = Number.isFinite(v)
                                      ? Math.min(Math.max(0, v), it.quantidadeAtendida)
                                      : 0;
                                    setEstornoLinhas((c) => ({
                                      ...c,
                                      [it.id]: { marcado: c[it.id]?.marcado ?? true, quantidade: q },
                                    }));
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (e.shiftKey) {
                                        focarQtdEstornoAnterior(rowIndex);
                                      } else {
                                        focarProximaQtdEstorno(rowIndex);
                                      }
                                      return;
                                    }
                                    if (e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      focarProximaQtdEstorno(rowIndex);
                                      return;
                                    }
                                    if (e.key === 'ArrowUp') {
                                      e.preventDefault();
                                      focarQtdEstornoAnterior(rowIndex);
                                      return;
                                    }
                                  }}
                                  step="any"
                                  style={{ maxWidth: 120 }}
                                  type="number"
                                  value={cfg.marcado ? cfg.quantidade : 0}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {error ? <div className="error-box">{error}</div> : null}
                {estornoConfirmando ? (
                  <OperationalNotice>A gravar o estorno na nuvem... aguarde, pode levar alguns segundos.</OperationalNotice>
                ) : null}
                <div className="form-actions" style={{ marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
                  <Button disabled={estornoConfirmando} onClick={fecharModalEstorno} type="button" variant="ghost">
                    Cancelar
                  </Button>
                  <Button
                    disabled={reciboImprimindo || estornoConfirmando}
                    onClick={() => void executarImpressaoReciboEstorno()}
                    type="button"
                    variant="ghost"
                  >
                    {reciboImprimindo ? 'A gerar PDF...' : 'Imprimir recibo de estorno'}
                  </Button>
                  <Button
                    disabled={estornoConfirmando}
                    onClick={() => void confirmarEstornoFinal()}
                    ref={estornoConfirmarRef}
                    type="button"
                    variant="danger"
                  >
                    {estornoConfirmando ? 'A estornar...' : 'Confirmar estorno'}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={dispensarImpressaoRecibo}
        open={Boolean(reciboOpcional)}
        title="Recibo de retirada"
        wide
      >
        {reciboOpcional ? (
          <div className="editor-block">
            <p>
              Atendimento <strong>{reciboOpcional.atendimento.numero}</strong> registrado. Deseja imprimir o recibo desta retirada?
            </p>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={dispensarImpressaoRecibo} type="button" variant="ghost">
                Nao
              </Button>
              <Button disabled={reciboImprimindo} onClick={() => void imprimirReciboEfechar()} type="button">
                {reciboImprimindo ? 'A gerar PDF...' : 'Sim, imprimir'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={dispensarImpressaoReciboEstorno}
        open={Boolean(reciboEstornoOpcional)}
        title="Recibo de estorno"
        wide
      >
        {reciboEstornoOpcional ? (
          <div className="editor-block">
            <p>
              Estorno registrado no atendimento <strong>{reciboEstornoOpcional.atendimento.numero}</strong>. Deseja imprimir o recibo deste estorno?
            </p>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={dispensarImpressaoReciboEstorno} type="button" variant="ghost">
                Nao
              </Button>
              <Button disabled={reciboImprimindo} onClick={() => void imprimirReciboEstornoEfechar()} type="button">
                {reciboImprimindo ? 'A gerar PDF...' : 'Sim, imprimir'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <AtendimentoLeitorModal
        atendente={atendente}
        avisoRetirante={avisoRetiranteLeitor}
        colaboradores={colaboradores}
        onCancelar={() => {
          fecharLeitorPainel();
          focarLeitor();
        }}
        onConfirmar={confirmarLeitorComQuantidade}
        onContinuarBipando={() => {
          continuarLeitorBipando();
          focarLeitor();
        }}
        onFinalizarRetirada={() => {
          fecharLeitorPainel();
          pedirConfirmacaoSessaoRetirada();
        }}
        open={Boolean(leitorPainel)}
        painel={leitorPainel}
        recebedor={recebedor}
        recebedorColaboradorId={recebedorColaboradorId}
        recebedorTipo={recebedorTipo}
        sessaoRetirada={sessaoRetirada}
      />
    </div>
  );
}
