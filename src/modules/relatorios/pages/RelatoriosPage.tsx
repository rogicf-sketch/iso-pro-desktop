import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { listarIndicadoresRelatorios, listarResumosRelatorios } from '../services/relatorios.service';
import type { RelatorioIndicador, RelatorioResumo, RelatorioTom } from '../types/relatorio.types';
import { RELATORIO_CATEGORIA_LABEL, resumoSegurancaExigeAlerta } from '../utils/relatorioOverview';

function tomClass(tom: RelatorioTom | undefined, prefix: string): string {
  if (tom === 'ok') return `${prefix}--ok`;
  if (tom === 'warning') return `${prefix}--warning`;
  if (tom === 'danger') return `${prefix}--danger`;
  return `${prefix}--neutral`;
}

export function RelatoriosPage() {
  const [indicadores, setIndicadores] = useState<RelatorioIndicador[]>([]);
  const [resumos, setResumos] = useState<RelatorioResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [atualizadoEm, setAtualizadoEm] = useState<string>('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const [ind, res] = await Promise.all([listarIndicadoresRelatorios(), listarResumosRelatorios()]);
      setIndicadores(ind);
      setResumos(res);
      setAtualizadoEm(res[0]?.atualizadoEm || new Date().toLocaleString('pt-BR'));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar o painel de relatórios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const resumoSeguranca = useMemo(() => resumos.find((item) => item.categoria === 'seguranca'), [resumos]);
  const mostrarAlertaLicenca = Boolean(
    resumoSeguranca && resumoSegurancaExigeAlerta(resumoSeguranca.detalhe),
  );

  return (
    <div className="panel relatorios-overview">
      <div className="panel-header relatorios-overview__header">
        <div>
          <p className="panel-kicker">Gestão executiva</p>
          <h2>Relatórios</h2>
          <p className="relatorios-overview__subtitle">
            Indicadores da obra, documentos de encerramento e situação operacional — numa só vista.
          </p>
        </div>
        <div className="relatorios-overview__header-meta">
          {atualizadoEm ? (
            <span className="relatorios-overview__stamp">Actualizado {atualizadoEm}</span>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => void carregar()} disabled={loading}>
            {loading ? 'A actualizar…' : 'Actualizar'}
          </Button>
        </div>
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Painel gerencial: KPIs do projecto, relatório fotográfico e relatório final de obra para diretoria e cliente.
        </p>
      </ModuleHelp>

      {erro ? <OperationalNotice tone="critical">{erro}</OperationalNotice> : null}
      {mostrarAlertaLicenca && resumoSeguranca ? (
        <OperationalNotice tone="warning">{resumoSeguranca.detalhe}</OperationalNotice>
      ) : null}

      <section className="relatorios-overview__section" aria-label="Documentos de encerramento">
        <div className="relatorios-overview__section-head">
          <h3>Documentos</h3>
          <span>Encerramento e evidências</span>
        </div>
        <div className="relatorios-overview__actions">
          <Link className="relatorios-action relatorios-action--primary" to="/relatorios/final-obra">
            <span className="relatorios-action__kicker">Encerramento de obra</span>
            <strong>Relatório final de obra</strong>
            <span className="relatorios-action__hint">PDF, Word e Excel para diretoria e cliente</span>
            <span className="relatorios-action__cta">Gerar relatório</span>
          </Link>
          <Link className="relatorios-action" to="/relatorio-fotografico">
            <span className="relatorios-action__kicker">Evidências</span>
            <strong>Relatório fotográfico</strong>
            <span className="relatorios-action__hint">Fotos, vínculo a recebimentos e impressão</span>
            <span className="relatorios-action__cta">Abrir</span>
          </Link>
        </div>
      </section>

      <section className="relatorios-overview__section" aria-label="Indicadores">
        <div className="relatorios-overview__section-head">
          <h3>Indicadores</h3>
          <span>Clique para abrir o módulo</span>
        </div>
        <div className="relatorios-overview__kpis">
          {loading && indicadores.length === 0
            ? Array.from({ length: 6 }).map((_, i) => (
                <article className="relatorios-kpi relatorios-kpi--skeleton" key={`sk-${i}`}>
                  <span className="relatorios-kpi__skel relatorios-kpi__skel--short" />
                  <span className="relatorios-kpi__skel relatorios-kpi__skel--tall" />
                </article>
              ))
            : indicadores.map((item) => (
                <Link
                  key={item.id}
                  className={`relatorios-kpi ${tomClass(item.tom, 'relatorios-kpi')}`}
                  to={item.href || '/relatorios'}
                  title={item.descricao}
                >
                  <span className="relatorios-kpi__label">{item.titulo}</span>
                  <strong className="relatorios-kpi__value">{item.valor}</strong>
                  <span className="relatorios-kpi__hint">{item.descricao}</span>
                </Link>
              ))}
        </div>
      </section>

      <section className="relatorios-overview__section" aria-label="Situação operacional">
        <div className="relatorios-overview__section-head">
          <h3>Situação operacional</h3>
          <span>Pendências por área</span>
        </div>
        <div className="relatorios-overview__status">
          {loading && resumos.length === 0
            ? Array.from({ length: 6 }).map((_, i) => (
                <article className="relatorios-status relatorios-status--skeleton" key={`rs-${i}`}>
                  <span className="relatorios-kpi__skel relatorios-kpi__skel--short" />
                  <span className="relatorios-kpi__skel relatorios-kpi__skel--tall" />
                  <span className="relatorios-kpi__skel" />
                </article>
              ))
            : resumos.map((item) => (
                <Link
                  key={item.id}
                  className={`relatorios-status ${tomClass(item.tom, 'relatorios-status')}`}
                  to={item.href || '/relatorios'}
                >
                  <div className="relatorios-status__top">
                    <span className="relatorios-status__cat">
                      {RELATORIO_CATEGORIA_LABEL[item.categoria]}
                    </span>
                    <span className={`relatorios-status__badge ${tomClass(item.tom, 'relatorios-status-badge')}`}>
                      {item.tom === 'ok' ? 'Em dia' : item.tom === 'danger' ? 'Crítico' : item.tom === 'warning' ? 'Atenção' : 'Monitorar'}
                    </span>
                  </div>
                  <strong className="relatorios-status__value">{item.valorDestaque ?? '—'}</strong>
                  <p className="relatorios-status__detail">{item.detalhe}</p>
                </Link>
              ))}
        </div>
      </section>
    </div>
  );
}
