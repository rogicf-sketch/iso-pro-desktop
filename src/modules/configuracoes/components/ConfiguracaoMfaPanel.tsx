import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { isIsoProJwtSessionActive } from '../../../lib/isoProJwtSession';
import { MFA_POLICY_NOTE } from '../../../lib/releaseChannel';
import {
  listIsoProMfaFactors,
  startIsoProMfaTotpEnroll,
  unenrollIsoProMfaFactor,
  verifyIsoProMfaTotpEnroll,
  type IsoProMfaEnrollStart,
  type IsoProMfaFactor,
} from '../../../lib/isoProMfa';

type Props = {
  canAdminister: boolean;
};

export function ConfiguracaoMfaPanel({ canAdminister }: Props) {
  const jwtOn = isIsoProJwtSessionActive();
  const [factors, setFactors] = useState<IsoProMfaFactor[]>([]);
  const [enroll, setEnroll] = useState<IsoProMfaEnrollStart | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!jwtOn) {
      setFactors([]);
      return;
    }
    try {
      setFactors(await listIsoProMfaFactors());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [jwtOn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!canAdminister) return null;

  return (
    <div className="panel" style={{ marginTop: '1rem' }}>
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Segurança</p>
          <h2>MFA (authenticator)</h2>
        </div>
      </div>

      {!jwtOn ? (
        <OperationalNotice tone="warning">
          MFA só está disponível com sessão <strong>JWT forte</strong>. Faça logout e login com o utilizador{' '}
          <code>admin</code> (Auth ligado). Utilizadores só em modo anon não usam MFA.
        </OperationalNotice>
      ) : (
        <>
          <OperationalNotice>{MFA_POLICY_NOTE}</OperationalNotice>
          <OperationalNotice>
            Sessão JWT activa. Configure uma app authenticator (Google Authenticator, Microsoft Authenticator, 1Password,
            etc.) para o login Auth. O MFA TOTP já está activo no projecto Supabase.
          </OperationalNotice>

          {factors.length > 0 ? (
            <ul className="config-mfa-list">
              {factors.map((f) => (
                <li key={f.id}>
                  <strong>{f.friendlyName}</strong> — {f.status} ({f.factorType})
                  {f.status === 'verified' ? (
                    <Button
                      disabled={busy}
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setBusy(true);
                        setError(null);
                        void unenrollIsoProMfaFactor(f.id)
                          .then(() => {
                            setMessage('Factor MFA removido.');
                            return refresh();
                          })
                          .catch((err: unknown) => {
                            setError(err instanceof Error ? err.message : String(err));
                          })
                          .finally(() => setBusy(false));
                      }}
                    >
                      Remover
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <OperationalNotice>Nenhum authenticator verificado ainda.</OperationalNotice>
          )}

          {!enroll ? (
            <Button
              disabled={busy || factors.some((f) => f.status === 'verified')}
              type="button"
              onClick={() => {
                setBusy(true);
                setError(null);
                setMessage(null);
                void startIsoProMfaTotpEnroll()
                  .then((started) => setEnroll(started))
                  .catch((err: unknown) => {
                    setError(err instanceof Error ? err.message : String(err));
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Adicionar authenticator
            </Button>
          ) : (
            <div className="config-mfa-enroll">
              {enroll.qrCode ? (
                <img alt="QR code MFA" src={enroll.qrCode} style={{ width: 180, height: 180 }} />
              ) : null}
              <p>
                Segredo (se não puder ler o QR): <code>{enroll.secret}</code>
              </p>
              <Input
                label="Código de 6 dígitos"
                inputMode="numeric"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className="form-actions">
                <Button
                  disabled={busy || code.trim().length < 6}
                  type="button"
                  onClick={() => {
                    setBusy(true);
                    setError(null);
                    void verifyIsoProMfaTotpEnroll(enroll.factorId, code)
                      .then(() => {
                        setEnroll(null);
                        setCode('');
                        setMessage('MFA activado.');
                        return refresh();
                      })
                      .catch((err: unknown) => {
                        setError(err instanceof Error ? err.message : String(err));
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  Confirmar MFA
                </Button>
                <Button
                  disabled={busy}
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEnroll(null);
                    setCode('');
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {message ? <OperationalNotice>{message}</OperationalNotice> : null}
      {error ? <OperationalNotice tone="critical">{error}</OperationalNotice> : null}
    </div>
  );
}
