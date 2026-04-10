import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  excluirRelatorioFotograficoLocal,
  listarMetadadosRelatoriosFotograficos,
} from '../services/relatorioFotografico.service';
import type { RelatorioFotograficoMeta } from '../types/relatorioFotografico.types';

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

  const refresh = useCallback(() => {
    setItems(listarMetadadosRelatoriosFotograficos());
  }, []);

  const novo = () => {
    const id = crypto.randomUUID();
    navigate(`/relatorio-fotografico/editar/${id}`);
  };

  const onExcluir = (m: RelatorioFotograficoMeta) => {
    if (!canEdit) return;
    const ok = window.confirm(
      `Excluir o relatório "${m.titulo}"${m.numeroRelatorio ? ` (${m.numeroRelatorio})` : ''}? Esta ação não pode ser desfeita.`,
    );
    if (!ok) return;
    const r = excluirRelatorioFotograficoLocal(m.id);
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
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <p className="panel-copy">
        Cada relatório tem o seu próprio número, fotos e vínculo opcional a recebimentos. Use <strong>Visualizar</strong> só para
        consultar; <strong>Editar</strong> para alterar; <strong>Excluir</strong> remove definitivamente deste computador.
      </p>

      {msg ? (
        <OperationalNotice tone={msg.tone === 'err' ? 'critical' : 'neutral'}>{msg.text}</OperationalNotice>
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
                      <Link className="ghost-button" to={`/relatorio-fotografico/editar/${m.id}?ver=1`}>
                        Visualizar
                      </Link>
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
