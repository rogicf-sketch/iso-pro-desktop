import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  configEmailOperacionalPronta,
  enviarEmailDesktop,
  isDesktopMailDisponivel,
  montarSmtpDeConfig,
  motivoDesktopMailIndisponivel,
  parseDestinatariosEmail,
} from '../../../lib/desktopMail';
import { verifyCurrentUserPassword, getCurrentUser } from '../../auth/services/auth.service';
import {
  carregarRelatorioAlertaOperacional,
} from '../../dashboard/services/alertaOperacionalEmail.service';
import {
  montarAssuntoAlertaOperacional,
  montarCorpoHtmlAlertaOperacional,
  montarCorpoTextoAlertaOperacional,
  totalItensAlertaOperacional,
} from '../../dashboard/utils/alertaOperacional.utils';
import { executarAlertaOperacionalNuvem } from '../services/executarAlertaOperacionalNuvem.service';
import { sincronizarConfigAlertaEstoqueParaNuvem } from '../services/syncAlertaEstoqueConfigNuvem.service';
import type { ConfiguracaoSistema } from '../types/configuracao.types';

type Props = {
  form: ConfiguracaoSistema;
  canAdminister: boolean;
  onChange: (next: ConfiguracaoSistema) => void;
};

export function ConfiguracaoAlertaOperacionalEmailPanel({ form, canAdminister, onChange }: Props) {
  const [testando, setTestando] = useState(false);
  const [testeOk, setTesteOk] = useState('');
  const [testeErro, setTesteErro] = useState('');
  const [nuvemSenha, setNuvemSenha] = useState('');

  const desktopOk = isDesktopMailDisponivel();
  const desktopMotivo = desktopOk ? '' : motivoDesktopMailIndisponivel();
  const nuvemOk = hasSupabaseConfig();
  const destinatarios = parseDestinatariosEmail(form.alertaOperacionalEmailDestinatarios);
  const smtpConfigurado = Boolean(form.smtpHost.trim() && form.smtpRemetente.trim());

  const enviarTesteDesktop = async () => {
    setTesteOk('');
    setTesteErro('');
    if (!smtpConfigurado) {
      setTesteErro('Configure SMTP na secao de estoque critico acima.');
      return;
    }
    if (destinatarios.length === 0) {
      setTesteErro('Informe ao menos um destinatario operacional.');
      return;
    }
    setTestando(true);
    try {
      const relatorio = await carregarRelatorioAlertaOperacional();
      const total = totalItensAlertaOperacional(relatorio);
      const contexto = { cliente: form.cliente, projeto: form.projeto };
      const smtp = montarSmtpDeConfig(form);
      const result = await enviarEmailDesktop({
        smtp: { host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user, pass: smtp.pass },
        from: smtp.from,
        to: destinatarios,
        subject:
          total > 0
            ? montarAssuntoAlertaOperacional(total, form.projeto)
            : `[I.S.O PRO] Teste — alertas operacionais (0 pendencia no momento)`,
        text:
          total > 0
            ? montarCorpoTextoAlertaOperacional(relatorio, contexto)
            : 'E-mail de teste — alertas operacionais I.S.O PRO. Nenhuma pendencia ultrapassou o prazo configurado neste momento.',
        html:
          total > 0
            ? montarCorpoHtmlAlertaOperacional(relatorio, contexto)
            : '<p>E-mail de <strong>teste</strong> — alertas operacionais I.S.O PRO. Nenhuma pendencia ultrapassou o prazo neste momento.</p>',
      });
      if (result.ok) {
        setTesteOk(total > 0 ? `E-mail enviado com ${total} pendencia(s).` : 'E-mail de teste enviado (sem pendencias no momento).');
      } else {
        setTesteErro(result.error);
      }
    } catch (e) {
      setTesteErro(e instanceof Error ? e.message : 'Falha ao enviar teste.');
    } finally {
      setTestando(false);
    }
  };

  const executarNaNuvem = async (forcar: boolean) => {
    setTesteOk('');
    setTesteErro('');
    if (!configEmailOperacionalPronta(form)) {
      setTesteErro('Ative o alerta operacional, SMTP e destinatarios antes de executar na nuvem.');
      return;
    }
    if (!nuvemSenha.trim()) {
      setTesteErro('Informe sua senha para executar na nuvem.');
      return;
    }
    setTestando(true);
    try {
      const senhaOk = await verifyCurrentUserPassword(nuvemSenha);
      if (!senhaOk) {
        setTesteErro('Senha incorreta.');
        return;
      }
      const u = getCurrentUser();
      if (!u?.login) {
        setTesteErro('Sessao sem utilizador.');
        return;
      }
      if (nuvemOk) {
        const sync = await sincronizarConfigAlertaEstoqueParaNuvem(form);
        if (!sync.success) {
          setTesteErro(sync.error ?? 'Falha ao copiar configuracao para a nuvem.');
          return;
        }
      }
      const r = await executarAlertaOperacionalNuvem({
        login: u.login,
        senha: nuvemSenha,
        forcar,
      });
      if (!r.success || !r.data) {
        setTesteErro(r.error ?? 'Falha na nuvem.');
        return;
      }
      setTesteOk(r.data.message);
    } catch (e) {
      setTesteErro(e instanceof Error ? e.message : 'Falha ao executar na nuvem.');
    } finally {
      setTestando(false);
      setNuvemSenha('');
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Operacao</p>
          <h2>E-mail de pendencias operacionais</h2>
        </div>
      </div>
      <p className="panel-copy">
        Avisa por e-mail quando conferencias, RIR, RNC ou inventarios ficam em aberto alem do prazo configurado. Usa o mesmo SMTP da
        secao acima. Reenvio automatico no maximo a cada intervalo definido enquanto a pendencia persistir.
      </p>
      {!smtpConfigurado ? (
        <OperationalNotice tone="warning">
          Preencha servidor SMTP e remetente na secao <strong>E-mail de estoque critico</strong> acima.
        </OperationalNotice>
      ) : null}
      {desktopOk ? (
        <OperationalNotice tone="warning">
          No desktop, o painel de controle verifica a cada 60s enquanto o app estiver aberto (complementar ao cron na nuvem).
        </OperationalNotice>
      ) : canAdminister ? (
        <OperationalNotice tone="warning">
          <strong>Teste desktop indisponivel nesta janela.</strong> {desktopMotivo}
        </OperationalNotice>
      ) : null}
      <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <input
          checked={form.alertaOperacionalEmailHabilitado === true}
          disabled={!canAdminister}
          onChange={(event) => onChange({ ...form, alertaOperacionalEmailHabilitado: event.target.checked })}
          type="checkbox"
        />
        <span>
          <strong>Ativar e-mail de pendencias operacionais</strong>
        </span>
      </label>
      <div className="form-columns">
        <Input
          disabled={!canAdminister}
          label="Destinatarios operacionais"
          onChange={(event) => onChange({ ...form, alertaOperacionalEmailDestinatarios: event.target.value })}
          placeholder="qualidade@empresa.com; almoxarifado@empresa.com"
          value={form.alertaOperacionalEmailDestinatarios}
        />
        <Input
          disabled={!canAdminister}
          label="Intervalo minimo entre reenvios (horas)"
          onChange={(event) =>
            onChange({ ...form, alertaOperacionalIntervaloMinimoHoras: Number(event.target.value || 24) })
          }
          type="number"
          value={String(form.alertaOperacionalIntervaloMinimoHoras || 24)}
        />
      </div>
      <div className="form-columns" style={{ marginTop: 8 }}>
        <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input
            checked={form.alertaOperacionalConferenciaHabilitado !== false}
            disabled={!canAdminister}
            onChange={(event) => onChange({ ...form, alertaOperacionalConferenciaHabilitado: event.target.checked })}
            type="checkbox"
          />
          <span>
            <strong>Conferencia em atraso</strong> — prazo (dias corridos):
          </span>
        </label>
        <Input
          disabled={!canAdminister || form.alertaOperacionalConferenciaHabilitado === false}
          label="Dias — conferencia"
          onChange={(event) =>
            onChange({ ...form, alertaOperacionalConferenciaPrazoDias: Number(event.target.value || 2) })
          }
          type="number"
          value={String(form.alertaOperacionalConferenciaPrazoDias || 2)}
        />
        <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input
            checked={form.alertaOperacionalRirHabilitado !== false}
            disabled={!canAdminister}
            onChange={(event) => onChange({ ...form, alertaOperacionalRirHabilitado: event.target.checked })}
            type="checkbox"
          />
          <span>
            <strong>RIR sem finalizar</strong> (status ≠ Tratado):
          </span>
        </label>
        <Input
          disabled={!canAdminister || form.alertaOperacionalRirHabilitado === false}
          label="Dias — RIR"
          onChange={(event) => onChange({ ...form, alertaOperacionalRirPrazoDias: Number(event.target.value || 5) })}
          type="number"
          value={String(form.alertaOperacionalRirPrazoDias || 5)}
        />
        <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input
            checked={form.alertaOperacionalRncHabilitado !== false}
            disabled={!canAdminister}
            onChange={(event) => onChange({ ...form, alertaOperacionalRncHabilitado: event.target.checked })}
            type="checkbox"
          />
          <span>
            <strong>RNC em aberto</strong> (inclui plano de acao vencido):
          </span>
        </label>
        <Input
          disabled={!canAdminister || form.alertaOperacionalRncHabilitado === false}
          label="Dias — RNC"
          onChange={(event) => onChange({ ...form, alertaOperacionalRncPrazoDias: Number(event.target.value || 7) })}
          type="number"
          value={String(form.alertaOperacionalRncPrazoDias || 7)}
        />
        <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <input
            checked={form.alertaOperacionalInventarioHabilitado === true}
            disabled={!canAdminister}
            onChange={(event) => onChange({ ...form, alertaOperacionalInventarioHabilitado: event.target.checked })}
            type="checkbox"
          />
          <span>
            <strong>Inventarios abertos</strong> (opcional):
          </span>
        </label>
        <Input
          disabled={!canAdminister || form.alertaOperacionalInventarioHabilitado !== true}
          label="Dias — inventario"
          onChange={(event) =>
            onChange({ ...form, alertaOperacionalInventarioPrazoDias: Number(event.target.value || 7) })
          }
          type="number"
          value={String(form.alertaOperacionalInventarioPrazoDias || 7)}
        />
      </div>
      {canAdminister && desktopOk && smtpConfigurado ? (
        <div className="inline-actions" style={{ marginTop: 12 }}>
          <Button disabled={testando} onClick={() => void enviarTesteDesktop()} type="button" variant="ghost">
            {testando ? 'Enviando...' : 'E-mail de teste (desktop)'}
          </Button>
        </div>
      ) : null}
      {canAdminister && nuvemOk ? (
        <div className="form-columns" style={{ marginTop: 16 }}>
          <Input
            autoComplete="current-password"
            disabled={!canAdminister}
            label="Sua senha (executar na nuvem)"
            onChange={(event) => setNuvemSenha(event.target.value)}
            type="password"
            value={nuvemSenha}
          />
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10, gridColumn: '1 / -1' }}>
            <Button disabled={testando} onClick={() => void executarNaNuvem(true)} type="button" variant="ghost">
              E-mail de teste (nuvem)
            </Button>
            <Button disabled={testando} onClick={() => void executarNaNuvem(false)} type="button" variant="ghost">
              Verificar pendencias na nuvem
            </Button>
          </div>
        </div>
      ) : null}
      {testeOk ? <OperationalNotice tone="success">{testeOk}</OperationalNotice> : null}
      {testeErro ? <div className="error-box">{testeErro}</div> : null}
    </div>
  );
}
