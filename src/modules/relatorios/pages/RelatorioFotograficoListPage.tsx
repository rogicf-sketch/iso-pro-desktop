import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { abrirPreVisualizacaoHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import { Button } from '../../../components/ui/Button';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { useAuth } from '../../auth/hooks/useAuth';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import {
  carregarRelatorioFotografico,
  estimativaBytesTodoLocalStorage,
  estimativaBytesTotalArmazenamentoRfLocal,
  excluirRelatorioFotograficoLocal,
  hydrateRelatorioFotograficoPayload,
  limparTodosRelatoriosFotograficosLocais,
  listarMetadadosRelatoriosFotograficos,
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

export function RelatorioFotograficoListPage() {
  const navigate = useNavigate();
  const { canAccessAction } = useAuth();
  const canEdit = canAccessAction('relatorios', 'editar');

  const [items, setItems] = useState<RelatorioFotograficoMeta[]>(() => listarMetadadosRelatoriosFotograficos());
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setItems(listarMetadadosRelatoriosFotograficos());
  }, []);

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
      const ready = await hydrateRelatorioFotograficoPayload(mergeObraFromConfigRf(result.data));
      const html = montarHtmlRelatorioFotografico(ready);
      const res = await abrirPreVisualizacaoHtmlRelatorio(html);
      if (!res.ok) {
        setMsg({
          tone: 'err',
          text:
            res.error ??
            'Não foi possível abrir a janela de pré-visualização. Permita pop-ups para este site ou use Editar e depois «Imprimir / PDF».',
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
    const ok = window.confirm(
      'Apagar TODOS os relatórios fotográficos guardados neste computador?\n\nIsto remove o catálogo, os dados em localStorage e as fotos em IndexedDB (prefixo rf:). Não pode ser desfeito.',
    );
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
    const ok = window.confirm(
      `Excluir o relatório "${m.titulo}"${m.numeroRelatorio ? ` (${m.numeroRelatorio})` : ''}? Esta ação não pode ser desfeita.`,
    );
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
              <Link className="ghost-button" to="/relatorios">
                Painel relatórios
              </Link>
            </div>
          </div>
          {canEdit ? (
            <div className="panel-toolbar__group" role="group" aria-label="Novo relatorio">
              <span className="panel-toolbar__label">Registo</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={novo} type="button" variant="primary">
                  Novo relatório
                </Button>
                <Button onClick={() => void onLimparTodosLocais()} type="button" variant="ghost">
                  Limpar tudo (este PC)
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Cada relatório tem o seu próprio número, fotos e vínculo opcional a recebimentos. <strong>Visualizar</strong> mostra o relatório
          pronto para impressão (janela nova ou painel sobreposto nesta app — Ctrl+P para PDF). <strong>Editar</strong> abre a ficha de
          preenchimento; <strong>Excluir</strong> remove um relatório. <strong>Limpar tudo (este PC)</strong> apaga todos os relatórios
          fotográficos locais e as fotos em IndexedDB.
        </p>
      </ModuleHelp>

      {msg ? (
        <OperationalNotice tone={msg.tone === 'err' ? 'critical' : 'neutral'}>{msg.text}</OperationalNotice>
      ) : null}

      {items.length > 0 ? (
        <ModuleHelp>
          <p
            className="panel-copy"
            style={{
              fontSize: 13,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border-strong)',
              background:
                bytesLs >= 4.5 * 1024 * 1024
                  ? 'rgba(220, 38, 38, 0.12)'
                  : bytesRf >= 2.5 * 1024 * 1024
                    ? 'rgba(234, 179, 8, 0.12)'
                    : 'var(--surface-elevated, rgba(148, 163, 184, 0.08))',
            }}
          >
            <strong>Espaço no navegador:</strong> relatórios fotográficos ~{formatBytesPt(bytesRf)} · total da app no{' '}
            <code>localStorage</code> ~{formatBytesPt(bytesLs)}. Valores aproximados; o teto real é do browser (frequentemente modesto). Muitas
            fotos em alta definição enchem rápido — use PDF arquivado e apague o que não precisar.
          </p>
        </ModuleHelp>
      ) : null}

      {items.length === 0 ? (
        <div className="info-card" style={{ padding: 20 }}>
          <p className="panel-copy" style={{ marginBottom: 12 }}>
            Ainda não há relatórios guardados neste equipamento.
          </p>
          {canEdit ? (
            <Button onClick={novo} type="button" variant="primary">
              Criar primeiro relatório
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="section-block" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-strong)' }}>
                <th style={{ padding: '10px 8px' }}>Título</th>
                <th style={{ padding: '10px 8px' }}>Nº</th>
                <th style={{ padding: '10px 8px' }}>Fotos</th>
                <th style={{ padding: '10px 8px' }}>Atualizado</th>
                <th style={{ padding: '10px 8px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px 8px', maxWidth: 280 }}>{m.titulo}</td>
                  <td style={{ padding: '10px 8px', fontVariantNumeric: 'tabular-nums' }}>{m.numeroRelatorio || '—'}</td>
                  <td style={{ padding: '10px 8px' }}>{m.fotoCount}</td>
                  <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{formatSalvo(m.salvoEm)}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <button
                        className="ghost-button"
                        disabled={previewId === m.id}
                        onClick={() => void onVisualizar(m)}
                        type="button"
                      >
                        {previewId === m.id ? 'A abrir…' : 'Visualizar'}
                      </button>
                      {canEdit ? (
                        <Link className="ghost-button" to={`/relatorio-fotografico/editar/${m.id}`}>
                          Editar
                        </Link>
                      ) : null}
                      {canEdit ? (
                        <Button onClick={() => onExcluir(m)} type="button" variant="ghost">
                          Excluir
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
