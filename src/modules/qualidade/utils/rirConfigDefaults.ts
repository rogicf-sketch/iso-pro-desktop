import type { ConfiguracaoSistema } from '../../configuracoes/types/configuracao.types';

/** UO = projeto (prioridade) ou cliente; local e contrato espelham Configurações > centro de custo. */
export function rirObraDefaultsFromConfig(cfg: ConfiguracaoSistema): {
  uo: string;
  localObra: string;
  contratoNumero: string;
} {
  const uo = (cfg.projeto || cfg.cliente || '').trim();
  return {
    uo,
    localObra: (cfg.local || '').trim(),
    contratoNumero: (cfg.contrato || '').trim(),
  };
}
