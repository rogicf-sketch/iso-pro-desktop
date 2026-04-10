import type { ConfiguracaoSistema } from '../../configuracoes/types/configuracao.types';

export type RirModoNumeracao = ConfiguracaoSistema['rirModoNumeracao'];

/** Rotulos curtos para o select em Configuracoes — equivalentes ao modal do I.S.O PRO (HTML). */
export const RIR_NUMERACAO_LABELS: Record<RirModoNumeracao, string> = {
  auto: 'Automático',
  disciplina: 'Por disciplina (nº do procedimento)',
  manual: 'Editável',
};

/** Texto longo exibido abaixo do select (mesma ideia do modal "Nº RIR — forma de preenchimento" do legado). */
export function descricaoModoNumeracaoRir(modo: RirModoNumeracao): string {
  switch (modo) {
    case 'auto':
      return 'Sequência global com prefixo do projeto ou cliente (ex.: PROJ-2026-0001). O sistema sugere o próximo número ao abrir um RIR novo ou ao clicar em Sugerir. Nos modos Automático e Por disciplina, o número ainda pode ser editado no formulário antes de salvar.';
    case 'disciplina':
      return 'Lê a sigla da disciplina no nº do procedimento e monta o RIR no formato RIR-TUB-01, RIR-ELE-02… com sequência separada por sigla (tubulação, elétrica, etc.). O procedimento deve incluir a sigla (ex.: PE-TUB-003 REV.2).';
    case 'manual':
      return 'Não sugere número. O campo Nº RIR fica livre para você digitar ou colar o código em cada relatório.';
  }
}

/** Ajuda compacta ao lado do campo Nº RIR no formulário. */
export function codigoHelpLinhaRir(modo: RirModoNumeracao): string {
  switch (modo) {
    case 'manual':
      return 'Modo editável (Configurações): informe o Nº RIR manualmente.';
    case 'disciplina':
      return 'Modo por disciplina: o código usa a sigla do nº do procedimento (ex.: RIR-TUB-01). Informe o procedimento com sigla (PE-TUB-003…).';
    case 'auto':
      return 'Modo automático: sequência global (prefixo projeto/cliente + ano). Use Sugerir para recalcular.';
  }
}
