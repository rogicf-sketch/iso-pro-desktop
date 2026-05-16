import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { collectAllPages } from '../../../lib/collectAllPages';
import { abrirPreVisualizacaoHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import { compressImageFileToJpeg } from '../../../lib/imageCompress';
import { mediaBlobDelete } from '../../../lib/mediaBlobStore';
import { useAuth } from '../../auth/hooks/useAuth';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { sugerirCodigoRirParaRecebimento } from '../../qualidade/services/qualidade.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import type { RecebimentoListItem } from '../../recebimentos/types/recebimento.types';
import {
  MAX_FOTOS,
  carregarRelatorioFotografico,
  createEmptyRelatorioFotograficoPayload,
  ensureNumeroRelatorioFotografico,
  estimativaBytesPayloadRelatorioFotografico,
  estimativaBytesTodoLocalStorageAposGravar,
  hydrateRelatorioFotograficoPayload,
  mapRecebimentoParaRelatoriosFotograficosSalvos,
  registrarRelatorioFotograficoGerado,
  relatorioFotoBlobKey,
  salvarRelatorioFotografico,
  salvarRelatorioFotograficoLocalApenas,
} from '../services/relatorioFotografico.service';
import type { RelatorioFotograficoPayload } from '../types/relatorioFotografico.types';
import { imprimirRelatorioFotograficoHtml, montarHtmlRelatorioFotografico } from '../utils/imprimirRelatorioFotograficoHtml';
import { encontrarRecebimentoPorNf } from '../utils/relatorioFotograficoRecebimento';

function labelRecebimento(r: RecebimentoListItem): string {
  const nf = r.notaFiscal?.trim() || '—';
  return `NF ${nf} · ${r.fornecedor || '—'} · ${r.dataRecebimento || '—'}`;
}

/** Cliente, Projeto e Local vêm sempre das Configurações — mesma base do logo. */
function formatBytesPt(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function mergeObraFromConfig(p: RelatorioFotograficoPayload): RelatorioFotograficoPayload {
  const c = readConfiguracoes();
  return {
    ...p,
    centroCusto: c.cliente.trim(),
    projeto: c.projeto.trim(),
    localObra: c.local.trim(),
  };
}

export function RelatorioFotograficoPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { canAccessAction } = useAuth();
  const canEdit = canAccessAction('relatorios', 'editar');
  const viewOnly = searchParams.get('ver') === '1' || !canEdit;
  const allowEdit = canEdit && !viewOnly;

  const [payload, setPayload] = useState<RelatorioFotograficoPayload>(createEmptyRelatorioFotograficoPayload);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [syncMeta, setSyncMeta] = useState<string>('');
  const [recebimentos, setRecebimentos] = useState<RecebimentoListItem[]>([]);
  const [compressing, setCompressing] = useState(false);
  const [cfgView, setCfgView] = useState(() => readConfiguracoes());
  /** Preferir NFs sem RF já gravado (ligado por defeito em relatório novo). */
  const [somenteSemRf, setSomenteSemRf] = useState(true);
  const [nfDropdownOpen, setNfDropdownOpen] = useState(false);
  const [rfCatalogVersion, setRfCatalogVersion] = useState(0);
  const somenteSemRfInitRef = useRef<string | null>(null);

  const bytesRelatorio = useMemo(() => estimativaBytesPayloadRelatorioFotografico(payload), [payload]);
  const bytesLsAposGravar = useMemo(() => {
    const rid = reportId?.trim() ?? '';
    return estimativaBytesTodoLocalStorageAposGravar(rid, payload);
  }, [payload, reportId]);

  const load = useCallback(async () => {
    if (!reportId?.trim()) return;
    setLoading(true);
    setMsg(null);
    const result = await carregarRelatorioFotografico(reportId.trim());
    setLoading(false);
    if (!result.success || !result.data) {
      setMsg({ tone: 'err', text: result.error ?? 'Falha ao carregar.' });
      return;
    }
    setPayload(mergeObraFromConfig(result.data));
    setRfCatalogVersion((v) => v + 1);
    const src = result.meta?.source === 'supabase' ? 'Nuvem (Supabase)' : 'Local';
    const fr = result.meta?.fallbackReason;
    setSyncMeta(fr ? `${src} — ${fr}` : src);
  }, [reportId]);

  useEffect(() => {
    if (reportId?.trim()) void load();
  }, [load, reportId]);

  useEffect(() => {
    void collectAllPages(async (page, pageSize) => {
      const res = await listarRecebimentos({ busca: '', status: 'todos', modo: 'todos', page, pageSize });
      if (!res.success || !res.data) return { data: undefined };
      return { data: res.data };
    }).then(setRecebimentos);
  }, []);

  useEffect(() => {
    if (loading) {
      somenteSemRfInitRef.current = null;
      return;
    }
    const rid = reportId?.trim();
    if (!rid) return;
    if (somenteSemRfInitRef.current === rid) return;
    somenteSemRfInitRef.current = rid;
    const nuncaSalvo = (Date.parse(payload.salvoEm) || 0) <= 0;
    setSomenteSemRf(nuncaSalvo);
  }, [loading, reportId, payload.salvoEm]);

  const rfPorRecebimento = useMemo(() => {
    void rfCatalogVersion;
    return mapRecebimentoParaRelatoriosFotograficosSalvos();
  }, [rfCatalogVersion]);

  const outrosRfNoRecebimento = useCallback(
    (recebimentoId: string) => {
      const rid = recebimentoId.trim();
      const curId = reportId?.trim() ?? '';
      if (!rid) return [];
      return (rfPorRecebimento.get(rid) ?? []).filter((x) => x.reportId !== curId);
    },
    [rfPorRecebimento, reportId],
  );

  const recebimentosMatchNf = useMemo(() => {
    const q = payload.notaFiscal.trim().toLowerCase();
    let list = recebimentos.filter((r) => {
      if (!q) return true;
      const blob = `${r.notaFiscal ?? ''} ${r.fornecedor ?? ''} ${r.romaneio ?? ''} ${r.dataRecebimento ?? ''}`.toLowerCase();
      return blob.includes(q);
    });
    if (somenteSemRf) {
      list = list.filter((r) => outrosRfNoRecebimento(r.id).length === 0);
    }
    return list.slice(0, 40);
  }, [recebimentos, payload.notaFiscal, somenteSemRf, outrosRfNoRecebimento]);

  const avisoRfDuplicado = useMemo(() => {
    const rid = payload.recebimentoId?.trim();
    if (!rid) return [];
    return outrosRfNoRecebimento(rid);
  }, [payload.recebimentoId, outrosRfNoRecebimento]);

  function aplicarRecebimentoDaLista(r: RecebimentoListItem) {
    setMsg(null);
    setPayload((prev) => ({
      ...mergeObraFromConfig(prev),
      recebimentoId: r.id,
      recebimentoLabel: labelRecebimento(r),
      notaFiscal: r.notaFiscal?.trim() ?? '',
      fornecedor: r.fornecedor?.trim() ?? '',
      romaneio: r.romaneio?.trim() ?? '',
    }));
    setNfDropdownOpen(false);
  }

  function haConteudoDigitado(): boolean {
    return Boolean(
      payload.titulo.trim() ||
        payload.notaFiscal.trim() ||
        payload.recebimentoId.trim() ||
        payload.fotos.length > 0 ||
        payload.observacoes.trim() ||
        payload.rirCodigo.trim(),
    );
  }

  function voltarParaLista() {
    if (allowEdit && haConteudoDigitado()) {
      const ok = window.confirm(
        'Voltar à lista de relatórios? Se ainda não salvou, o que digitou neste ecrã pode ser perdido.',
      );
      if (!ok) return;
    }
    navigate('/relatorio-fotografico');
  }

  /** Atualiza texto de obra/projeto e payload quando volta das Configurações. */
  useEffect(() => {
    const onFocus = () => {
      setCfgView(readConfiguracoes());
      setPayload((p) => mergeObraFromConfig(p));
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const resolverNotaFiscal = useCallback(() => {
    setPayload((prev) => {
      const merged = mergeObraFromConfig(prev);
      const q = merged.notaFiscal.trim();
      if (!q) {
        setMsg(null);
        return {
          ...merged,
          recebimentoId: '',
          recebimentoLabel: '',
          notaFiscal: '',
          fornecedor: '',
          romaneio: '',
        };
      }
      const r = encontrarRecebimentoPorNf(recebimentos, q);
      if (!r) {
        setMsg({ tone: 'info', text: 'Nenhum recebimento encontrado para esta NF. Confira o número.' });
        return {
          ...merged,
          recebimentoId: '',
          recebimentoLabel: '',
          fornecedor: '',
          romaneio: '',
          notaFiscal: q,
        };
      }
      setMsg(null);
      return {
        ...merged,
        recebimentoId: r.id,
        recebimentoLabel: labelRecebimento(r),
        notaFiscal: r.notaFiscal?.trim() ?? q,
        fornecedor: r.fornecedor?.trim() ?? '',
        romaneio: r.romaneio?.trim() ?? '',
      };
    });
  }, [recebimentos]);

  /** Quando o recebimento está vinculado e o campo RIR vazio, sugere o código do RIR do módulo Qualidade (mesmo recebimento). */
  useEffect(() => {
    const rid = payload.recebimentoId?.trim() ?? '';
    if (!rid) return;
    if (payload.rirCodigo.trim()) return;
    let cancelled = false;
    void (async () => {
      const res = await sugerirCodigoRirParaRecebimento(rid);
      if (cancelled) return;
      const codigoSugerido = res.success ? res.data?.trim() ?? '' : '';
      if (!codigoSugerido) return;
      setPayload((p) => {
        const m = mergeObraFromConfig(p);
        if (m.recebimentoId.trim() !== rid || m.rirCodigo.trim()) return m;
        return { ...m, rirCodigo: codigoSugerido };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [payload.recebimentoId, payload.rirCodigo]);

  const onDescartar = async () => {
    if (!allowEdit || !reportId?.trim()) return;
    setLoading(true);
    setMsg(null);
    const result = await carregarRelatorioFotografico(reportId.trim());
    setLoading(false);
    if (!result.success || !result.data) {
      setMsg({ tone: 'err', text: result.error ?? 'Falha ao recarregar.' });
      return;
    }
    setPayload(mergeObraFromConfig(result.data));
    const src = result.meta?.source === 'supabase' ? 'Nuvem (Supabase)' : 'Local';
    const fr = result.meta?.fallbackReason;
    setSyncMeta(fr ? `${src} — ${fr}` : src);
    setMsg({ tone: 'info', text: 'Alterações descartadas (última versão gravada).' });
  };

  const onSave = async () => {
    if (!allowEdit) return;
    setSaving(true);
    setMsg(null);
    const merged = mergeObraFromConfig(payload);
    setPayload(merged);
    const result = await salvarRelatorioFotografico(merged);
    setSaving(false);
    if (!result.success || !result.data) {
      setMsg({ tone: 'err', text: result.error ?? 'Falha ao salvar.' });
      return;
    }
    setPayload(mergeObraFromConfig(result.data));
    const src = result.meta?.source === 'supabase' ? 'Nuvem' : 'Este computador';
    const fr = result.meta?.fallbackReason;
    setMsg({ tone: 'ok', text: fr ? `Salvo localmente. ${fr}` : `Salvo (${src}).` });
    setSyncMeta(fr ? `Local — ${fr}` : src === 'Nuvem' ? 'Nuvem (Supabase)' : 'Local');
    setRfCatalogVersion((v) => v + 1);
  };

  const onPreviewDocumento = async () => {
    setMsg(null);
    try {
      const ready = await hydrateRelatorioFotograficoPayload(mergeObraFromConfig(payload));
      const html = montarHtmlRelatorioFotografico(ready);
      const res = await abrirPreVisualizacaoHtmlRelatorio(html);
      if (!res.ok) {
        setMsg({
          tone: 'err',
          text:
            res.error ??
            'Não foi possível abrir a pré-visualização. Permita pop-ups ou use «Imprimir / PDF».',
        });
      }
    } catch {
      setMsg({
        tone: 'err',
        text: 'Falha ao montar a pré-visualização.',
      });
    }
  };

  const onPrint = async () => {
    if (!payload.reportId.trim()) {
      setMsg({ tone: 'err', text: 'Identificador do relatório em falta.' });
      return;
    }
    const base = mergeObraFromConfig(payload);
    const withNum = ensureNumeroRelatorioFotografico(base);
    setPayload(withNum);
    const ready = await hydrateRelatorioFotograficoPayload(withNum);
    const html = montarHtmlRelatorioFotografico(ready);
    const ok = imprimirRelatorioFotograficoHtml(html);
    if (!ok) {
      setMsg({ tone: 'err', text: 'O navegador bloqueou a janela de impressao.' });
      return;
    }
    if (allowEdit) {
      const reg = await registrarRelatorioFotograficoGerado(ready);
      if (reg.success && reg.data) setPayload(mergeObraFromConfig(reg.data));
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length || !allowEdit) return;
    if (payload.fotos.length >= MAX_FOTOS) {
      setMsg({ tone: 'err', text: `Limite de ${MAX_FOTOS} fotos.` });
      return;
    }
    setCompressing(true);
    setMsg(null);
    const next = [...payload.fotos];
    try {
      for (const file of Array.from(files)) {
        if (next.length >= MAX_FOTOS) break;
        const out = await compressImageFileToJpeg(file, {
          maxEdgePx: 1440,
          maxBytes: 420 * 1024,
          initialQuality: 0.76,
          minQuality: 0.42,
        });
        if (!out) {
          setMsg({ tone: 'info', text: 'Alguns ficheiros nao sao imagens suportadas (ex.: HEIC).' });
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(new Error('Leitura'));
          r.readAsDataURL(out.blob);
        });
        next.push({
          id: crypto.randomUUID(),
          dataUrl,
          legenda: file.name.replace(/\.[^.]+$/, ''),
          createdAt: new Date().toISOString(),
          mostrarLegendaImpressao: true,
        });
      }
      setPayload((prev) => ({ ...mergeObraFromConfig(prev), fotos: next }));
    } catch {
      setMsg({ tone: 'err', text: 'Falha ao processar imagens.' });
    } finally {
      setCompressing(false);
    }
  };

  const updateLegenda = (id: string, legenda: string) => {
    if (!allowEdit) return;
    setPayload((prev) => ({
      ...mergeObraFromConfig(prev),
      fotos: prev.fotos.map((f) => (f.id === id ? { ...f, legenda } : f)),
    }));
  };

  const updateMostrarLegenda = (id: string, mostrarLegendaImpressao: boolean) => {
    if (!allowEdit) return;
    setPayload((prev) => ({
      ...mergeObraFromConfig(prev),
      fotos: prev.fotos.map((f) => (f.id === id ? { ...f, mostrarLegendaImpressao } : f)),
    }));
  };

  const removeFoto = async (fotoId: string) => {
    if (!allowEdit || !reportId?.trim()) return;
    try {
      await mediaBlobDelete(relatorioFotoBlobKey(reportId.trim(), fotoId));
    } catch {
      /* blob pode já não existir */
    }
    const merged = mergeObraFromConfig(payload);
    const next = { ...merged, fotos: merged.fotos.filter((f) => f.id !== fotoId) };
    setPayload(next);
    const r = await salvarRelatorioFotograficoLocalApenas(next);
    if (!r.success) {
      setMsg({ tone: 'err', text: r.error ?? 'Falha ao gravar após remover foto.' });
      await load();
      return;
    }
    if (r.data) setPayload(mergeObraFromConfig(r.data));
  };

  if (!reportId?.trim()) {
    return <Navigate replace to="/relatorio-fotografico" />;
  }

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Relatórios</p>
          <h2>Relatório fotográfico</h2>
        </div>
        <div className="panel-toolbar">
          <div className="panel-toolbar__group" role="group" aria-label="Navegacao">
            <span className="panel-toolbar__label">Navegação</span>
            <div className="panel-toolbar__buttons">
              <button className="ghost-button" onClick={() => voltarParaLista()} type="button">
                Voltar à lista
              </button>
              <Link className="ghost-button" to="/relatorio-fotografico" onClick={(e) => {
                if (allowEdit && haConteudoDigitado()) {
                  const ok = window.confirm(
                    'Ir para a lista? Se ainda não salvou, o que digitou neste ecrã pode ser perdido.',
                  );
                  if (!ok) e.preventDefault();
                }
              }}
              >
                Lista de relatórios
              </Link>
              <Link className="ghost-button" to="/relatorios">
                Painel relatórios
              </Link>
            </div>
          </div>
          {allowEdit ? (
            <div className="panel-toolbar__group" role="group" aria-label="Gravar documento">
              <span className="panel-toolbar__label">Documento</span>
              <div className="panel-toolbar__buttons">
                <Button disabled={saving || loading} onClick={() => void onSave()} type="button" variant="primary">
                  {saving ? 'Salvando…' : 'Salvar'}
                </Button>
                <Button disabled={saving || loading} onClick={() => void onDescartar()} type="button" variant="ghost">
                  Descartar alterações
                </Button>
              </div>
            </div>
          ) : null}
          <div className="panel-toolbar__group" role="group" aria-label="Impressao">
            <span className="panel-toolbar__label">Saída</span>
            <div className="panel-toolbar__buttons">
              <Button disabled={loading} onClick={() => void onPreviewDocumento()} type="button" variant="ghost">
                Visualizar
              </Button>
              <Button disabled={loading} onClick={() => void onPrint()} type="button" variant="ghost">
                Imprimir / PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          {viewOnly ? (
            <>
              Modo <strong>visualização</strong>. Use <strong>Visualizar</strong> para ver o relatório como na impressão, ou{' '}
              <strong>Imprimir / PDF</strong> para o diálogo de impressão. Para alterar dados ou fotos volte à lista e escolha{' '}
              <strong>Editar</strong>.
            </>
          ) : (
            <>
              Digite ou escolha a <strong>nota fiscal</strong> na lista — preenchem-se <strong>fornecedor</strong> e <strong>romaneio</strong>.
              Por defeito só aparecem recebimentos <strong>sem relatório fotográfico gravado</strong> (desmarque para ver todas as NFs). Use{' '}
              <strong>Voltar à lista</strong> ou <strong>Lista de relatórios</strong> para sair sem obrigação de salvar (confirmação se já
              digitou algo). <strong>Cliente</strong>, <strong>projeto</strong> e <strong>local</strong> vêm das <strong>Configurações</strong>.
              O <strong>número do relatório</strong> é gerado ao salvar ou imprimir. Impressão: até 4 fotos por página.
            </>
          )}
        </p>
      </ModuleHelp>

      {syncMeta ? (
        <p className="panel-copy" style={{ fontSize: 13 }}>
          <strong>Origem:</strong> {syncMeta}
        </p>
      ) : null}

      {msg ? (
        <OperationalNotice tone={msg.tone === 'err' ? 'critical' : msg.tone === 'info' ? 'warning' : 'neutral'}>
          {msg.text}
        </OperationalNotice>
      ) : null}

      {loading ? <OperationalNotice>Carregando…</OperationalNotice> : null}

      <div className="section-block" style={{ display: 'grid', gap: 16, maxWidth: 960 }}>
        <p className="panel-copy" style={{ marginBottom: 0 }}>
          <strong>Nº do relatório:</strong>{' '}
          {payload.numeroRelatorio.trim() ? (
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{payload.numeroRelatorio}</span>
          ) : (
            <span style={{ color: 'var(--text-muted, #888)' }}>será gerado ao salvar ou imprimir</span>
          )}
        </p>

        <Input
          disabled={!allowEdit}
          label="Título do relatório (capa / impressão)"
          onChange={(e) => setPayload((prev) => ({ ...mergeObraFromConfig(prev), titulo: e.target.value }))}
          value={payload.titulo}
        />

        {allowEdit ? (
          <label className="rir-rec-filter">
            <input
              checked={somenteSemRf}
              onChange={(e) => setSomenteSemRf(e.target.checked)}
              type="checkbox"
            />
            <span>
              Mostrar apenas recebimentos <strong>sem relatório fotográfico gravado</strong> (evita duplicar). Desmarque para listar todas as
              NFs.
            </span>
          </label>
        ) : null}

        <div className="rir-rec-wrap">
          <Input
            disabled={!allowEdit}
            label="Nota fiscal — digite, escolha na lista ou Enter / clique fora para localizar"
            onBlur={() => {
              resolverNotaFiscal();
              window.setTimeout(() => setNfDropdownOpen(false), 180);
            }}
            onChange={(e) => {
              setPayload((prev) => ({ ...mergeObraFromConfig(prev), notaFiscal: e.target.value }));
              setNfDropdownOpen(true);
            }}
            onFocus={() => allowEdit && setNfDropdownOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                resolverNotaFiscal();
                setNfDropdownOpen(false);
              }
              if (e.key === 'Escape') setNfDropdownOpen(false);
            }}
            value={payload.notaFiscal}
          />
          {allowEdit && nfDropdownOpen && recebimentos.length > 0 && recebimentosMatchNf.length === 0 && payload.notaFiscal.trim() ? (
            <div className="rir-rec-dropdown rir-rec-dropdown--empty" role="status">
              Nenhum recebimento corresponde
              {somenteSemRf ? ' com o filtro «sem RF». Desmarque o filtro ou altere o texto.' : '.'}
            </div>
          ) : null}
          {allowEdit && nfDropdownOpen && recebimentosMatchNf.length > 0 ? (
            <div className="rir-rec-dropdown" role="listbox">
              {recebimentosMatchNf.map((r) => {
                const jaRf = outrosRfNoRecebimento(r.id).length > 0;
                return (
                  <button
                    className={`rir-rec-option${jaRf ? ' rir-rec-option--ja-rir' : ''}`}
                    key={r.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => aplicarRecebimentoDaLista(r)}
                    type="button"
                  >
                    <span className="rir-rec-option-label">{labelRecebimento(r)}</span>
                    {jaRf ? <span className="rir-rec-option-badge">Já tem RF</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {payload.recebimentoId ? (
          <>
            <p className="panel-copy" style={{ marginTop: -4 }}>
              <strong>Recebimento vinculado:</strong> {payload.recebimentoLabel}
            </p>
            {avisoRfDuplicado.length > 0 ? (
              <div className="rir-duplicado-banner" role="status">
                <p>
                  <strong>Atenção:</strong> já existe relatório fotográfico neste computador para o mesmo recebimento:{' '}
                  {avisoRfDuplicado.map((x) => x.numeroRelatorio.trim() || x.titulo).join(', ')}. Evite duplicar salvo exceção documentada.
                </p>
                <div className="rir-duplicado-banner-actions">
                  {avisoRfDuplicado.map((x) => (
                    <Link className="ghost-button" key={x.reportId} to={`/relatorio-fotografico/editar/${x.reportId}`}>
                      Abrir {x.numeroRelatorio.trim() || x.titulo}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          <Input disabled label="Fornecedor (automático pela NF)" value={payload.fornecedor} />
          <Input disabled label="Romaneio (automático pela NF)" value={payload.romaneio} />
        </div>

        <div
          className="info-card"
          style={{ padding: '12px 14px', fontSize: 13, lineHeight: 1.5 }}
        >
          <p className="panel-kicker" style={{ marginBottom: 6 }}>
            Cliente, projeto e local (Configurações)
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>Cliente:</strong> {cfgView.cliente.trim() || '—'}
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>Projeto:</strong> {cfgView.projeto.trim() || '—'}
          </p>
          <p style={{ margin: '4px 0' }}>
            <strong>Local:</strong> {cfgView.local.trim() || '—'}
          </p>
          <ModuleHelp>
            <p className="panel-copy" style={{ marginTop: 8, marginBottom: 0 }}>
              Os mesmos campos de <strong>Configurações</strong> usados no contexto do logo. Altere-os lá para atualizar aqui e na impressão.
            </p>
          </ModuleHelp>
        </div>

        <Input
          disabled={!allowEdit}
          label="RIR — referência (código ou texto)"
          onChange={(e) => setPayload((prev) => ({ ...mergeObraFromConfig(prev), rirCodigo: e.target.value }))}
          value={payload.rirCodigo}
        />
        <ModuleHelp>
          <p className="panel-copy" style={{ marginTop: 4, fontSize: 12, lineHeight: 1.45 }}>
            Com o <strong>recebimento vinculado</strong> (NF localizada), se existir RIR em Qualidade para a mesma NF/recebimento e este
            campo estiver vazio, o <strong>código do RIR</strong> é preenchido automaticamente — prioridade: estado{' '}
            <strong>Tratado</strong> (relatório pronto), depois <strong>Em análise</strong>, depois <strong>Aberto</strong>; o mais recente
            em caso de vários. Pode alterar o texto à mão a qualquer momento.
          </p>
        </ModuleHelp>

        <label className="field" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            checked={payload.incluirLogoImpressao}
            disabled={!allowEdit}
            onChange={(e) => setPayload((prev) => ({ ...mergeObraFromConfig(prev), incluirLogoImpressao: e.target.checked }))}
            type="checkbox"
          />
          <span>Incluir logo institucional na impressão (definido em Configurações)</span>
        </label>

        <label className="field" style={{ display: 'grid', gap: 6 }}>
          <span>Observações (aparecem no cabeçalho impresso)</span>
          <textarea
            disabled={!allowEdit}
            onChange={(e) => setPayload((prev) => ({ ...mergeObraFromConfig(prev), observacoes: e.target.value }))}
            rows={3}
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid var(--border-strong)',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
            value={payload.observacoes}
          />
        </label>

        <div>
          <p className="panel-copy" style={{ marginBottom: 8 }}>
            <strong>Fotos</strong> — {payload.fotos.length}/{MAX_FOTOS}. Impressão em blocos de 4 por página.{' '}
            {compressing ? 'A comprimir…' : null}
          </p>
          {!loading ? (
            <ModuleHelp>
              <p
                className="panel-copy"
                style={{
                  marginBottom: 8,
                  fontSize: 13,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border-strong)',
                  background:
                    bytesLsAposGravar >= 4.5 * 1024 * 1024
                      ? 'rgba(220, 38, 38, 0.12)'
                      : bytesLsAposGravar >= 3 * 1024 * 1024
                        ? 'rgba(234, 179, 8, 0.12)'
                        : 'var(--surface-elevated, rgba(148, 163, 184, 0.08))',
                }}
              >
                <strong>Armazenamento (navegador):</strong> este relatório ~{formatBytesPt(bytesRelatorio)} se gravado agora ·{' '}
                <strong>total localStorage da app</strong> (estimado após gravar) ~{formatBytesPt(bytesLsAposGravar)}. O limite depende do
                browser e do Electron (muitas vezes da ordem de <strong>5–10 MB por origem</strong> para o{' '}
                <code>localStorage</code> total). As fotos do relatório ficam em <strong>IndexedDB</strong> (referências no JSON), o que
                reduz muito o peso no <code>localStorage</code>. Se subir muito, guarde PDF, reduza fotos ou apague relatórios antigos;
                com nuvem ativa o risco de perda por quota local diminui.
              </p>
            </ModuleHelp>
          ) : null}
          {allowEdit ? (
            <input
              accept="image/*"
              disabled={compressing || payload.fotos.length >= MAX_FOTOS}
              multiple
              onChange={(e) => void onFiles(e.target.files)}
              type="file"
            />
          ) : null}
        </div>

        <ModuleHelp>
          <p className="panel-copy">
            Relatórios HTML gerados (contador): <strong>{payload.relatoriosGerados}</strong>
          </p>
        </ModuleHelp>
      </div>

      <div
        className="cards-grid"
        style={{
          marginTop: 20,
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        }}
      >
        {payload.fotos.map((f) => (
          <div className="info-card" key={f.id}>
            <div
              style={{
                width: '100%',
                aspectRatio: '4 / 3',
                maxHeight: 220,
                marginBottom: 8,
                borderRadius: 8,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--surface-elevated, rgba(148, 163, 184, 0.12))',
              }}
            >
              <img
                alt=""
                src={f.dataUrl ?? ''}
                style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }}
              />
            </div>
            {allowEdit ? (
              <>
                <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    checked={f.mostrarLegendaImpressao}
                    onChange={(e) => updateMostrarLegenda(f.id, e.target.checked)}
                    type="checkbox"
                  />
                  <span>Mostrar legenda na impressão</span>
                </label>
                <Input
                  disabled={!f.mostrarLegendaImpressao}
                  label="Legenda (se ativada acima)"
                  onChange={(e) => updateLegenda(f.id, e.target.value)}
                  value={f.legenda}
                />
                <Button onClick={() => void removeFoto(f.id)} type="button" variant="ghost">
                  Remover foto
                </Button>
              </>
            ) : (
              <>
                {f.mostrarLegendaImpressao ? <p className="panel-copy">{f.legenda}</p> : <p className="panel-copy">Sem legenda na impressão</p>}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
