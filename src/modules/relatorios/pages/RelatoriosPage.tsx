import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
          <p className="panel-kicker">Modulo</p>
          <h2>Relatorios</h2>
        </div>
      </div>

      <p className="panel-copy">
        Painel gerencial resumido para acompanhar estoque, planejamento, recebimentos, qualidade e dispositivos mobile sem sobrecarregar o
        front.
      </p>

      <div className="info-card" style={{ marginBottom: 20 }}>
        <p className="panel-kicker">Evidências</p>
        <h3>Relatório fotográfico</h3>
        <p className="panel-copy">
          Registo de fotos com compressão automática, vínculo opcional a recebimentos e impressão em HTML. Sincronização com Supabase
          (tabela <code>iso_pro_relatorio_snapshot</code>) quando configurado.
        </p>
        <Link className="button button-primary" to="/relatorio-fotografico">
          Abrir relatório fotográfico
        </Link>
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
