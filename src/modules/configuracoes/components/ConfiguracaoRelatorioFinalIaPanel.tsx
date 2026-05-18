import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { testarConexaoIaApi } from '../../../lib/isoProIaApi.service';
import { IA_API_PRESETS } from '../constants/iaApiPresets.constants';
import type { ConfiguracaoSistema } from '../types/configuracao.types';

type Props = {
  form: ConfiguracaoSistema;
  canAdminister: boolean;
  onChange: (next: ConfiguracaoSistema) => void;
};

export function ConfiguracaoRelatorioFinalIaPanel({ form, canAdminister, onChange }: Props) {
  const [testando, setTestando] = useState(false);
  const [testeOk, setTesteOk] = useState('');
  const [testeErro, setTesteErro] = useState('');

  const testarApi = async () => {
    setTesteOk('');
    setTesteErro('');
    setTestando(true);
    try {
      const r = await testarConexaoIaApi(form);
      if (r.ok) {
        setTesteOk(
          `Conexão OK · modelo ${r.data.modelo} · ${r.data.latenciaMs} ms · resposta: «${r.data.respostaAmostra}»`,
        );
      } else {
        setTesteErro(r.erro);
      }
    } catch (e) {
      setTesteErro(e instanceof Error ? e.message : 'Falha ao testar a API.');
    } finally {
      setTestando(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">IA · relatórios</p>
          <h2>Análise assistida (API OpenAI-compatível)</h2>
        </div>
      </div>
      <p className="panel-copy">
        Credenciais usadas hoje no <strong>Relatório Final de Obra</strong> e reutilizáveis em outros relatórios do
        sistema. Envia resumo estruturado dos registros (sem imagens em base64). A chave permanece apenas nesta
        instalação.
      </p>
      <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <input
          checked={form.relatorioFinalIaHabilitado === true}
          disabled={!canAdminister}
          onChange={(event) => onChange({ ...form, relatorioFinalIaHabilitado: event.target.checked })}
          type="checkbox"
        />
        <span>
          <strong>Ativar análise por IA no Relatório Final de Obra</strong>
        </span>
      </label>
      <div className="form-actions" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span className="panel-copy" style={{ margin: 0, width: '100%' }}>
          Provedor rápido (preenche URL e modelo sugerido):
        </span>
        {IA_API_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            disabled={!canAdminister}
            onClick={() => {
              setTesteOk('');
              setTesteErro('');
              onChange({
                ...form,
                relatorioFinalIaBaseUrl: preset.baseUrl,
                relatorioFinalIaModelo: preset.modeloSugerido,
              });
            }}
            type="button"
            variant="ghost"
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="form-columns">
        <Input
          disabled={!canAdminister}
          label="URL base da API (OpenAI-compatível)"
          onChange={(event) => {
            setTesteOk('');
            setTesteErro('');
            onChange({ ...form, relatorioFinalIaBaseUrl: event.target.value });
          }}
          placeholder="https://api.openai.com/v1"
          value={form.relatorioFinalIaBaseUrl}
        />
        <Input
          disabled={!canAdminister}
          label="Modelo"
          onChange={(event) => {
            setTesteOk('');
            setTesteErro('');
            onChange({ ...form, relatorioFinalIaModelo: event.target.value });
          }}
          placeholder="gpt-4o-mini"
          value={form.relatorioFinalIaModelo}
        />
        <Input
          disabled={!canAdminister}
          label="Chave de API"
          onChange={(event) => {
            setTesteOk('');
            setTesteErro('');
            onChange({ ...form, relatorioFinalIaApiKey: event.target.value });
          }}
          type="password"
          value={form.relatorioFinalIaApiKey}
        />
      </div>
      <div className="form-actions" style={{ marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
        <Button disabled={!canAdminister || testando} onClick={() => void testarApi()} type="button" variant="ghost">
          {testando ? 'Testando…' : 'Testar conexão com a API'}
        </Button>
        <span className="panel-copy" style={{ margin: 0, opacity: 0.9 }}>
          Usa os valores acima (não é necessário gravar antes). Recomendado após alterar URL, modelo ou chave.
        </span>
      </div>
      {testeErro ? <OperationalNotice tone="critical">{testeErro}</OperationalNotice> : null}
      {testeOk ? (
        <div style={{ marginTop: testeErro ? 12 : 0 }}>
          <OperationalNotice tone="success">{testeOk}</OperationalNotice>
        </div>
      ) : null}
    </div>
  );
}
