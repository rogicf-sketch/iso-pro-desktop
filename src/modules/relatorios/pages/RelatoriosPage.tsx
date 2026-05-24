import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { listarIndicadoresRelatorios, listarResumosRelatorios } from '../services/relatorios.service';
import type { RelatorioIndicador, RelatorioResumo } from '../types/relatorio.types';

export function RelatoriosPage() {
  const [indicadores, setIndicadores] = useState<RelatorioIndicador[]>([]);
  const [resumos, setResumos] = useState<RelatorioResumo[]>([]);
  const resumoSeguranca = resumos.find((item) => item.categoria === 'seguranca');

  useEffect(() => {
    void listarIndicadoresRelatorios().then(setIndicadores);
    void listarResumosRelatorios().then(setResumos);
  }, []);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Gestão</p>
          <h2>Relatórios</h2>
        </div>
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Painel gerencial e documentos de encerramento: indicadores do projeto, relatório fotográfico e relatório final de
          obra para apresentação à diretoria e ao cliente.
        </p>
      </ModuleHelp>

      <div className="section-block" style={{ marginBottom: 24 }}>
        <p className="panel-kicker">Documentos</p>
        <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div className="info-card">
            <p className="panel-kicker">Encerramento de obra</p>
            <h3>Relatório Final de Obra</h3>
            <ModuleHelp>
              <p className="panel-copy">
                Consolida planejamento, recebimentos, RIR, RNC, atendimentos, inventários e relatórios fotográficos em
                documento executivo único, com exportação PDF, Word e Excel.
              </p>
            </ModuleHelp>
            <Link className="button button-primary" to="/relatorios/final-obra">
              Gerar relatório final
            </Link>
          </div>

          <div className="info-card">
            <p className="panel-kicker">Evidências</p>
            <h3>Relatório fotográfico</h3>
            <ModuleHelp>
              <p className="panel-copy">
                Registo de fotos com compressão automática, vínculo opcional a recebimentos e impressão em HTML.
              </p>
            </ModuleHelp>
            <Link className="button" to="/relatorio-fotografico">
              Abrir relatório fotográfico
            </Link>
          </div>
        </div>
      </div>

      {resumoSeguranca ? <OperationalNotice tone="warning">{resumoSeguranca.detalhe}</OperationalNotice> : null}

      <div className="cards-grid">
        {indicadores.map((item) => (
          <div className="metric-card" key={item.id}>
            <span className="metric-label">{item.titulo}</span>
            <strong>{item.valor}</strong>
            <p className="panel-copy">{item.descricao}</p>
          </div>
        ))}
      </div>

      <div className="section-block">
        {resumos.map((item) => (
          <div className="info-card" key={item.id}>
            <p className="panel-kicker">{item.categoria}</p>
            <h3>{item.titulo}</h3>
            <p className="panel-copy">{item.detalhe}</p>
            <small className="panel-copy">Atualizado em: {item.atualizadoEm}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
