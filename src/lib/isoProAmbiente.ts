/**
 * Ambientes de obra no desktop: isolamento de `localStorage` (e IndexedDB de media) por obra/projeto,
 * mantendo o ambiente `padrao` sem sufixo para compatibilidade com instalações existentes.
 *
 * Chaves operacionais incluem também `::tenant:<uuid>` quando a empresa activa nao e a default
 * (ver `getActiveTenantId()` em `isoProTenant.ts`).
 */

import { getActiveTenantId, ISO_PRO_DEFAULT_TENANT_ID } from './isoProTenant';

export const ISO_PRO_AMBIENTE_ESTADO_KEY = 'iso-pro-desktop-ambientes-estado-v1';

/** Centro de custo inicial da obra (espelha Configurações → Dados gerais). */
export type IsoProCentroCustoAmbiente = {
  cliente: string;
  projeto: string;
  contrato: string;
  local: string;
};

export type IsoProAmbienteDef = {
  id: string;
  nome: string;
  centroCusto?: IsoProCentroCustoAmbiente;
};

export type IsoProAmbientesEstado = {
  version: 1;
  ambientes: IsoProAmbienteDef[];
  ativoId: string;
};

const DEFAULT_ESTADO: IsoProAmbientesEstado = {
  version: 1,
  ambientes: [{ id: 'padrao', nome: 'Principal (dados já existentes neste PC)' }],
  ativoId: 'padrao',
};

export function readEstadoAmbientes(): IsoProAmbientesEstado {
  if (typeof localStorage === 'undefined') return DEFAULT_ESTADO;
  try {
    const raw = localStorage.getItem(ISO_PRO_AMBIENTE_ESTADO_KEY);
    if (!raw) return DEFAULT_ESTADO;
    const p = JSON.parse(raw) as Partial<IsoProAmbientesEstado>;
    if (p.version !== 1 || !Array.isArray(p.ambientes) || p.ambientes.length === 0) return DEFAULT_ESTADO;
    const ambientes = p.ambientes
      .filter((a) => a?.id?.trim() && a?.nome?.trim())
      .map((a) => ({
        id: String(a.id).trim(),
        nome: String(a.nome).trim(),
        centroCusto: normalizarCentroCustoAmbiente(a.centroCusto),
      })) as IsoProAmbienteDef[];
    if (!ambientes.some((a) => a.id === 'padrao')) {
      ambientes.unshift({ id: 'padrao', nome: 'Principal (dados já existentes neste PC)' });
    }
    const ativoRaw = p.ativoId?.trim();
    const ativoId = ativoRaw && ambientes.some((a) => a.id === ativoRaw) ? ativoRaw : 'padrao';
    return { version: 1, ambientes, ativoId };
  } catch {
    return DEFAULT_ESTADO;
  }
}

export function writeEstadoAmbientes(next: IsoProAmbientesEstado): void {
  localStorage.setItem(ISO_PRO_AMBIENTE_ESTADO_KEY, JSON.stringify(next));
}

export function getAmbienteAtivoId(): string {
  return readEstadoAmbientes().ativoId;
}

function normalizarCentroCustoAmbiente(raw: unknown): IsoProCentroCustoAmbiente | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Partial<IsoProCentroCustoAmbiente>;
  const centro: IsoProCentroCustoAmbiente = {
    cliente: String(c.cliente ?? '').trim(),
    projeto: String(c.projeto ?? '').trim(),
    contrato: String(c.contrato ?? '').trim(),
    local: String(c.local ?? '').trim(),
  };
  return centroCustoAmbientePreenchido(centro) ? centro : undefined;
}

export function centroCustoAmbientePreenchido(centro: Partial<IsoProCentroCustoAmbiente> | undefined): boolean {
  if (!centro) return false;
  return [centro.cliente, centro.projeto, centro.contrato, centro.local].some((v) => String(v ?? '').trim());
}

export function resumoCentroCustoAmbiente(centro: IsoProCentroCustoAmbiente | undefined): string {
  if (!centro || !centroCustoAmbientePreenchido(centro)) return '';
  return [centro.cliente, centro.projeto, centro.contrato, centro.local].filter((v) => v.trim()).join(' · ');
}

/** Partes opcionais de uma chave ISO PRO com sufixos `::tenant:` e `::ambiente:`. */
export function parseIsoProStorageKey(fullKey: string): {
  base: string;
  tenantId: string | null;
  ambienteId: string | null;
} {
  let rest = fullKey;
  let tenantId: string | null = null;
  let ambienteId: string | null = null;

  const ambIdx = rest.indexOf('::ambiente:');
  if (ambIdx !== -1) {
    ambienteId = rest.slice(ambIdx + '::ambiente:'.length).trim() || null;
    rest = rest.slice(0, ambIdx);
  }
  const tenIdx = rest.indexOf('::tenant:');
  if (tenIdx !== -1) {
    tenantId = rest.slice(tenIdx + '::tenant:'.length).trim() || null;
    rest = rest.slice(0, tenIdx);
  }
  return { base: rest, tenantId, ambienteId };
}

