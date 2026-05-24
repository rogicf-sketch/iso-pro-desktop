import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { hasSupabaseConfig } from '../../../lib/supabase';
import {
  configEmailEstoquePronta,
  enviarEmailDesktop,
  isDesktopMailDisponivel,
  montarSmtpDeConfig,
  motivoDesktopMailIndisponivel,
  parseDestinatariosEmail,
  verificarSmtpDesktop,
} from '../../../lib/desktopMail';
import { verifyCurrentUserPassword, getCurrentUser } from '../../auth/services/auth.service';
import { executarAlertaEstoqueCriticoNuvem } from '../services/executarAlertaEstoqueNuvem.service';
import { sincronizarConfigAlertaEstoqueParaNuvem } from '../services/syncAlertaEstoqueConfigNuvem.service';
import type { ConfiguracaoSistema } from '../types/configuracao.types';

type Props = {
  form: ConfiguracaoSistema;
  canAdminister: boolean;
  onChange: (next: ConfiguracaoSistema) => void;
};

export function ConfiguracaoAlertaEstoqueEmailPanel({ form, canAdminister, onChange }: Props) {
  const [testando, setTestando] = useState(false);
  const [testeOk, setTesteOk] = useState('');
  const [testeErro, setTesteErro] = useState('');
  const [nuvemSenha, setNuvemSenha] = useState('');

  const desktopOk = isDesktopMailDisponivel();
  const desktopMotivo = desktopOk ? '' : motivoDesktopMailIndisponivel();
  const nuvemOk = hasSupabaseConfig();
  const destinatarios = parseDestinatariosEmail(form.alertaEstoqueEmailDestinatarios);

  const montarPayloadTeste = () => {
    const smtp = montarSmtpDeConfig(form);
    return {
      smtp: {
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        user: smtp.user,
        pass: smtp.pass,
      },
      from: smtp.from,
      to: destinatarios.length > 0 ? destinatarios : [smtp.from],
      subject: '[I.S.O PRO] Teste de alerta de estoque',
      text: 'E-mail de teste — configuracao SMTP do I.S.O PRO para alertas de estoque critico.',
      html: '<p>E-mail de <strong>teste</strong> — configuracao SMTP do I.S.O PRO para alertas de estoque critico.</p>',
    };
  };

  const testarSmtp = async () => {
    setTesteOk('');
    setTesteErro('');
    if (!form.smtpHost.trim() || !form.smtpRemetente.trim()) {
      setTesteErro('Preencha servidor SMTP e remetente.');
      return;
    }
    setTestando(true);
    try {
      const payload = montarPayloadTeste();
      const verify = await verificarSmtpDesktop(payload);
      if (!verify.ok) {
        setTesteErro(verify.error);
        return;
      }
      setTesteOk('Conexao SMTP OK.');
    } catch (e) {
      setTesteErro(e instanceof Error ? e.message : 'Falha ao testar SMTP.');
    } finally {
      setTestando(false);
    }
  };

  const enviarTeste = async () => {
    setTesteOk('');
    setTesteErro('');
    if (!configEmailEstoquePronta(form) && destinatarios.length === 0) {
      setTesteErro('Informe ao menos um destinatario valido.');
      return;
    }
    setTestando(true);
    try {
      const result = await enviarEmailDesktop(montarPayloadTeste());
      if (result.ok) {
        setTesteOk('E-mail de teste enviado.');
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
    if (!configEmailEstoquePronta(form)) {
      setTesteErro('Ative o alerta, preencha SMTP e destinatarios antes de executar na nuvem.');
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
          setTesteErro(sync.error ?? 'Falha ao copiar SMTP para a nuvem. Salve configuracoes e tente de novo.');
          return;
        }
      }
      const r = await executarAlertaEstoqueCriticoNuvem({
        login: u.login,
        senha: nuvemSenha,
        forcar,
      });
      if (!r.success || !r.data) {
        setTesteErro(r.error ?? 'Falha na nuvem.');
        return;
      }
      const msg = r.data.message;
      setTesteOk(
        /inalterada/i.test(msg) && !forcar
          ? `${msg} Para receber um e-mail de teste agora, use «E-mail de teste (nuvem)».`
          : msg,
      );
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
          <p className="panel-kicker">Materiais</p>
          <h2>E-mail de estoque critico</h2>
        </div>
      </div>
      <p className="panel-copy">
        Envia aviso automatico quando materiais entram em gravidade <strong>CRITICA</strong> (saldo zero ou muito abaixo do limite
        sobre o planejamento). Itens apenas em <strong>atencao</strong> nao disparam e-mail. Um novo e-mail so e enviado quando a lista
        de criticos muda.
      </p>
      <OperationalNotice>
        <strong>Na nuvem (recomendado):</strong> ao salvar configuracoes com Supabase activo, SMTP e destinatarios sao copiados para o
        snapshot. A Edge Function <code>alerta_estoque_critico</code> pode rodar em horario (cron) — PC desligado nao impede o envio.
      </OperationalNotice>
      {desktopOk ? (
        <OperationalNotice tone="warning">
          <strong>No desktop:</strong> o painel de controle tambem verifica a cada 60s enquanto o app estiver aberto (complementar a
          nuvem).
        </OperationalNotice>
      ) : canAdminister ? (
        <OperationalNotice tone="warning">
          <strong>Teste pelo PC (.exe) indisponivel nesta janela.</strong> {desktopMotivo} Use o teste pela nuvem abaixo (nao precisa
          do instalador). Para activar os botoes desktop, abra pelo icone do Menu Iniciar (Setup 0.1.15+) — nao pelo navegador.
        </OperationalNotice>
      ) : null}
      {!nuvemOk ? (
        <OperationalNotice tone="warning">
          Sem Supabase configurado: apenas o envio local pelo app desktop (quando aberto) funciona.
        </OperationalNotice>
      ) : null}
      <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <input
          checked={form.alertaEstoqueEmailHabilitado === true}
          disabled={!canAdminister}
          onChange={(event) => onChange({ ...form, alertaEstoqueEmailHabilitado: event.target.checked })}
          type="checkbox"
        />
        <span>
          <strong>Ativar e-mail para estoque critico</strong>
        </span>
      </label>
      <div className="form-columns">
        <Input
          disabled={!canAdminister}
          label="Destinatarios (virgula ou ponto-e-virgula)"
          onChange={(event) => onChange({ ...form, alertaEstoqueEmailDestinatarios: event.target.value })}
          placeholder="compras@empresa.com; almoxarifado@empresa.com"
          value={form.alertaEstoqueEmailDestinatarios}
        />
        <Input
          disabled={!canAdminister}
          label="Servidor SMTP"
          onChange={(event) => onChange({ ...form, smtpHost: event.target.value })}
          placeholder="smtp.office365.com"
          value={form.smtpHost}
        />
        <Input
          disabled={!canAdminister}
          label="Porta SMTP"
          onChange={(event) => onChange({ ...form, smtpPort: Number(event.target.value || 587) })}
          type="number"
          value={String(form.smtpPort || 587)}
        />
        <Input
          disabled={!canAdminister}
          label="Usuario SMTP"
          onChange={(event) => onChange({ ...form, smtpUsuario: event.target.value })}
          value={form.smtpUsuario}
        />
        <Input
          disabled={!canAdminister}
          label="Senha SMTP"
          onChange={(event) => onChange({ ...form, smtpSenha: event.target.value })}
          type="password"
          value={form.smtpSenha}
        />
        <Input
          disabled={!canAdminister}
          label="Remetente (From)"
          onChange={(event) => onChange({ ...form, smtpRemetente: event.target.value })}
          placeholder="ISO PRO Alertas <alertas@empresa.com>"
          value={form.smtpRemetente}
        />
      </div>
      <label className="panel-copy" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 8 }}>
        <input
          checked={form.smtpSecure === true}
          disabled={!canAdminister}
          onChange={(event) => onChange({ ...form, smtpSecure: event.target.checked })}
          type="checkbox"
        />
        <span>
          <strong>TLS directo (porta 465)</strong> — desligado usa STARTTLS (comum na porta 587).
        </span>
      </label>
      {canAdminister && desktopOk ? (
        <div className="inline-actions" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
          <Button disabled={testando} onClick={() => void testarSmtp()} type="button" variant="ghost">
            {testando ? 'Testando...' : 'Testar conexao SMTP (desktop)'}
          </Button>
          <Button disabled={testando} onClick={() => void enviarTeste()} type="button" variant="ghost">
            E-mail de teste (desktop)
          </Button>
        </div>
      ) : null}
      {canAdminister && nuvemOk ? (
        <div className="form-columns" style={{ marginTop: 16 }}>
          <p className="panel-copy" style={{ gridColumn: '1 / -1', margin: 0 }}>
            Gmail: use a <strong>senha de app</strong> de 16 letras (sem espacos) em Senha SMTP — nao a senha normal da conta. Ao
            testar na nuvem, os dados deste formulario sao copiados para o snapshot antes do envio.
          </p>
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
              Verificar alertas na nuvem
            </Button>
          </div>
        </div>
      ) : null}
      {testeOk ? <OperationalNotice tone="success">{testeOk}</OperationalNotice> : null}
      {testeErro ? <div className="error-box">{testeErro}</div> : null}
    </div>
  );
}
