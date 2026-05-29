/** Contadores desde o ultimo backup Oracle bem-sucedido. */
export type BackupOracleActivity = {
  atendimentos: number;
  recebimentos: number;
  cadastros: number;
};

export type BackupOraclePolicyInput = {
  agora: Date;
  ultimoBackupEm: string | null;
  atividade: BackupOracleActivity;
  /** Ex.: 7 — uma vez por semana (rotina). */
  intervaloRotinaDias: number;
  /** Ex.: 3 — com fluxo alto, no minimo a cada 3 dias. */
  intervaloFluxoAltoDias: number;
  minAtendimentosFluxo: number;
  minRecebimentosFluxo: number;
  minCadastrosFluxo: number;
};

export type BackupOraclePolicyResult = {
  executar: boolean;
  motivo: 'primeiro_backup' | 'fluxo_alto' | 'rotina' | 'aguardar';
};

export function atividadeBackupOracleFluxoAlto(
  atividade: BackupOracleActivity,
  limites: Pick<
    BackupOraclePolicyInput,
    'minAtendimentosFluxo' | 'minRecebimentosFluxo' | 'minCadastrosFluxo'
  >,
): boolean {
  return (
    atividade.atendimentos >= limites.minAtendimentosFluxo ||
    atividade.recebimentos >= limites.minRecebimentosFluxo ||
    atividade.cadastros >= limites.minCadastrosFluxo
  );
}

export function diasDesde(iso: string, agora: Date): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (agora.getTime() - t) / 86_400_000;
}

/** Decide se e hora de backup automatico na Oracle (desktop). */
export function deveExecutarBackupOracleAutomatico(input: BackupOraclePolicyInput): BackupOraclePolicyResult {
  const {
    agora,
    ultimoBackupEm,
    atividade,
    intervaloRotinaDias,
    intervaloFluxoAltoDias,
    minAtendimentosFluxo,
    minRecebimentosFluxo,
    minCadastrosFluxo,
  } = input;

  if (!ultimoBackupEm) {
    return { executar: true, motivo: 'primeiro_backup' };
  }

  const dias = diasDesde(ultimoBackupEm, agora);
  const fluxoAlto = atividadeBackupOracleFluxoAlto(atividade, {
    minAtendimentosFluxo,
    minRecebimentosFluxo,
    minCadastrosFluxo,
  });

  if (fluxoAlto && dias >= intervaloFluxoAltoDias) {
    return { executar: true, motivo: 'fluxo_alto' };
  }

  if (dias >= intervaloRotinaDias) {
    return { executar: true, motivo: 'rotina' };
  }

  return { executar: false, motivo: 'aguardar' };
}
