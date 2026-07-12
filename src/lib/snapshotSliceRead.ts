import { hasSupabaseConfig } from './supabase';
import {
  readIsoProSnapshotPayload,
  readIsoProSnapshotSlices,
  type SnapshotSliceKey,
} from './isoProSnapshot';

/**
 * Leitura remota por fatias (não baixa o JSON inteiro).
 * Com Supabase configurado, PC e web usam slices — evita martelar a nuvem com payload completo.
 * Sem Supabase, cai no payload local/completo.
 */
export async function readSnapshotRemoteSliceOrFull<T extends Record<string, unknown>>(
  keys: readonly SnapshotSliceKey[],
): Promise<T> {
  if (hasSupabaseConfig()) {
    return readIsoProSnapshotSlices<T>(keys);
  }
  return readIsoProSnapshotPayload<T>();
}
