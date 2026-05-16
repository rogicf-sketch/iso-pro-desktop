import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { getActiveTenantId } from '../../../lib/isoProTenant';
import { getSupabase, hasSupabaseConfig } from '../../../lib/supabase';
import { isBusinessLocalWriteBlocked } from '../../../lib/writePolicy';
import { parseMobileDevicesLocal } from '../schemas/mobileDevicesLocal.zod';
import type { MobileDevice, MobileDeviceFilter, MobileDeviceStatus } from '../types/mobileDevice.types';

function mobileDevicesStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-desktop-mobile-devices');
}

const seedDevices: MobileDevice[] = [
  {
    id: 'mob-1',
    deviceId: 'android-a1',
    nomeAparelho: 'Samsung A54 - Almoxarifado',
    usuarioLogin: 'joao.silva',
    usuarioNome: 'Joao Silva',
    plataforma: 'android',
    modelo: 'Samsung A54',
    versaoApp: '1.0.0',
    status: 'autorizado',
    ultimoAcessoEm: '2026-03-31T19:45:00.000Z',
    criadoEm: '2026-03-25T10:00:00.000Z',
  },
  {
    id: 'mob-2',
    deviceId: 'android-b2',
    nomeAparelho: 'Moto G84 - Conferencia',
    usuarioLogin: 'maria.lima',
    usuarioNome: 'Maria Lima',
    plataforma: 'android',
    modelo: 'Moto G84',
    versaoApp: '1.0.0',
    status: 'pendente',
    ultimoAcessoEm: '2026-03-31T18:20:00.000Z',
    criadoEm: '2026-03-31T18:10:00.000Z',
  },
  {
    id: 'mob-3',
    deviceId: 'ios-c3',
    nomeAparelho: 'iPhone 13 - Obra Norte',
    usuarioLogin: 'carlos.rocha',
    usuarioNome: 'Carlos Rocha',
    plataforma: 'ios',
    modelo: 'iPhone 13',
    versaoApp: '0.9.8',
    status: 'bloqueado',
    ultimoAcessoEm: '2026-03-30T16:00:00.000Z',
    criadoEm: '2026-03-20T09:30:00.000Z',
  },
];

type ListResponse = {
  items: MobileDevice[];
  total: number;
  source: 'supabase' | 'local';
  warning: string | null;
};

type IndicatorsResponse = {
  total: number;
  autorizados: number;
  pendentes: number;
  bloqueados: number;
  source: 'supabase' | 'local';
  warning: string | null;
};

type RemoteDeviceRow = {
  id?: string | null;
  device_id?: string | null;
  nome_aparelho?: string | null;
  usuario_login?: string | null;
  usuario_nome?: string | null;
  plataforma?: string | null;
  modelo?: string | null;
  versao_app?: string | null;
  autorizado?: boolean | null;
  bloqueado?: boolean | null;
  ultimo_acesso_em?: string | null;
  created_at?: string | null;
};

function readDevices(): MobileDevice[] {
  const raw = localStorage.getItem(mobileDevicesStorageKey());
  if (!raw) {
    localStorage.setItem(mobileDevicesStorageKey(), JSON.stringify(seedDevices));
    return [...seedDevices];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    localStorage.setItem(mobileDevicesStorageKey(), JSON.stringify(seedDevices));
    return [...seedDevices];
  }

  const rows = parseMobileDevicesLocal(parsed);
  if (rows === null) {
    localStorage.setItem(mobileDevicesStorageKey(), JSON.stringify(seedDevices));
    return [...seedDevices];
  }

  return rows;
}

function writeDevices(items: MobileDevice[]) {
  localStorage.setItem(mobileDevicesStorageKey(), JSON.stringify(items));
}

function sortDevices(items: MobileDevice[]) {
  return [...items].sort((a, b) => new Date(b.ultimoAcessoEm).getTime() - new Date(a.ultimoAcessoEm).getTime());
}

function filterDevices(items: MobileDevice[], filters: MobileDeviceFilter) {
  const term = filters.busca.trim().toLowerCase();

  return items.filter((item) => {
    const matchesStatus = filters.status === 'todos' ? true : item.status === filters.status;
    const matchesTerm = !term
      ? true
      : [
          item.nomeAparelho,
          item.usuarioLogin,
          item.usuarioNome,
          item.deviceId,
          item.modelo,
          item.plataforma,
        ]
          .join(' ')
          .toLowerCase()
          .includes(term);

    return matchesStatus && matchesTerm;
  });
}

function updateStatus(deviceId: string, status: MobileDeviceStatus) {
  const items = readDevices();
  const next = items.map((item) =>
    item.id === deviceId
      ? {
          ...item,
          status,
          ultimoAcessoEm: new Date().toISOString(),
        }
      : item,
  );
  writeDevices(next);
}

function mapStatusFromFlags(row: RemoteDeviceRow): MobileDeviceStatus {
  if (row.bloqueado) return 'bloqueado';
  if (row.autorizado) return 'autorizado';
  return 'pendente';
}

