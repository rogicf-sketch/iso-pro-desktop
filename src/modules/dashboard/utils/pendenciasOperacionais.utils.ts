import type { InventarioListItem } from '../../inventario/types/inventario.types';
import type { RecebimentoListItem } from '../../recebimentos/types/recebimento.types';
import type { RirRegistro, RncRegistro } from '../../qualidade/types/qualidade.types';
import { diasCorridosDesde } from './alertaOperacional.utils';

export const STATUS_RECEBIMENTO_CONFERENCIA_PENDENTE: RecebimentoListItem['status'][] = [
  'aguardando_conferencia',
  'parcialmente_conferido',
  'divergente',
];

export type MenuBadgeKey = 'conferencia' | 'rir' | 'rnc' | 'inventario' | 'recebimentos';

export type MenuBadgeCounts = Record<MenuBadgeKey, number>;

export const MENU_BADGE_BY_ROUTE: Partial<Record<string, MenuBadgeKey>> = {
  '/conferencia': 'conferencia',
  '/rir': 'rir',
  '/rnc': 'rnc',
  '/inventario': 'inventario',
  '/recebimentos': 'recebimentos',
};

export type RirReprovadoSemRncItem = {
  id: string;
  codigo: string;
  recebimentoId: string;
  recebimentoNotaFiscal: string;
  responsavel: string;
  dataRegistro: string;
  diasEmAberto: number;
};

export function recebimentoIdsComRncAtiva(rnc: RncRegistro[]): Set<string> {
  const ids = new Set<string>();
  for (const item of rnc) {
    if (item.status === 'cancelado') continue;
    const id = item.recebimentoId.trim();
    if (id) ids.add(id);
  }
  return ids;
}

export function listarRirReprovadosSemRnc(
  rir: RirRegistro[],
  rnc: RncRegistro[],
  ref: Date = new Date(),
): RirReprovadoSemRncItem[] {
  const comRnc = recebimentoIdsComRncAtiva(rnc);
  return rir
    .filter(
      (r) =>
        r.laudo === 'reprovado' &&
        r.status !== 'tratado' &&
        r.status !== 'cancelado' &&
        r.recebimentoId.trim() !== '' &&
        !comRnc.has(r.recebimentoId.trim()),
    )
    .map((r) => ({
      id: r.id,
      codigo: r.codigo.trim(),
      recebimentoId: r.recebimentoId.trim(),
      recebimentoNotaFiscal: (r.recebimentoNotaFiscal ?? '').trim(),
      responsavel: r.responsavel.trim(),
      dataRegistro: r.dataRegistro,
      diasEmAberto: diasCorridosDesde(r.dataRegistro, ref),
    }))
    .sort((a, b) => b.diasEmAberto - a.diasEmAberto);
}

export function contarRecebimentosAguardandoConferencia(recebimentos: RecebimentoListItem[]): number {
  return recebimentos.filter((r) => r.status === 'aguardando_conferencia').length;
}

export function contarConferenciaPendente(recebimentos: RecebimentoListItem[]): number {
  return recebimentos.filter(
    (r) =>
      r.modoRecebimento === 'aguardando_conferencia' &&
      STATUS_RECEBIMENTO_CONFERENCIA_PENDENTE.includes(r.status),
  ).length;
}

export function contarRecebimentosDivergentes(recebimentos: RecebimentoListItem[]): number {
  return recebimentos.filter((r) => r.status === 'divergente' || r.conferenciaItensDivergentes > 0).length;
}

export function contarRirAbertos(rir: RirRegistro[]): number {
  return rir.filter((r) => r.status !== 'tratado' && r.status !== 'cancelado').length;
}

export function contarRncAbertas(rnc: RncRegistro[]): number {
  return rnc.filter((r) => r.status !== 'concluido' && r.status !== 'cancelado').length;
}

export function contarInventariosAbertos(inventarios: InventarioListItem[]): number {
  return inventarios.filter((i) => i.status === 'aberto').length;
}

export function montarMenuBadgeCounts(input: {
  recebimentos: RecebimentoListItem[];
  rir: RirRegistro[];
  rnc: RncRegistro[];
  inventarios: InventarioListItem[];
}): MenuBadgeCounts {
  return {
    conferencia: contarConferenciaPendente(input.recebimentos),
    recebimentos: contarRecebimentosAguardandoConferencia(input.recebimentos),
    rir: contarRirAbertos(input.rir),
    rnc: contarRncAbertas(input.rnc),
    inventario: contarInventariosAbertos(input.inventarios),
  };
}
