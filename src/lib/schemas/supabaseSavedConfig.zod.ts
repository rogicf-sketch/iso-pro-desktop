import { z } from 'zod';

/** Conteúdo JSON em `iso-pro-desktop-configuracoes-sistema` (objeto plano, não array no topo). */
export const supabaseSavedConfigRootSchema = z.record(z.string(), z.unknown());

export function parseSupabaseSavedConfigRoot(raw: unknown): Record<string, unknown> | null {
  const result = supabaseSavedConfigRootSchema.safeParse(raw);
  return result.success ? result.data : null;
}
