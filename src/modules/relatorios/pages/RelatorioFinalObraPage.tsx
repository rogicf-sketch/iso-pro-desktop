import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { relatorioFinalIaConfigurada } from '../services/relatorioFinalObraIa.service';
import {
  coletarDadosRelatorioFinalObra,
  formatarDataRelatorioFinal,
  preverProximoNumeroRelatorioFinalObra,
  registrarRelatorioFinalObra,
  rotuloNumeroRelatorioFinalObra,
} from '../services/relatorioFinalObra.service';
import { RFO_NUMERO_PREVIA } from '../types/relatorioFinalObra.types';
import type { RelatorioFinalObraDados } from '../types/relatorioFinalObra.types';
import {
  exportarRelatorioFinalObraExcel,
  exportarRelatorioFinalObraPdf,
  exportarRelatorioFinalObraWord,
  preVisualizarRelatorioFinalObra,
} from '../utils/exportRelatorioFinalObra';

function storageUltimoRegistradoKey(): string {
  return getScopedIsoProStorageKey('iso-pro-rfo-ultimo-v1');
}

function lerUltimoRegistrado(): { numero: string; geradoEm: string } | null {
  try {
    const raw = localStorage.getItem(storageUltimoRegistradoKey());
    if (!raw) return null;
    const p = JSON.parse(raw) as { numero?: string; geradoEm?: string };
    if (p.numero && p.geradoEm && !p.numero.includes('Pré')) {
      return { numero: p.numero, geradoEm: p.geradoEm };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function gravarUltimoRegistrado(dados: RelatorioFinalObraDados): void {
  if (!dados.contexto.registrado) return;
  try {
    localStorage.setItem(
      storageUltimoRegistradoKey(),
      JSON.stringify({
        numero: dados.contexto.numeroRelatorio,
        geradoEm: dados.contexto.geradoEm,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function RelatorioFinalObraPage() {
  const [confirmado, setConfirmado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const [erro, setErro] = useState('');
  const [info, setInfo] = useState('');
  const [dados, setDados] = useState<RelatorioFinalObraDados | null>(null);
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [avisosExcel, setAvisosExcel] = useState<string[]>([]);
  const [ultimoRegistrado, setUltimoRegistrado] = useState(lerUltimoRegistrado);
  const proximoNumero = preverProximoNumeroRelatorioFinalObra();
  const iaAtiva = relatorioFinalIaConfigurada(readConfiguracoes());

  const visualizarPrevia = useCallback(async () => {
    if (!confirmado) {
      setErro('Confirme que a obra está concluída antes de visualizar.');
      return;
    }
    setErro('');
    setInfo('');
    setAvisosExcel([]);
    setCarregando(true);
    try {
      const coletado = await coletarDadosRelatorioFinalObra();
      const prev = await preVisualizarRelatorioFinalObra(coletado);
      if (!prev.ok) {
        setErro(prev.error ?? 'Não foi possível abrir a pré-visualização.');
      } else {
        setDados(prev.dados);
        setInfo(
          `Pré-visualização aberta sem consumir numeração. O próximo número oficial ao registrar será ${proximoNumero}.`,
        );
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao coletar dados do projeto.');
    } finally {
      setCarregando(false);
    }
  }, [confirmado, proximoNumero]);

  const registrarOficial = useCallback(async () => {
    if (!confirmado) {
      setErro('Confirme que a obra está concluída antes de registrar.');
      return;
    }
    if (!dados) {
      setErro('Visualize a prévia antes de registrar (ou clique em «Atualizar prévia»).');
      return;
    }
    if (dados.contexto.registrado) {
      setErro('Este relatório já foi registrado com número oficial. Atualize a prévia para um novo registro.');
      return;
    }
    setErro('');
    setInfo('');
    setRegistrando(true);
    try {
      const registrado = registrarRelatorioFinalObra(dados);
      setDados(registrado);
      gravarUltimoRegistrado(registrado);
      setUltimoRegistrado({
        numero: registrado.contexto.numeroRelatorio,
        geradoEm: registrado.contexto.geradoEm,
      });
      const prev = await preVisualizarRelatorioFinalObra(registrado);
      if (!prev.ok) {
        setErro(prev.error ?? 'Registrado, mas não foi possível abrir a pré-visualização.');
      } else {
        setDados(prev.dados);
        setInfo(`Relatório registrado com número oficial ${registrado.contexto.numeroRelatorio}.`);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao registrar o relatório.');
    } finally {
      setRegistrando(false);
    }
  }, [confirmado, dados]);

  const exportarPdf = async () => {
    if (!dados) {
      setErro('Atualize a prévia antes de exportar.');
      return;
    }
    const res = await exportarRelatorioFinalObraPdf(dados);
    if (!res.ok) {
      setErro(res.error ?? 'Não foi possível abrir a pré-visualização.');
    } else {
      setDados(res.dados);
    }
  };

  const exportarWord = async () => {
    if (!dados) {
      setErro('Atualize a prévia antes de exportar.');
      return;
    }
    const enriquecido = await exportarRelatorioFinalObraWord(dados);
    setDados(enriquecido);
  };

  const exportarExcel = async () => {
    if (!dados) {
      setErro('Atualize a prévia antes de exportar.');
      return;
    }
    setExportandoExcel(true);
    setAvisosExcel([]);
    try {
      const r = await exportarRelatorioFinalObraExcel(dados);
      setAvisosExcel(r.avisos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar pacote Excel.');
    } finally {
      setExportandoExcel(false);
    }
  };

  const rotuloAtual = dados ? rotuloNumeroRelatorioFinalObra(dados.contexto) : null;

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Módulo · Relatórios</p>
          <h2>Relatório Final de Obra</h2>
        </div>
        <Link className="ghost-button" to="/relatorios">
          Voltar
        </Link>
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Pré-visualizar quantas vezes quiser <strong>sem gastar número</strong>. O código oficial{' '}
          <strong>RFO-AAAA-NNNNN</strong> só é gerado ao clicar em <strong>Registrar relatório final</strong>. O pacote Excel
          traz a listagem completa; o PDF/Word é o relatório executivo. Com IA ativa em Configurações, a síntese e os destaques
          são elaborados a partir de todos os módulos (RNC com fotos, recebimentos divergentes, RIR, etc.).
        </p>
      </ModuleHelp>

      <OperationalNotice tone="warning">
        Próximo número disponível ao registrar: <strong>{proximoNumero}</strong>. A pré-visualização não incrementa a
        sequência.
      </OperationalNotice>

      {iaAtiva ? (
        <div style={{ marginTop: 12 }}>
          <OperationalNotice>
            Análise por IA ativa: a prévia pode levar até ~60 s enquanto o sistema envia um resumo dos registros à API
            configurada em <Link to="/configuracoes">Configurações</Link> e elabora síntese e destaques.
          </OperationalNotice>
        </div>
      ) : null}

      {dados?.apresentacao?.ia?.utilizada ? (
        <div style={{ marginTop: 12 }}>
          <OperationalNotice tone="success">
            Última prévia com análise assistida ({dados.apresentacao.ia.modelo ?? 'IA'}).
            {(dados.apresentacao.secoesModulo?.length ?? 0) > 0
              ? ` Inclui análise por área em ${dados.apresentacao.secoesModulo!.length} módulo(s).`
              : ''}
          </OperationalNotice>
        </div>
      ) : null}

      {dados?.apresentacao?.ia?.erro ? (
        <div style={{ marginTop: 12 }}>
          <OperationalNotice tone="warning">
            IA indisponível nesta prévia — usadas regras locais: {dados.apresentacao.ia.erro}
          </OperationalNotice>
        </div>
      ) : null}

      {ultimoRegistrado ? (
        <p className="panel-copy" style={{ marginTop: 12 }}>
          Último relatório <strong>registrado</strong>: {ultimoRegistrado.numero} em{' '}
          {formatarDataRelatorioFinal(ultimoRegistrado.geradoEm)}.
        </p>
      ) : null}

      <label className="form-field" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 16 }}>
        <input
          type="checkbox"
          checked={confirmado}
          onChange={(e) => {
            setConfirmado(e.target.checked);
            if (e.target.checked) setErro('');
          }}
        />
        <span>
          Confirmo que a obra/projeto está concluído e desejo emitir o <strong>Relatório Final de Obra</strong>.
        </span>
      </label>

      {erro ? <OperationalNotice tone="critical">{erro}</OperationalNotice> : null}
      {info ? (
        <div style={{ marginTop: erro ? 12 : 0 }}>
          <OperationalNotice tone="success">{info}</OperationalNotice>
        </div>
      ) : null}

      <div className="form-actions" style={{ marginTop: 20, flexWrap: 'wrap', gap: 10 }}>
        <button
          type="button"
          className="button"
          disabled={carregando || registrando || !confirmado}
          onClick={() => void visualizarPrevia()}
        >
          {carregando ? 'Coletando…' : dados ? 'Atualizar prévia' : 'Visualizar prévia'}
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={carregando || registrando || !confirmado || !dados || dados.contexto.registrado}
          onClick={() => void registrarOficial()}
        >
          {registrando ? 'Registrando…' : `Registrar (${proximoNumero})`}
        </button>
        {dados ? (
          <>
            <button type="button" className="button" disabled={carregando || registrando} onClick={() => void exportarPdf()}>
              PDF / Imprimir
            </button>
            <button type="button" className="button" disabled={carregando || registrando} onClick={() => void exportarWord()}>
              Word (.doc)
            </button>
            <button
              type="button"
              className="button"
              disabled={carregando || registrando || exportandoExcel}
              onClick={() => void exportarExcel()}
            >
              {exportandoExcel ? 'Gerando Excel…' : 'Excel (ZIP)'}
            </button>
          </>
        ) : null}
      </div>

      {dados ? (
        <div className="info-card" style={{ marginTop: 24 }}>
          <p className="panel-kicker">Prévia consolidada</p>
          <h3>{rotuloAtual}</h3>
          {!dados.contexto.registrado ? (
            <p className="panel-copy" style={{ marginTop: 4 }}>
              Modo {RFO_NUMERO_PREVIA} — registre para obter {proximoNumero}.
            </p>
          ) : null}
          <div className="cards-grid" style={{ marginTop: 12 }}>
            <div className="metric-card">
              <span className="metric-label">Documentos</span>
              <strong>{dados.totais.documentos}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Recebimentos</span>
              <strong>{dados.totais.recebimentos}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">RIR / RNC</span>
              <strong>
                {dados.totais.rir} / {dados.totais.rnc}
              </strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Atendimentos</span>
              <strong>{dados.totais.atendimentos}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Inventários</span>
              <strong>{dados.totais.inventarios}</strong>
            </div>
            <div className="metric-card">
              <span className="metric-label">Rel. fotográficos</span>
              <strong>{dados.totais.relatoriosFotograficos}</strong>
            </div>
          </div>
          <p className="panel-copy" style={{ marginTop: 12 }}>
            Dados coletados em {formatarDataRelatorioFinal(dados.contexto.geradoEm)} · Cliente:{' '}
            {dados.contexto.cliente || '—'} · Projeto: {dados.contexto.projeto || '—'}
          </p>
        </div>
      ) : null}

      {avisosExcel.length > 0 ? (
        <div style={{ marginTop: 12 }}>
        <OperationalNotice tone="warning">
          Excel gerado com avisos: {avisosExcel.join(' · ')}
        </OperationalNotice>
        </div>
      ) : null}
    </div>
  );
}
