import { getScopedIsoProStorageKey } from './isoProAmbiente';
import { getCurrentUser } from '../modules/auth/services/auth.service';

/** Placa clássica (I.S.O | PRO) ou marca com ícone de barras. */
export type SidebarMarcaId = 'placa' | 'icone';

export const SIDEBAR_MARCA_OPCOES: Array<{ id: SidebarMarcaId; label: string }> = [
  { id: 'placa', label: 'Clássica (placa I.S.O | PRO)' },
  { id: 'icone', label: 'Marca com ícone (barras verdes)' },
];

export function normalizeSidebarMarcaId(raw: unknown, fallback: SidebarMarcaId = 'placa'): SidebarMarcaId {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (t === 'icone' || t === 'icon' || t === 'barras' || t === 'nova') return 'icone';
  if (t === 'placa' || t === 'classica' || t === 'clássica' || t === 'classic') return 'placa';
  return fallback;
}

function normalizeLoginParaChave(login: string): string {
  const t = login
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  const s = t.replace(/[^a-z0-9._-]/g, '_');
  return s || 'anon';
}

function chaveLocalStorageMarcaSidebar(login: string): string {
  return getScopedIsoProStorageKey(`iso-pro-desktop-usuario-marca-sidebar-${normalizeLoginParaChave(login)}`);
}

/** Preferência deste login neste equipamento; `null` = clássica. */
export function readUsuarioSidebarMarcaPreferida(): SidebarMarcaId | null {
  if (typeof localStorage === 'undefined') return null;
  const u = getCurrentUser();
  if (!u?.login?.trim()) return null;
  const raw = localStorage.getItem(chaveLocalStorageMarcaSidebar(u.login))?.trim();
  if (!raw) return null;
  return normalizeSidebarMarcaId(raw);
}

export function salvarUsuarioSidebarMarcaPreferida(marca: SidebarMarcaId): void {
  if (typeof localStorage === 'undefined') return;
  const u = getCurrentUser();
  if (!u?.login?.trim()) return;
  localStorage.setItem(chaveLocalStorageMarcaSidebar(u.login), normalizeSidebarMarcaId(marca));
}

export function limparUsuarioSidebarMarcaPreferida(): void {
  if (typeof localStorage === 'undefined') return;
  const u = getCurrentUser();
  if (!u?.login?.trim()) return;
  localStorage.removeItem(chaveLocalStorageMarcaSidebar(u.login));
}

export function getSidebarMarcaEfetiva(): SidebarMarcaId {
  return readUsuarioSidebarMarcaPreferida() ?? 'placa';
}