/** Chave `localStorage` / IndexedDB para ambiente e tenant concretos (sem depender do activo). */
export function getScopedIsoProStorageKeyForAmbienteIdAndTenant(
  baseKey: string,
  ambienteId: string,
  tenantId: string,
): string {
  let key = baseKey.trim();
  const tenant = tenantId.trim();
  const ambiente = ambienteId.trim();
  if (tenant && tenant !== ISO_PRO_DEFAULT_TENANT_ID) {
    key = `${key}::tenant:${tenant}`;
  }
  if (ambiente && ambiente !== 'padrao') {
    key = `${key}::ambiente:${ambiente}`;
  }
  return key;
}

/** Chave `localStorage` / IndexedDB para um ambiente concreto (sem depender do activo). */
export function getScopedIsoProStorageKeyForAmbienteId(baseKey: string, ambienteId: string): string {
  return getScopedIsoProStorageKeyForAmbienteIdAndTenant(baseKey, ambienteId, getActiveTenantId());
}

/** Chave `localStorage` / IndexedDB com isolamento por empresa (tenant) e ambiente activos. */
export function getScopedIsoProStorageKey(baseKey: string): string {
  return getScopedIsoProStorageKeyForAmbienteIdAndTenant(baseKey, getAmbienteAtivoId(), getActiveTenantId());
}

/** Sufixo estável para nome da base IndexedDB de blobs (evita misturar fotos entre empresas/obras). */
export function getAmbienteMediaDbSuffix(): string {
  const parts: string[] = [];
  const tenant = getActiveTenantId();
  if (tenant && tenant !== ISO_PRO_DEFAULT_TENANT_ID) {
    parts.push(`tenant:${tenant}`);
  }
  const ambiente = getAmbienteAtivoId();
  if (ambiente && ambiente !== 'padrao') {
    parts.push(`ambiente:${ambiente}`);
  }
  return parts.length ? `::${parts.join('::')}` : '';
}

/**
 * `padrao` + tenant default: chaves legadas sem sufixos.
 * Outros tenants: `::tenant:<uuid>`; outras obras: `::ambiente:<id>` (combinavel).
 */
export function isStorageKeyForAmbienteAtivo(fullKey: string): boolean {
  const { tenantId, ambienteId } = parseIsoProStorageKey(fullKey);
  const activeTenant = getActiveTenantId();
  const activeAmbiente = getAmbienteAtivoId();

  const tenantOk =
    activeTenant === ISO_PRO_DEFAULT_TENANT_ID ? tenantId === null : tenantId === activeTenant;
  const ambienteOk =
    !activeAmbiente || activeAmbiente === 'padrao' ? ambienteId === null : ambienteId === activeAmbiente;

  return tenantOk && ambienteOk;
}

export function isIsoProManagedStorageKey(k: string): boolean {
  return (
    k.startsWith('iso-pro-desktop-') ||
    k.startsWith('iso-pro-rf-') ||
    k.startsWith('iso-pro-relatorio') ||
    k.startsWith('iso-pro-materiais-import')
  );
}

export function slugifyNovoAmbienteId(nome: string): string {
  const t = nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return t || `obra-${Date.now()}`;
}

export function adicionarAmbienteObra(
  nome: string,
  centroCusto?: Partial<IsoProCentroCustoAmbiente>,
): IsoProAmbienteDef | null {
  const n = nome.trim();
  if (!n) return null;
  const estado = readEstadoAmbientes();
  let id = slugifyNovoAmbienteId(n);
  let i = 2;
  while (estado.ambientes.some((a) => a.id === id)) {
    id = `${slugifyNovoAmbienteId(n)}-${i++}`;
  }
  const centro = normalizarCentroCustoAmbiente(centroCusto);
  const novo: IsoProAmbienteDef = centro ? { id, nome: n, centroCusto: centro } : { id, nome: n };
  writeEstadoAmbientes({ ...estado, ambientes: [...estado.ambientes, novo] });
  return novo;
}

export function definirAmbienteAtivo(id: string): boolean {
  const estado = readEstadoAmbientes();
  if (!estado.ambientes.some((a) => a.id === id)) return false;
  writeEstadoAmbientes({ ...estado, ativoId: id });
  return true;
}

export function removerAmbienteObra(id: string): boolean {
  if (id === 'padrao') return false;
  const estado = readEstadoAmbientes();
  const idx = estado.ambientes.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  limparChavesLocalStorageDoAmbienteId(id);
  const ambientes = estado.ambientes.filter((a) => a.id !== id);
  const ativoId = estado.ativoId === id ? 'padrao' : estado.ativoId;
  writeEstadoAmbientes({ ...estado, ambientes, ativoId });
  return true;
}

export function limparChavesLocalStorageDoAmbienteId(ambienteId: string): void {
  const suffix = `::ambiente:${ambienteId}`;
  const activeTenant = getActiveTenantId();
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.endsWith(suffix)) continue;
    const { tenantId } = parseIsoProStorageKey(k);
    const tenantOk =
      activeTenant === ISO_PRO_DEFAULT_TENANT_ID ? tenantId === null : tenantId === activeTenant;
    if (tenantOk) toRemove.push(k);
  }
  for (const k of toRemove) localStorage.removeItem(k);
}

export function aplicarAmbienteAtivoERecarregar(id: string): void {
  const estado = readEstadoAmbientes();
  if (!estado.ambientes.some((a) => a.id === id)) return;
  if (estado.ativoId === id) return;
  writeEstadoAmbientes({ ...estado, ativoId: id });
  window.location.reload();
}
