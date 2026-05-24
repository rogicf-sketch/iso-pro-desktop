import { z } from 'zod';

/** Canal de registro no snapshot (`AtendimentoHistoricoLinha.origem`). */
export const origemRegistroIsoSchema = z.enum(['mobile', 'windows']);
export type OrigemRegistroIso = z.infer<typeof origemRegistroIsoSchema>;
