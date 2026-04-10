import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import { readConfiguracoes } from './configuracoes.service';
import type { DesktopLicensePayload } from '../types/desktop-license.types';

export type DesktopSecurityContext = {
  isElectron: boolean;
  machineFingerprint: string;
  machineLabel: string;
  appVersion: string;
};

type DesktopBindingEvaluation = {
  blocked: boolean;
  reason: string;
};

export type DesktopLicenseRegistryStatus = 'active' | 'revoked' | 'not_found' | 'unavailable';

export type DesktopLicenseHealth = {
  hasLicense: boolean;
  expiresAt: string;
  isExpired: boolean;
  expiresSoon: boolean;
  daysUntilExpiration: number | null;
};

const DESKTOP_BINDING_MAX_VALIDATION_AGE_MS = 15 * 24 * 60 * 60 * 1000;
const DESKTOP_LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw0nVddOZXS6jttuPAHyx
K6TfGsDz3jAC5vVsQt1zArhcXd1LSeX776BF3/f6/Dr7guPmyAnbcW2CYwiVdc+G
OR/mdrIW6DCe4kYvNys8lm2SleqU9jwELyhl725LLJoPLD114F8CbnMD4HzyBbs6
8ZZrVSu2Ce279b9Ec/WWEDuJeayQMZT6X0hgqP/d9vywgq6Z9erjRzCQXDpUe1ko
SPo6e7iT730cdpShUMHbOWcZH/5LiCFYI8a9kaI0s5momkMumZ5qX6Ch12yvDreg
MHDL/95B2S/bRMyCV2wAPOQgpdnXl16rYPD+s/COM24kTx5cDIeEJD7BqXc9E+u6
swIDAQAB
-----END PUBLIC KEY-----`;

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function importDesktopLicensePublicKey() {
  const base64 = DESKTOP_LICENSE_PUBLIC_KEY_PEM.replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');

  return window.crypto.subtle.importKey(
    'spki',
    decodeBase64Url(base64).buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['verify'],
  );
}

function parseDesktopLicenseToken(token: string) {
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  try {
    const payloadJson = new TextDecoder().decode(decodeBase64Url(parts[0]));
    return {
      payload: JSON.parse(payloadJson) as DesktopLicensePayload,
      encodedPayload: parts[0],
      encodedSignature: parts[1],
    };
  } catch {
    return null;
  }
}

export function extractDesktopLicensePayload(token: string) {
  return parseDesktopLicenseToken(token)?.payload ?? null;
}

export function getDesktopLicenseHealth(token: string): DesktopLicenseHealth {
  const payload = extractDesktopLicensePayload(token);
  if (!payload?.expiresAt) {
    return {
      hasLicense: Boolean(payload),
      expiresAt: '',
      isExpired: false,
      expiresSoon: false,
      daysUntilExpiration: null,
    };
  }

  const expirationTime = new Date(payload.expiresAt).getTime();
  if (!Number.isFinite(expirationTime)) {
    return {
      hasLicense: Boolean(payload),
      expiresAt: payload.expiresAt,
      isExpired: false,
      expiresSoon: false,
      daysUntilExpiration: null,
    };
  }

  const diffMs = expirationTime - Date.now();
  const daysUntilExpiration = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  return {
    hasLicense: true,
    expiresAt: payload.expiresAt,
    isExpired: diffMs < 0,
    expiresSoon: diffMs >= 0 && diffMs <= 30 * 24 * 60 * 60 * 1000,
    daysUntilExpiration,
  };
}

export async function getDesktopLicenseRegistryStatus(token: string): Promise<ServiceResult<DesktopLicenseRegistryStatus>> {
  const payload = extractDesktopLicensePayload(token);
  if (!payload?.licenseId) {
    return { success: false, error: 'Licenca desktop sem identificador valido.' };
  }

  if (!hasSupabaseConfig()) {
    return { success: true, data: 'unavailable', meta: { source: 'local' } };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { success: true, data: 'unavailable', meta: { source: 'local' } };
  }

  const { data, error } = await supabase
    .from('desktop_licencas')
    .select('status')
    .eq('license_id', payload.licenseId)
    .maybeSingle();

  if (error) {
    return {
      success: true,
      data: 'unavailable',
      meta: { source: 'supabase', fallbackReason: 'Nao foi possivel consultar o registro central da licenca.' },
    };
  }

  if (!data) {
    return { success: true, data: 'not_found', meta: { source: 'supabase' } };
  }

  return {
    success: true,
    data: data.status === 'revoked' ? 'revoked' : 'active',
    meta: { source: 'supabase' },
  };
}

export async function updateDesktopLicenseRegistryStatus(
  token: string,
  status: 'active' | 'revoked',
  reason?: string,
): Promise<ServiceResult<DesktopLicenseRegistryStatus>> {
  const payload = extractDesktopLicensePayload(token);
  if (!payload?.licenseId) {
    return { success: false, error: 'Licenca desktop sem identificador valido.' };
  }

  if (!hasSupabaseConfig()) {
    return { success: false, error: 'Supabase indisponivel para administrar a licenca central.' };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, error: 'Cliente Supabase indisponivel para administrar a licenca central.' };
  }

  const { error } = await supabase.from('desktop_licencas').upsert(
    {
      license_id: payload.licenseId,
      issued_to: payload.issuedTo,
      machine_fingerprint: payload.machineFingerprint,
      machine_label: payload.machineLabel ?? null,
      app_version: payload.appVersion ?? null,
      status,
      emitida_em: payload.issuedAt,
      expira_em: payload.expiresAt ?? null,
      revogada_em: status === 'revoked' ? new Date().toISOString() : null,
      motivo_revogacao: status === 'revoked' ? reason?.trim() || 'Revogada administrativamente no desktop.' : null,
    },
    { onConflict: 'license_id' },
  );

  if (error) {
    return { success: false, error: 'Nao foi possivel atualizar o status central da licenca desktop.' };
  }

  return { success: true, data: status, meta: { source: 'supabase' } };
}

async function verifyDesktopLicenseSignature(encodedPayload: string, encodedSignature: string) {
  const publicKey = await importDesktopLicensePublicKey();
  return window.crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(encodedPayload),
  );
}

async function validateDesktopLicense(context: DesktopSecurityContext): Promise<DesktopBindingEvaluation> {
  const config = readConfiguracoes();

  if (!config.desktopLicencaToken) {
    return {
      blocked: false,
      reason: '',
    };
  }

  if (!config.desktopLicencaEmitidaPara) {
    return {
      blocked: true,
      reason: 'A licenca desktop esta sem identificacao do titular autorizado.',
    };
  }

  const parsedToken = parseDesktopLicenseToken(config.desktopLicencaToken);
  if (!parsedToken) {
    return {
      blocked: true,
      reason: 'O token da licenca desktop esta em formato invalido.',
    };
  }

  try {
    const signatureIsValid = await verifyDesktopLicenseSignature(parsedToken.encodedPayload, parsedToken.encodedSignature);
    if (!signatureIsValid) {
      return {
        blocked: true,
        reason: 'A assinatura criptografica da licenca desktop e invalida.',
      };
    }
  } catch {
    return {
      blocked: true,
      reason: 'Nao foi possivel validar a assinatura criptografica da licenca desktop.',
    };
  }

  const payload = parsedToken.payload;

  if (!payload.licenseId || !payload.issuedTo || !payload.machineFingerprint || !payload.issuedAt) {
    return {
      blocked: true,
      reason: 'A licenca desktop assinada esta incompleta.',
    };
  }

  if ((payload.status ?? 'active') !== 'active') {
    return {
      blocked: true,
      reason: 'A licenca desktop assinada nao esta mais ativa.',
    };
  }

  if (payload.issuedTo !== config.desktopLicencaEmitidaPara) {
    return {
      blocked: true,
      reason: 'O titular registrado na licenca assinada nao confere com a configuracao administrativa.',
    };
  }

  if (payload.machineFingerprint !== config.desktopInstalacaoAutorizadaId || payload.machineFingerprint !== context.machineFingerprint) {
    return {
      blocked: true,
      reason: 'A licenca assinada nao pertence a esta maquina autorizada.',
    };
  }

  if (payload.expiresAt) {
    const expirationTime = new Date(payload.expiresAt).getTime();
    if (!Number.isFinite(expirationTime)) {
      return {
        blocked: true,
        reason: 'A licenca desktop assinada possui data de expiracao invalida.',
      };
    }

    if (Date.now() > expirationTime) {
      return {
        blocked: true,
        reason: 'A licenca desktop desta instalacao expirou e precisa ser renovada.',
      };
    }
  }

  if (config.desktopLicencaExpiraEm && payload.expiresAt && config.desktopLicencaExpiraEm !== payload.expiresAt) {
    return {
      blocked: true,
      reason: 'A expiracao registrada na configuracao nao confere com a licenca assinada.',
    };
  }

  if (payload.appVersion && payload.appVersion !== context.appVersion) {
    return {
      blocked: true,
      reason: `A licenca assinada foi emitida para a versao ${payload.appVersion} e nao para a versao atual ${context.appVersion}.`,
    };
  }

  if (hasSupabaseConfig()) {
    const registryStatus = await getDesktopLicenseRegistryStatus(config.desktopLicencaToken);
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('desktop_licencas')
        .select('status, motivo_revogacao')
        .eq('license_id', payload.licenseId)
        .maybeSingle();

      // Se a tabela ainda nao existir ou a consulta falhar, a validacao local continua operando.
      if (!error && data && registryStatus.data === 'revoked') {
        return {
          blocked: true,
          reason: data.motivo_revogacao
            ? `A licenca desktop foi revogada centralmente. Motivo: ${data.motivo_revogacao}`
            : 'A licenca desktop foi revogada centralmente.',
        };
      }

      if (!error && data && registryStatus.data && !['active', 'revoked'].includes(registryStatus.data)) {
        return {
          blocked: true,
          reason: 'A licenca desktop nao esta ativa na validacao central.',
        };
      }
    }
  }

  return {
    blocked: false,
    reason: '',
  };
}

export async function getDesktopSecurityContext(): Promise<DesktopSecurityContext | null> {
  if (!window.isoProDesktop?.getSecurityContext) return null;

  try {
    return await window.isoProDesktop.getSecurityContext();
  } catch {
    return null;
  }
}

export async function evaluateDesktopBinding(context: DesktopSecurityContext | null): Promise<DesktopBindingEvaluation> {
  const config = readConfiguracoes();
  const isDesktopRuntime = window.isoProDesktop?.platform === 'desktop';

  if (!config.desktopVinculoAtivo) {
    return {
      blocked: false,
      reason: '',
    };
  }

  if (!isDesktopRuntime) {
    return {
      blocked: false,
      reason: '',
    };
  }

  if (!context?.isElectron || !context.machineFingerprint) {
    return {
      blocked: true,
      reason: 'Nao foi possivel validar a identidade desta instalacao desktop.',
    };
  }

  if (!config.desktopInstalacaoAutorizadaId) {
    return {
      blocked: true,
      reason: 'Vinculo de instalacao ativo sem identificacao autorizada definida.',
    };
  }

  if (config.desktopInstalacaoAutorizadaId !== context.machineFingerprint) {
    return {
      blocked: true,
      reason: `Esta instalacao nao corresponde ao equipamento autorizado (${config.desktopInstalacaoAutorizadaNome || 'maquina protegida'}).`,
    };
  }

  const licenseValidation = await validateDesktopLicense(context);
  if (licenseValidation.blocked) {
    return licenseValidation;
  }

  const lastValidationTime = config.desktopUltimaValidacaoEm ? new Date(config.desktopUltimaValidacaoEm).getTime() : 0;
  if (!lastValidationTime || !Number.isFinite(lastValidationTime)) {
    return {
      blocked: true,
      reason: 'A instalacao vinculada esta sem historico de validacao confiavel.',
    };
  }

  if (Date.now() - lastValidationTime > DESKTOP_BINDING_MAX_VALIDATION_AGE_MS) {
    return {
      blocked: true,
      reason: 'A vinculacao desta instalacao expirou e precisa ser revalidada pela administracao.',
    };
  }

  return {
    blocked: false,
    reason: '',
  };
}
