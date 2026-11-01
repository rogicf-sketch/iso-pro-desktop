import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ListPageShell, PanelToolbarGroup } from '../../../components/layout/ListPageShell';
import { preVisualizarRelatorioProfissional, nomeArquivoRelatorioPdf } from '../../../lib/relatorioProfissional';
import { resolveFonteNuvemOk } from '../../../lib/fonteNuvemLista';
import { getSupabaseOperationalStatus, hasSupabaseConfig } from '../../../lib/supabase';
import { Button } from '../../../components/ui/Button';
import { useConfirmDialog } from '../../../components/ui/ConfirmDialogProvider';
import { FonteDadosNotice } from '../../../components/ui/FonteDadosNotice';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { usePageChrome } from '../../../layouts/PageChromeContext';
import { useAuth } from '../../auth/hooks/useAuth';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { RelatorioFotograficoFilters } from '../components/RelatorioFotograficoFilters';
import { RelatorioFotograficoTable } from '../components/RelatorioFotograficoTable';
import {
  carregarRelatorioFotografico,
  hydrateRelatorioFotograficoPayloadForPreview,
  estimativaBytesTodoLocalStorage,
  estimativaBytesTotalArmazenamentoRfLocal,
  excluirRelatorioFotograficoLocal,
  limparTodosRelatoriosFotograficosLocais,
  listarMetadadosRelatoriosFotograficosComNuvem,
} from '../services/relatorioFotografico.service';
import type { RelatorioFotograficoMeta, RelatorioFotograficoPayload } from '../types/relatorioFotografico.types';
import { montarHtmlRelatorioFotografico } from '../utils/imprimirRelatorioFotograficoHtml';

