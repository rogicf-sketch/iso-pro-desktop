import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { collectAllPages } from '../../../lib/collectAllPages';
import { compressImageFileToJpeg } from '../../../lib/imageCompress';
import { useAuth } from '../../auth/hooks/useAuth';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { listarRecebimentos } from '../../recebimentos/services/recebimentos.service';
import type { RecebimentoListItem } from '../../recebimentos/types/recebimento.types';
import {
  MAX_FOTOS,
  carregarRelatorioFotografico,
  createEmptyRelatorioFotograficoPayload,
  ensureNumeroRelatorioFotografico,
  registrarRelatorioFotograficoGerado,
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
  };

  const onPrint = async () => {
    if (!payload.reportId.trim()) {
      setMsg({ tone: 'err', text: 'Identificador do relatório em falta.' });
      return;
    }
    const base = mergeObraFromConfig(payload);
    const withNum = ensureNumeroRelatorioFotografico(base);
    setPayload(withNum);
    const html = montarHtmlRelatorioFotografico(withNum);
    const ok = imprimirRelatorioFotograficoHtml(html);
    if (!ok) {
      setMsg({ tone: 'err', text: 'O navegador bloqueou a janela de impressao.' });
      return;
    }
    if (allowEdit) {
      const reg = await registrarRelatorioFotograficoGerado(withNum);
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
        const out = await compressImageFileToJpeg(file);
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
    if (!allowEdit) return;
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
              <Link className="ghost-button" to="/relatorio-fotografico">
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
              <Button disabled={loading} onClick={() => void onPrint()} type="button" variant="ghost">
                Imprimir / PDF
              </Button>
            </div>
          </div>
        </div>
      </div>

      <p className="panel-copy">
        {viewOnly ? (
          <>
            Modo <strong>visualização</strong>. Use <strong>Imprimir / PDF</strong> se precisar; para alterar dados ou fotos volte à lista e
            escolha <strong>Editar</strong>.
          </>
        ) : (
          <>
            Digite a <strong>nota fiscal</strong> do recebimento e saia do campo (ou Enter) para preencher <strong>fornecedor</strong> e{' '}
            <strong>romaneio</strong> automaticamente. <strong>Cliente</strong>, <strong>projeto</strong> e <strong>local</strong> seguem as{' '}
            <strong>Configurações</strong> (mesma base do logo). O <strong>número do relatório</strong> é gerado ao salvar ou imprimir. A
            remoção de fotos é gravada logo no armazenamento local. Impressão: até 4 fotos por página; legenda opcional por foto.
          </>
        )}
      </p>

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

        <Input
          disabled={!allowEdit}
          label="Nota fiscal — digite e pressione Enter ou clique fora para localizar o recebimento"
          onBlur={() => resolverNotaFiscal()}
          onChange={(e) => setPayload((prev) => ({ ...mergeObraFromConfig(prev), notaFiscal: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              resolverNotaFiscal();
            }
          }}
          value={payload.notaFiscal}
        />

        {payload.recebimentoId ? (
          <p className="panel-copy" style={{ marginTop: -4 }}>
            <strong>Recebimento vinculado:</strong> {payload.recebimentoLabel}
          </p>
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
          <p className="panel-copy" style={{ marginTop: 8, marginBottom: 0 }}>
            Os mesmos campos de <strong>Configurações</strong> usados no contexto do logo. Altere-os lá para atualizar aqui e na impressão.
          </p>
        </div>

        <Input
          disabled={!allowEdit}
          label="RIR — referência (código ou texto)"
          onChange={(e) => setPayload((prev) => ({ ...mergeObraFromConfig(prev), rirCodigo: e.target.value }))}
          value={payload.rirCodigo}
        />

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

        <p className="panel-copy">
          Relatórios HTML gerados (contador): <strong>{payload.relatoriosGerados}</strong>
        </p>
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
            <img alt="" src={f.dataUrl} style={{ width: '100%', height: 'auto', borderRadius: 8, marginBottom: 8 }} />
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
