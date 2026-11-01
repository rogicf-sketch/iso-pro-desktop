import { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { getActiveTenantId, type IsoProTenantListItem } from '../../../lib/isoProTenant';
import { getCurrentUser, getVolatileSessionPassword } from '../../auth/services/auth.service';
import { isIsoProAdminUserEdgeConfigured } from '../../usuarios/services/isoProAdminUser.service';
import { executarIsoProCreateTenant } from '../services/isoProCreateTenant.service';

type Props = {
  canAdminister: boolean;
  onCreated: (tenant: IsoProTenantListItem) => void;
};

function defaultsDaSessao() {
  const user = getCurrentUser();
  const senha = getVolatileSessionPassword() ?? '';
  return {
    adminLogin: (user?.login ?? 'admin').trim().toLowerCase(),
    adminNome: (user?.nome ?? 'Administrador').trim() || 'Administrador',
    adminSenha: senha,
    adminSenha2: senha,
  };
}

export function ConfiguracaoCriarTenantPanel({ canAdminister, onCreated }: Props) {
  const iniciais = useMemo(() => defaultsDaSessao(), []);
  const [slug, setSlug] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [usarMeuAcesso, setUsarMeuAcesso] = useState(true);
  const [adminLogin, setAdminLogin] = useState(iniciais.adminLogin);
  const [adminNome, setAdminNome] = useState(iniciais.adminNome);
  const [adminSenha, setAdminSenha] = useState(iniciais.adminSenha);
  const [adminSenha2, setAdminSenha2] = useState(iniciais.adminSenha2);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  const secretOk = isIsoProAdminUserEdgeConfigured();

  function aplicarMeuAcesso(ligado: boolean) {
    setUsarMeuAcesso(ligado);
    if (!ligado) return;
    const d = defaultsDaSessao();
    setAdminLogin(d.adminLogin);
    setAdminNome(d.adminNome);
    setAdminSenha(d.adminSenha);
    setAdminSenha2(d.adminSenha2);
  }

  async function criar() {
    setErro('');
    setOk('');
    if (!canAdminister) {
      setErro('Sem permissao para administrar configuracoes.');
      return;
    }
    if (!secretOk) {
      setErro('Configure o segredo «criar utilizador na nuvem» (ISO_PRO_ADMIN_USER_SECRET) antes de criar empresas.');
      return;
    }

    const d = defaultsDaSessao();
    const loginFinal = (usarMeuAcesso ? d.adminLogin : adminLogin).trim().toLowerCase();
    const nomeFinal = (usarMeuAcesso ? d.adminNome : adminNome).trim() || 'Administrador';
    const senhaFinal = usarMeuAcesso ? d.adminSenha : adminSenha;
    const senha2Final = usarMeuAcesso ? d.adminSenha2 : adminSenha2;

    if (senhaFinal !== senha2Final) {
      setErro('As senhas do admin nao coincidem.');
      return;
    }
    if (!senhaFinal) {
      setErro(
        usarMeuAcesso
          ? 'Sessao sem senha em memoria. Saia e entre de novo (com a sua senha) para criar empresas com o seu acesso padrao.'
          : 'Informe a senha do admin da nova empresa.',
      );
      return;
    }

    const actor = getCurrentUser();
    const actorSenha = getVolatileSessionPassword();
    if (!actor?.login || !actorSenha) {
      setErro('Termine a sessao e volte a entrar para confirmar a sua senha (actor admin).');
      return;
    }

    setBusy(true);
    try {
      const result = await executarIsoProCreateTenant({
        actorTenantId: getActiveTenantId(),
        actorLogin: actor.login,
        actorSenha,
        slug,
        nomeEmpresa,
        adminLogin: loginFinal,
        adminNome: nomeFinal,
        adminSenha: senhaFinal,
      });
      if (!result.success || !result.data) {
        setErro(result.error ?? 'Nao foi possivel criar a empresa.');
        return;
      }
      const t = result.data.tenant;
      setOk(
        `Empresa «${t.name}» criada. Login admin: ${result.data.adminLogin}${
          usarMeuAcesso ? ' (o mesmo da sua sessao — pode entrar nessa empresa com o seu login/senha).' : '.'
        }`,
      );
      setSlug('');
      setNomeEmpresa('');
      aplicarMeuAcesso(true);
      onCreated({ id: t.id, slug: t.slug, name: t.name });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border, #d0d7de)' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Criar nova empresa</h3>
      <p className="panel-copy" style={{ marginBottom: 12 }}>
        Cria linha em <code>iso_pro_tenants</code>, copia o perfil admin e o primeiro utilizador — sem SQL Editor.
        Por omissao o admin da empresa nova e o <strong>seu login e senha</strong> da sessao actual (facilita suporte).
      </p>
      {!secretOk ? (
        <OperationalNotice tone="warning">
          Segredo de administracao de utilizadores ainda nao definido nesta instalacao.
        </OperationalNotice>
      ) : null}

      <label className="login-remember" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
        <input
          checked={usarMeuAcesso}
          disabled={!canAdminister || busy}
          onChange={(e) => aplicarMeuAcesso(e.target.checked)}
          type="checkbox"
        />
        <span>
          Usar o meu login e senha padrao nesta empresa (recomendado para suporte). Desmarque so se quiser um admin
          diferente para o cliente.
        </span>
      </label>

      <div className="form-columns">
        <Input
          disabled={!canAdminister || busy}
          label="Slug (unico)"
          onChange={(e) => setSlug(e.target.value)}
          placeholder="obra-norte"
          value={slug}
        />
        <Input
          disabled={!canAdminister || busy}
          label="Nome da empresa"
          onChange={(e) => setNomeEmpresa(e.target.value)}
          value={nomeEmpresa}
        />
        <Input
          disabled={!canAdminister || busy || usarMeuAcesso}
          label="Login do admin"
          onChange={(e) => setAdminLogin(e.target.value)}
          placeholder="admin"
          value={usarMeuAcesso ? defaultsDaSessao().adminLogin : adminLogin}
        />
        <Input
          disabled={!canAdminister || busy || usarMeuAcesso}
          label="Nome do admin"
          onChange={(e) => setAdminNome(e.target.value)}
          value={usarMeuAcesso ? defaultsDaSessao().adminNome : adminNome}
        />
        {!usarMeuAcesso ? (
          <>
            <Input
              disabled={!canAdminister || busy}
              label="Senha do admin"
              onChange={(e) => setAdminSenha(e.target.value)}
              type="password"
              value={adminSenha}
            />
            <Input
              disabled={!canAdminister || busy}
              label="Confirmar senha"
              onChange={(e) => setAdminSenha2(e.target.value)}
              type="password"
              value={adminSenha2}
            />
          </>
        ) : (
          <div style={{ gridColumn: '1 / -1' }}>
            <OperationalNotice>
              A senha do admin sera a da sua sessao actual (<code>{defaultsDaSessao().adminLogin || '—'}</code>). Se a
              sessao nao tiver senha em memoria, saia e entre de novo antes de criar.
            </OperationalNotice>
          </div>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <Button disabled={!canAdminister || busy} onClick={() => void criar()} type="button">
            {busy ? 'A criar…' : 'Criar empresa na nuvem'}
          </Button>
        </div>
      </div>
      {erro ? (
        <div style={{ marginTop: 12 }}>
          <OperationalNotice tone="critical">{erro}</OperationalNotice>
        </div>
      ) : null}
      {ok ? (
        <div style={{ marginTop: 12 }}>
          <OperationalNotice tone="success">{ok}</OperationalNotice>
        </div>
      ) : null}
    </div>
  );
}