function mapRemoteDevice(row: RemoteDeviceRow): MobileDevice {
  return {
    id: row.id ?? row.device_id ?? crypto.randomUUID(),
    deviceId: row.device_id ?? '-',
    nomeAparelho: row.nome_aparelho ?? 'Dispositivo mobile',
    usuarioLogin: row.usuario_login ?? '-',
    usuarioNome: row.usuario_nome ?? row.usuario_login ?? 'Usuario mobile',
    plataforma:
      row.plataforma === 'android' || row.plataforma === 'ios' || row.plataforma === 'unknown'
        ? row.plataforma
        : 'unknown',
    modelo: row.modelo ?? 'Modelo nao identificado',
    versaoApp: row.versao_app ?? '1.0.0',
    status: mapStatusFromFlags(row),
    ultimoAcessoEm: row.ultimo_acesso_em ?? row.created_at ?? new Date().toISOString(),
    criadoEm: row.created_at ?? row.ultimo_acesso_em ?? new Date().toISOString(),
  };
}

function summarizeDeviceIndicators(items: MobileDevice[]) {
  let autorizados = 0;
  let pendentes = 0;
  let bloqueados = 0;

  for (const item of items) {
    if (item.status === 'autorizado') autorizados += 1;
    else if (item.status === 'pendente') pendentes += 1;
    else if (item.status === 'bloqueado') bloqueados += 1;
  }

  return {
    total: items.length,
    autorizados,
    pendentes,
    bloqueados,
  };
}

async function listRemoteDevices(): Promise<MobileDevice[]> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const { data, error } = await supabase
    .from('dispositivos_mobile')
    .select('id,device_id,nome_aparelho,usuario_login,usuario_nome,plataforma,modelo,versao_app,autorizado,bloqueado,ultimo_acesso_em,created_at')
    .eq('tenant_id', getActiveTenantId())
    .order('ultimo_acesso_em', { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapRemoteDevice(row as RemoteDeviceRow));
}

async function updateRemoteDeviceById(id: string, payload: { autorizado?: boolean; bloqueado?: boolean }) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const { error } = await supabase
    .from('dispositivos_mobile')
    .update({
      ...payload,
      ultimo_acesso_em: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', getActiveTenantId());

  if (error) {
    throw new Error(error.message);
  }
}

async function deleteRemoteDeviceById(id: string) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }

  const { error } = await supabase
    .from('dispositivos_mobile')
    .delete()
    .eq('id', id)
    .eq('tenant_id', getActiveTenantId());

  if (error) {
    throw new Error(error.message);
  }
}

export async function listMobileDevices(filters: MobileDeviceFilter): Promise<ListResponse> {
  try {
    const remoteItems = hasSupabaseConfig() ? await listRemoteDevices() : sortDevices(readDevices());
    const filtered = filterDevices(sortDevices(remoteItems), filters);
    const start = (filters.page - 1) * filters.pageSize;
    const end = start + filters.pageSize;

    return {
      items: filtered.slice(start, end),
      total: filtered.length,
      source: hasSupabaseConfig() ? 'supabase' : 'local',
      warning: null,
    };
  } catch (error) {
    const filtered = filterDevices(sortDevices(readDevices()), filters);
    const start = (filters.page - 1) * filters.pageSize;
    const end = start + filters.pageSize;

    return {
      items: filtered.slice(start, end),
      total: filtered.length,
      source: 'local',
      warning: error instanceof Error ? error.message : 'Falha ao ler dispositivos no Supabase.',
    };
  }
}

export async function getMobileDeviceIndicators(): Promise<IndicatorsResponse> {
  try {
    const items = hasSupabaseConfig() ? await listRemoteDevices() : readDevices();
    const summary = summarizeDeviceIndicators(items);
    return {
      ...summary,
      source: hasSupabaseConfig() ? 'supabase' : 'local',
      warning: null,
    };
  } catch (error) {
    const items = readDevices();
    const summary = summarizeDeviceIndicators(items);
    return {
      ...summary,
      source: 'local',
      warning: error instanceof Error ? error.message : 'Falha ao ler indicadores no Supabase.',
    };
  }
}

async function updateDeviceStatus(id: string, status: MobileDeviceStatus) {
  try {
    if (hasSupabaseConfig()) {
      await updateRemoteDeviceById(id, {
        autorizado: status === 'autorizado',
        bloqueado: status === 'bloqueado',
      });
      return;
    }
  } catch {
    // fallback local logo abaixo
  }

  if (isBusinessLocalWriteBlocked()) {
    return;
  }

  const items = readDevices();
  const target = items.find((item) => item.id === id);
  if (target) {
    updateStatus(id, status);
  }
}

export async function authorizeMobileDevice(id: string) {
  await updateDeviceStatus(id, 'autorizado');
}

export async function blockMobileDevice(id: string) {
  await updateDeviceStatus(id, 'bloqueado');
}

export async function unblockMobileDevice(id: string) {
  await updateDeviceStatus(id, 'autorizado');
}

export async function revokeMobileDevice(id: string) {
  try {
    if (hasSupabaseConfig()) {
      await deleteRemoteDeviceById(id);
      return;
    }
  } catch {
    // fallback local logo abaixo
  }

  if (isBusinessLocalWriteBlocked()) {
    return;
  }

  const items = readDevices().filter((item) => item.id !== id);
  writeDevices(items);
}

/** Teste manual: leitura da tabela (mesma usada pelo app mobile). */
export async function testSupabaseDispositivosMobile(): Promise<{ ok: boolean; message: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      ok: false,
      message: 'Cliente Supabase nao criado: falta URL e chave anon (Configuracoes ou VITE_ no build).',
    };
  }

  const { error, count } = await supabase
    .from('dispositivos_mobile')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', getActiveTenantId());

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    message: `Ligacao OK. Registos em dispositivos_mobile: ${count ?? 0}.`,
  };
}
