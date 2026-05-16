import { z } from 'zod';
import type { Equipamento } from '../types/equipamento.types';

const equipamentoPersistidoSchema = z.object({
  id: z.string(),
  codigo: z.string().default(''),
  tipoEquipamento: z.string(),
  placa: z.string(),
  nomeOperador: z.string().default(''),
  telefoneOperador: z.string().default(''),
  setorResponsavel: z.string().default(''),
  empresaContratada: z.string().default(''),
  dataInicioProjeto: z.string().default(''),
  dataFimContrato: z.string().default(''),
  valorContrato: z.union([z.number(), z.null()]).optional().default(null),
  numeroContrato: z.string().default(''),
  statusEquipamento: z.enum(['operando', 'manutencao', 'parado', 'em_transito']),
  observacoes: z.string().default(''),
  dataCadastro: z.string(),
});

export const equipamentosPersistidosSchema = z.array(equipamentoPersistidoSchema);

export function parseEquipamentosPersistidos(raw: unknown): Equipamento[] | null {
  const result = equipamentosPersistidosSchema.safeParse(raw);
  return result.success ? (result.data as Equipamento[]) : null;
}
