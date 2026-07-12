import type { IsoSnapshotPayload } from './iso.js';

const ATD_NUMERO_RE = /^ATD-(\d{8})-(\d+)$/i;

export function dataStampAtendimento(date: Date = new Date()): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${mo}${d}`;
}

/** Formato unico mobile + PC: ATD-YYYYMMDD-00001 (5 digitos). */
export function formatNumeroAtendimento(sequencia: number, date: Date = new Date()): string {
  const seq = Math.max(1, Math.floor(Number(sequencia) || 0));
  return `ATD-${dataStampAtendimento(date)}-${String(seq).padStart(5, '0')}`;
}

export function parseNumeroAtendimento(
  numero: string,
): { dateStamp: string; sequencia: number } | null {
  const m = ATD_NUMERO_RE.exec(String(numero ?? '').trim());
  if (!m) return null;
  const sequencia = Number(m[2]);
  if (!Number.isFinite(sequencia) || sequencia <= 0) return null;
  return { dateStamp: m[1]!, sequencia };
}

function considerarNumero(numero: string, hoje: string, maxRef: { value: number }): void {
  const parsed = parseNumeroAtendimento(numero);
  if (!parsed || parsed.dateStamp !== hoje) return;
  maxRef.value = Math.max(maxRef.value, parsed.sequencia);
}

/** Maior sequencia ja usada hoje (cfg + historico + lotes + atendimentos). */
export function maxSequenciaAtendimentoNoPayload(payload: IsoSnapshotPayload | null | undefined): number {
  const maxRef = { value: Number((payload?.configuracoesSistema as Record<string, unknown> | undefined)?.sequenciaAtendimento) || 0 };
  const hoje = dataStampAtendimento();
  for (const h of payload?.atendimentoHistorico ?? []) {
    const rec = h as Record<string, unknown>;
    considerarNumero(String(rec.loteNumero ?? ''), hoje, maxRef);
  }
  for (const l of payload?.atendimentoLotes ?? []) {
    const rec = l as unknown as Record<string, unknown>;
    considerarNumero(String(rec.numero ?? ''), hoje, maxRef);
  }
  const atendimentosArr = (payload as Record<string, unknown> | null | undefined)?.atendimentos;
  if (Array.isArray(atendimentosArr)) {
    for (const a of atendimentosArr) {
      const rec = a as Record<string, unknown>;
      considerarNumero(String(rec.numero ?? ''), hoje, maxRef);
    }
  }
  return maxRef.value;
}

export function loteNumeroExisteNoPayload(payload: IsoSnapshotPayload, numero: string): boolean {
  const alvo = String(numero).trim();
  if (!alvo) return false;
  for (const h of payload.atendimentoHistorico ?? []) {
    if (String((h as Record<string, unknown>).loteNumero ?? '').trim() === alvo) return true;
  }
  for (const l of payload.atendimentoLotes ?? []) {
    if (String((l as unknown as Record<string, unknown>).numero ?? '').trim() === alvo) return true;
  }
  const atendimentosArr = (payload as Record<string, unknown>).atendimentos;
  if (Array.isArray(atendimentosArr)) {
    for (const a of atendimentosArr) {
      if (String((a as Record<string, unknown>).numero ?? '').trim() === alvo) return true;
    }
  }
  return false;
}

/**
 * Reserva protocolo inedito no payload (actualiza configuracoesSistema.sequenciaAtendimento).
 * Evita colisao quando cfg local ficou atras face ao historico na nuvem.
 */
export function reservarProximoNumeroAtendimento(payload: IsoSnapshotPayload): {
  numero: string;
  sequencia: number;
} {
  const cfg = { ...((payload.configuracoesSistema ?? {}) as Record<string, unknown>) };
  let seq = maxSequenciaAtendimentoNoPayload(payload);
  let numero: string;
  do {
    seq += 1;
    numero = formatNumeroAtendimento(seq);
  } while (loteNumeroExisteNoPayload(payload, numero));
  cfg.sequenciaAtendimento = seq;
  payload.configuracoesSistema = cfg;
  return { numero, sequencia: seq };
}

/** Chave de agrupamento historico: mesmo ATD + loteId distinto = sessoes separadas. */
export function chaveAgrupamentoHistoricoAtendimento(input: {
  loteNumero?: string | null;
  loteId?: string | number | null;
}): string {
  const numero = String(input.loteNumero ?? '').trim();
  if (!numero) return '';
  const loteId = input.loteId;
  if (loteId != null && String(loteId).trim() !== '') {
    return `${numero}::${String(loteId)}`;
  }
  return numero;
}
