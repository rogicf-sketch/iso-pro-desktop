import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import type { ServiceResult } from '../../../types/common.types';
import type { DesktopLicenseRegistryItem } from '../types/desktop-license-registry.types';

export type DesktopLicenseRegistrySummary = {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  expiringSoon: number;
  missingMachineLabel: number;
};

function mapDesktopLicense(item: {
  license_id: string;
  issued_to: string;
  machine_fingerprint: string;
  machine_label: string | null;
  app_version: string | null;
  status: 'active' | 'revoked';
  emitida_em: string;
  expira_em: string | null;
  revogada_em: string | null;
  motivo_revogacao: string | null;
}): DesktopLicenseRegistryItem {
  return {
    licenseId: item.license_id,
    issuedTo: item.issued_to,
    machineFingerprint: item.machine_fingerprint,
    machineLabel: item.machine_label ?? '',
    appVersion: item.app_version ?? '',
    status: item.status,
    emitidaEm: item.emitida_em,
    expiraEm: item.expira_em ?? '',
    revogadaEm: item.revogada_em ?? '',
    motivoRevogacao: item.motivo_revogacao ?? '',
  };
}

export async function listDesktopLicenseRegistry(): Promise<ServiceResult<DesktopLicenseRegistryItem[]>> {
  if (!hasSupabaseConfig()) {
    return {
      success: true,
      data: [],
      meta: { source: 'local', fallbackReason: 'Supabase nao configurado para consultar licencas desktop.' },
    };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return {
      success: true,
      data: [],
      meta: { source: 'local', fallbackReason: 'Cliente Supabase indisponivel para consultar licencas desktop.' },
    };
  }

  const { data, error } = await supabase
    .from('desktop_licencas')
    .select('license_id, issued_to, machine_fingerprint, machine_label, app_version, status, emitida_em, expira_em, revogada_em, motivo_revogacao')
    .order('emitida_em', { ascending: false });

  if (error) {
    return {
      success: true,
      data: [],
      meta: { source: 'local', fallbackReason: 'Nao foi possivel consultar o registro central de licencas desktop.' },
    };
  }

  return {
    success: true,
    data: (data ?? []).map(mapDesktopLicense),
    meta: { source: 'supabase' },
  };
}

export async function getDesktopLicenseRegistrySummary(): Promise<ServiceResult<DesktopLicenseRegistrySummary>> {
  const result = await listDesktopLicenseRegistry();
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const items = result.data ?? [];
  const now = Date.now();
  const expiringThreshold = now + 30 * 24 * 60 * 60 * 1000;

  const summary = items.reduce<DesktopLicenseRegistrySummary>(
    (acc, item) => {
      acc.total += 1;
      if (item.status === 'revoked') {
        acc.revoked += 1;
      } else {
        acc.active += 1;
      }

      const expiresAt = item.expiraEm ? new Date(item.expiraEm).getTime() : 0;
      if (expiresAt && expiresAt < now) {
        acc.expired += 1;
      } else if (expiresAt && expiresAt <= expiringThreshold) {
        acc.expiringSoon += 1;
      }

      if (!item.machineLabel.trim()) {
        acc.missingMachineLabel += 1;
      }

      return acc;
    },
    { total: 0, active: 0, revoked: 0, expired: 0, expiringSoon: 0, missingMachineLabel: 0 },
  );

  return {
    success: true,
    data: summary,
    meta: result.meta,
  };
}