function formatBytesPt(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function mergeObraFromConfigRf(p: RelatorioFotograficoPayload): RelatorioFotograficoPayload {
  const c = readConfiguracoes();
  return {
    ...p,
    centroCusto: c.cliente.trim(),
    projeto: c.projeto.trim(),
    localObra: c.local.trim(),
  };
}

function formatSalvo(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

type RfListLocationState = {
  rfSalvoOk?: boolean;
  mensagem?: string;
};

export function RelatorioFotograficoListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { confirm } = useConfirmDialog();
  const { canAccessAction } = useAuth();
  const canEdit = canAccessAction('relatorios', 'editar');
  const cloudStatus = getSupabaseOperationalStatus();
  const hasCloudConfig = hasSupabaseConfig();

  const [items, setItems] = useState<RelatorioFotograficoMeta[]>([]);
  const [listSource, setListSource] = useState<'supabase' | 'local' | 'remote'>('local');
  const [fallbackReason, setFallbackReason] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    void listarMetadadosRelatoriosFotograficosComNuvem().then((r) => {
      if (r.success && r.data) {
        setItems(r.data);
        setListSource(r.meta?.source === 'supabase' ? 'supabase' : 'local');
        setFallbackReason(r.meta?.fallbackReason);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const st = location.state as RfListLocationState | null;
    if (!st?.rfSalvoOk) return;
    setMsg({ tone: 'ok', text: st.mensagem?.trim() || 'Relatório fotográfico salvo.' });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const fonteNuvemOk = resolveFonteNuvemOk({
    listSource,
    hasCloudConfig,
    fallbackReason,
  });

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return items;
    return items.filter((m) => {
      const titulo = m.titulo.toLowerCase();
      const num = m.numeroRelatorio.toLowerCase();
      return titulo.includes(q) || num.includes(q);
    });
  }, [items, busca]);

  usePageChrome(
    {
      meta:
        loading && items.length === 0
          ? 'A carregar…'
          : `${items.length.toLocaleString('pt-BR')} RF · ${fonteNuvemOk ? 'nuvem' : 'local'}`,
    },
    [loading, items.length, fonteNuvemOk],
  );

  const bytesRf = estimativaBytesTotalArmazenamentoRfLocal();
  const bytesLs = estimativaBytesTodoLocalStorage();

  const novo = () => {
    const id = crypto.randomUUID();
    navigate(`/relatorio-fotografico/editar/${id}`);
  };

  const onVisualizar = async (m: RelatorioFotograficoMeta) => {
    setPreviewId(m.id);
    setMsg(null);
    try {
      const result = await carregarRelatorioFotografico(m.id);
      if (!result.success || !result.data) {
        setMsg({ tone: 'err', text: result.error ?? 'Falha ao carregar o relatório.' });
        return;
      }
      // Mesmo fluxo da web: URLs assinadas + overlay (rápido; fotos carregam).
      const ready = await hydrateRelatorioFotograficoPayloadForPreview(mergeObraFromConfigRf(result.data));
      const html = await montarHtmlRelatorioFotografico(ready);
      const codigo = ready.numeroRelatorio || ready.titulo || m.id;
      const res = await preVisualizarRelatorioProfissional({
        html,
        fileName: nomeArquivoRelatorioPdf(String(codigo), 'RF'),
        titulo: `Pré-visualização — ${codigo}`,
        tipoNuvem: 'relatorio_fotografico',
      });
      if (!res.ok) {
        setMsg({
          tone: 'err',
          text:
            res.error ??
            'Não foi possível abrir a pré-visualização. Permita pop-ups ou use Editar e depois «Imprimir / PDF».',
        });
      }
    } catch {
      setMsg({ tone: 'err', text: 'Falha ao montar a pré-visualização.' });
    } finally {
      setPreviewId(null);
    }
  };

  const onLimparTodosLocais = async () => {
    if (!canEdit) return;
    const ok = await confirm({
      title: 'Limpar armazenamento local',
      message:
        'Apagar TODOS os relatórios fotográficos guardados neste computador?\n\nIsto remove o catálogo, os dados em localStorage e as fotos em IndexedDB (prefixo rf:). Não pode ser desfeito.',
      danger: true,
      confirmLabel: 'Apagar tudo',
    });
    if (!ok) return;
    setMsg(null);
    const r = await limparTodosRelatoriosFotograficosLocais();
    if (!r.success) {
      setMsg({ tone: 'err', text: r.error ?? 'Falha ao limpar.' });
      return;
    }
    const n = r.data?.chavesPayload ?? 0;
    const c = r.data?.removidosCatalogo ?? 0;
    setMsg({ tone: 'ok', text: `Armazenamento local limpo (${n} chave(s) de payload, ${c} id(s) no catálogo).` });
    refresh();
  };

  const onExcluir = async (m: RelatorioFotograficoMeta) => {
    if (!canEdit) return;
    const ok = await confirm({
      message: `Excluir o relatório "${m.titulo}"${m.numeroRelatorio ? ` (${m.numeroRelatorio})` : ''}? Esta ação não pode ser desfeita.`,
      danger: true,
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    const r = await excluirRelatorioFotograficoLocal(m.id);
    if (!r.success) {
      setMsg({ tone: 'err', text: r.error ?? 'Falha ao excluir.' });
      return;
    }
    setMsg({ tone: 'ok', text: 'Relatório excluído.' });
    refresh();
  };

  return (
    <ListPageShell
      toolbar={
        <>
          <PanelToolbarGroup label="Navegação" aria-label="Navegacao">
            <Link className="ghost-button" to="/relatorios">
              Painel relatórios
            </Link>
          </PanelToolbarGroup>
          {canEdit ? (
            <PanelToolbarGroup label="Registo" aria-label="Novo relatorio">
              <Button onClick={novo} type="button" variant="primary">
                Novo relatório
              </Button>
              <Button onClick={() => void onLimparTodosLocais()} type="button" variant="ghost">
                Limpar tudo (este PC)
              </Button>
            </PanelToolbarGroup>
          ) : null}
        </>
      }
      notices={
        <>
          <ModuleHelp>
            <p className="panel-copy">
              Cada relatório tem o seu próprio número, fotos e vínculo opcional a recebimentos. Use a pré-visualização
              (ícone olho) antes de imprimir/PDF. <strong>Limpar tudo (este PC)</strong> apaga catálogo local e fotos em
              IndexedDB.
            </p>
          </ModuleHelp>
          <FonteDadosNotice
            healthy={fonteNuvemOk}
            fallbackMessage={
              hasCloudConfig
                ? 'Fonte atual: fallback local. A lista ainda nao veio da nuvem (rede ou sync).'
                : cloudStatus === 'partial'
                  ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
                  : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'
            }
          />
          {fallbackReason ? (
            <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice>
          ) : null}
          {msg ? (
            <OperationalNotice tone={msg.tone === 'err' ? 'critical' : 'success'}>{msg.text}</OperationalNotice>
          ) : null}
          {previewId ? <OperationalNotice>A abrir pré-visualização…</OperationalNotice> : null}
          {!canEdit ? (
            <OperationalNotice>O seu perfil pode consultar relatórios, mas não pode alterar registos.</OperationalNotice>
          ) : null}
        </>
      }
      filters={<RelatorioFotograficoFilters busca={busca} onBuscaChange={setBusca} />}
      beforeTable={
        items.length > 0 ? (
          <ModuleHelp>
            <OperationalNotice
              tone={
                bytesLs >= 4.5 * 1024 * 1024 ? 'critical' : bytesRf >= 2.5 * 1024 * 1024 ? 'warning' : 'neutral'
              }
            >
              Espaço no navegador: relatórios fotográficos ~{formatBytesPt(bytesRf)} · total da app no localStorage ~
              {formatBytesPt(bytesLs)}. Valores aproximados; muitas fotos em alta definição enchem rápido — use PDF
              arquivado e apague o que não precisar.
            </OperationalNotice>
          </ModuleHelp>
        ) : null
      }
    >
      {loading && items.length === 0 ? (
        <OperationalNotice>Carregando relatórios fotográficos…</OperationalNotice>
      ) : (
        <RelatorioFotograficoTable
          canEdit={canEdit}
          formatSalvo={formatSalvo}
          items={filtered}
          onEdit={(m) => navigate(`/relatorio-fotografico/editar/${m.id}`)}
          onExcluir={(m) => void onExcluir(m)}
          onVisualizar={(m) => void onVisualizar(m)}
          previewId={previewId}
        />
      )}
    </ListPageShell>
  );
}
