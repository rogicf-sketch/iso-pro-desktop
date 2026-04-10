import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { Select } from '../../../components/ui/Select';
import type { UsuarioFormData, UsuarioPerfil } from '../types/usuario.types';

type Props = {
  initialValue: UsuarioFormData;
  profiles: UsuarioPerfil[];
  canAdminister: boolean;
  onCancel: () => void;
  onSubmit: (data: UsuarioFormData) => Promise<{ success: boolean; error?: string | undefined }>;
};

export function UsuarioForm({ initialValue, profiles, canAdminister, onCancel, onSubmit }: Props) {
  const [form, setForm] = useState<UsuarioFormData>(initialValue);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isInactive = !form.ativo;
  const hasAnyPermission = form.permissoes.some((item) => item.permitido);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const result = await onSubmit(form);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel salvar usuario.');
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  }

  function handleSelectProfile(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);
    setForm((current) => ({
      ...current,
      perfilId: profileId,
      permissoes: profile ? profile.permissoes.map((item) => ({ ...item })) : current.permissoes,
    }));
  }

  function toggleModulo(modulo: UsuarioFormData['permissoes'][number]['modulo']) {
    setForm((current) => ({
      ...current,
      permissoes: current.permissoes.map((item) =>
        item.modulo === modulo ? { ...item, permitido: !item.permitido } : item,
      ),
    }));
  }

  function togglePermissao(
    modulo: UsuarioFormData['permissoes'][number]['modulo'],
    acao: UsuarioFormData['permissoes'][number]['acao'],
  ) {
    setForm((current) => ({
      ...current,
      permissoes: current.permissoes.map((item) => {
        if (item.modulo !== modulo || item.acao !== acao) return item;
        return { ...item, permitido: !item.permitido };
      }),
    }));
  }

  function applyPermissionPreset(mode: 'all' | 'readOnly' | 'none') {
    setForm((current) => ({
      ...current,
      permissoes: current.permissoes.map((item) => ({
        ...item,
        permitido:
          mode === 'all'
            ? true
            : mode === 'readOnly'
              ? item.acao === 'visualizar'
              : false,
      })),
    }));
  }

  const modulosAgrupados = Array.from(new Set(form.permissoes.map((item) => item.modulo))).map((modulo) => ({
    modulo,
    permissoes: form.permissoes.filter((item) => item.modulo === modulo),
  }));

  return (
    <form className="stack-grid" onSubmit={handleSubmit}>
      <OperationalNotice tone="warning">
        Regra de seguranca: cada usuario deve receber apenas os modulos e acoes estritamente necessarios para a sua funcao.
      </OperationalNotice>
      {isInactive ? (
        <OperationalNotice tone="critical">
          Usuario marcado como inativo: novos acessos devem permanecer bloqueados ate reativacao administrativa.
        </OperationalNotice>
      ) : null}
      {!hasAnyPermission ? (
        <OperationalNotice tone="warning">
          Nenhuma permissao liberada no momento. Se salvar assim, o usuario podera ficar sem acesso operacional ao sistema.
        </OperationalNotice>
      ) : null}
      <div className="form-columns">
        <Input
          label="Nome"
          onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
          value={form.nome}
        />
        <Input
          label="Login"
          onChange={(event) => setForm((current) => ({ ...current, login: event.target.value }))}
          value={form.login}
        />
        <Input
          label="Senha"
          onChange={(event) => setForm((current) => ({ ...current, senha: event.target.value }))}
          placeholder="Preencha para novo usuario ou troca de senha"
          type="password"
          value={form.senha}
        />
      </div>

      <div className="form-columns">
        <Select
          label="Perfil"
          onChange={(event) => handleSelectProfile(event.target.value)}
          value={form.perfilId}
        >
          <option value="">Selecione</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.nome}
            </option>
          ))}
        </Select>

        <Select
          label="Status"
          onChange={(event) => setForm((current) => ({ ...current, ativo: event.target.value === 'true' }))}
          value={String(form.ativo)}
        >
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </Select>
      </div>

      <div className="section-block">
        <div>
          <strong>Modulos liberados</strong>
          <p className="panel-copy">Defina por modulo se o usuario pode visualizar, editar ou administrar.</p>
        </div>
        {canAdminister ? (
          <div className="inline-actions">
            <Button onClick={() => applyPermissionPreset('all')} variant="ghost">
              Liberar tudo
            </Button>
            <Button onClick={() => applyPermissionPreset('readOnly')} variant="ghost">
              Somente leitura
            </Button>
            <Button onClick={() => applyPermissionPreset('none')} variant="ghost">
              Limpar tudo
            </Button>
          </div>
        ) : null}
        <div className="cards-grid">
          {modulosAgrupados.map(({ modulo, permissoes }) => (
            <article
              className={`metric-card${permissoes.some((item) => item.permitido) ? ' active-permission-card' : ''}`}
              key={modulo}
            >
              <span className="metric-label">{modulo}</span>
              <strong>{permissoes.find((item) => item.acao === 'visualizar')?.permitido ? 'Liberado' : 'Bloqueado'}</strong>
              <div className="inline-actions">
                <Button onClick={() => toggleModulo(modulo)} variant="ghost">
                  Alternar modulo
                </Button>
              </div>
              <div className="table-actions">
                {permissoes.map((permissao) => (
                  <button
                    className={`status-badge ${permissao.permitido ? 'status-ok' : 'status-neutral'}`}
                    disabled={!canAdminister}
                    key={`${permissao.modulo}-${permissao.acao}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      togglePermissao(permissao.modulo, permissao.acao);
                    }}
                    type="button"
                  >
                    {permissao.acao}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
        {!canAdminister ? <p className="panel-copy">Somente perfis com permissao de administrar podem alterar as acoes finas deste modulo.</p> : null}
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="inline-actions">
        <Button disabled={submitting} type="submit">
          {submitting ? 'Salvando...' : 'Salvar usuario'}
        </Button>
        <Button onClick={onCancel} variant="ghost">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
