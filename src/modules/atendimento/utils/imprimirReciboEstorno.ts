import { abrirImpressaoHtmlRelatorio, cssInstitucionalRelatorio, escapeHtmlRelatorio, htmlBlocoLogoInstitucional } from '../../../lib/htmlRelatorioInstitucional';
import { resolverUrlLogoInstitucionalParaHtmlImpresso } from '../../../lib/logoInstitucional';
import type { DadosReciboEstorno } from '../types/atendimento.types';

export function montarHtmlReciboEstorno(dados: DadosReciboEstorno): string {
  const at = dados.atendimento;
  const logoUrl = resolverUrlLogoInstitucionalParaHtmlImpresso(dados.logoUrl);
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const dataAtendFmt = (() => {
    try {
      return new Date(at.dataAtendimento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return at.dataAtendimento;
    }
  })();

  const docTitulo = `${escapeHtmlRelatorio(dados.documentoNumero)} Rev. ${escapeHtmlRelatorio(dados.documentoRevisao)}`;

  const linhasHtml = dados.itensEstorno
    .map(
      (it, idx) =>
        `<tr>
          <td>${idx + 1}</td>
          <td>${escapeHtmlRelatorio(it.codigoMaterial)}</td>
          <td>${escapeHtmlRelatorio(it.descricaoMaterial)}</td>
          <td>${escapeHtmlRelatorio(it.unidade)}</td>
          <td class="num">${escapeHtmlRelatorio(String(it.quantidadeAtendida))}</td>
        </tr>`,
    )
    .join('');

  const extraEstorno = `
    .motivo-box { border: 1px solid #333; border-radius: 6px; padding: 12px 14px; margin: 12px 0 16px; background: #fafafa; }
    .motivo-box strong { display: block; margin-bottom: 6px; }
    .assinaturas { margin-top: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; page-break-inside: avoid; }
    .assinatura-box { text-align: center; }
    .linha-ass { border-top: 1px solid #000; margin: 48px 8px 8px; padding-top: 6px; }
    .rotulo-ass { font-weight: 700; font-size: 10pt; }
    .nome-ass { font-size: 10pt; margin-top: 4px; min-height: 1.2em; }
    @media print {
      .assinaturas { margin-top: 28px; }
    }
  `;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Estorno ${escapeHtmlRelatorio(at.numero)}</title>
  <style>
    ${cssInstitucionalRelatorio()}
    ${extraEstorno}
  </style>
</head>
<body>
  <div class="inst-topbar">
    <span>Gerado em: ${escapeHtmlRelatorio(geradoEm)}</span>
    <span>Estorno ${escapeHtmlRelatorio(at.numero)}</span>
  </div>

  <header class="inst-header">
    ${htmlBlocoLogoInstitucional(logoUrl)}
    <div class="inst-title-col">
      <h1>Recibo de estorno de material</h1>
    </div>
  </header>

  <section class="bloco">
    <div class="grid2">
      <p><strong>Documento:</strong> ${docTitulo}</p>
      <p><strong>Responsavel (documento):</strong> ${escapeHtmlRelatorio(dados.documentoResponsavel)}</p>
    </div>
    <p><strong>Descricao do documento:</strong></p>
    <p>${escapeHtmlRelatorio(dados.documentoDescricao)}</p>
  </section>

  <section class="bloco">
    <h2>Atendimento original (referencia)</h2>
    <div class="grid2">
      <p><strong>Lote / atendimento:</strong> ${escapeHtmlRelatorio(at.numero)}</p>
      <p><strong>Data da retirada:</strong> ${escapeHtmlRelatorio(dataAtendFmt)}</p>
      <p><strong>Atendente (retirada):</strong> ${escapeHtmlRelatorio(at.atendente)}</p>
      <p><strong>Recebedor (retirada):</strong> ${escapeHtmlRelatorio(at.recebedor)}${at.recebedorTipo === 'externo' && at.recebedorEmpresa ? ` — ${escapeHtmlRelatorio(at.recebedorEmpresa)}` : ''}</p>
    </div>
  </section>

  <section class="motivo-box">
    <strong>Motivo do estorno</strong>
    <p style="margin:0; white-space: pre-wrap;">${escapeHtmlRelatorio(dados.motivoEstorno)}</p>
  </section>

  <section class="bloco">
    <h2>Registro do estorno</h2>
    <div class="grid2">
      <p><strong>Quem registrou o estorno:</strong> ${escapeHtmlRelatorio(dados.nomeQuemEstorna)}</p>
      <p><strong>Quem devolve o material:</strong> ${escapeHtmlRelatorio(dados.nomeQuemDevolve)}</p>
    </div>
  </section>

  <section class="bloco">
    <h2>Materiais devolvidos (estorno)</h2>
    ${dados.estornoParcial ? `<p class="panel-copy" style="margin:0 0 8px;font-size:10pt;color:#444;">Estorno parcial: apenas os itens abaixo foram devolvidos nesta operacao.</p>` : ''}
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Codigo</th>
          <th>Descricao</th>
          <th>UN</th>
          <th>Quantidade</th>
        </tr>
      </thead>
      <tbody>${linhasHtml}</tbody>
    </table>
  </section>

  <section class="assinaturas">
    <div class="assinatura-box">
      <div class="linha-ass"></div>
      <p class="rotulo-ass">Responsavel pelo estorno (operador)</p>
      <p class="nome-ass">${escapeHtmlRelatorio(dados.nomeQuemEstorna)}</p>
    </div>
    <div class="assinatura-box">
      <div class="linha-ass"></div>
      <p class="rotulo-ass">Quem devolveu o material</p>
      <p class="nome-ass">${escapeHtmlRelatorio(dados.nomeQuemDevolve)}</p>
    </div>
  </section>
</body>
</html>`;
}

export function imprimirReciboEstorno(dados: DadosReciboEstorno): boolean {
  return abrirImpressaoHtmlRelatorio(montarHtmlReciboEstorno(dados));
}
