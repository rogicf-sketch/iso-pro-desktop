/** Descarrega ficheiro de texto no navegador (relatorios de importacao, logs). */
export function downloadTextFile(fileName: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export type RelatorioImportacaoLogInput = {
  modulo: string;
  mensagem?: string;
  ficheiroOrigem?: string;
  criados: number;
  atualizados: number;
  ignorados: number;
  detalhes: string[];
  extraLinhas?: string[];
};

/** Monta log legivel (UTF-8) para auditoria apos importacao. */
export function montarLogRelatorioImportacao(input: RelatorioImportacaoLogInput): string {
  const linhas: string[] = [
    `I.S.O PRO — Relatorio de importacao (${input.modulo})`,
    `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
  ];
  if (input.ficheiroOrigem?.trim()) {
    linhas.push(`Ficheiro: ${input.ficheiroOrigem.trim()}`);
  }
  if (input.mensagem?.trim()) {
    linhas.push('', input.mensagem.trim());
  }
  linhas.push(
    '',
    `Criados: ${input.criados}`,
    `Atualizados: ${input.atualizados}`,
    `Ignorados: ${input.ignorados}`,
  );
  if (input.extraLinhas?.length) {
    linhas.push(...input.extraLinhas);
  }
  if (input.detalhes.length) {
    linhas.push('', `Detalhes (${input.detalhes.length}):`, ...input.detalhes);
  } else {
    linhas.push('', 'Detalhes: (nenhum)');
  }
  return `${linhas.join('\n')}\n`;
}

export function nomeArquivoLogImportacao(moduloSlug: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `iso-pro-importacao-${moduloSlug}-${stamp}.txt`;
}

export function descarregarLogRelatorioImportacao(input: RelatorioImportacaoLogInput, moduloSlug: string): void {
  downloadTextFile(nomeArquivoLogImportacao(moduloSlug), montarLogRelatorioImportacao(input));
}
