import { getScopedIsoProStorageKey } from '../../../lib/isoProAmbiente';
import { formatDecimalExcelPtBr } from '../../../lib/csv';
import {
  configEmailEstoquePronta,
  enviarEmailDesktop,
  isDesktopMailDisponivel,
  montarSmtpDeConfig,
  parseDestinatariosEmail,
} from '../../../lib/desktopMail';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import type { MaterialEstoqueCritico } from './materiaisEstoqueCritico.service';
import { listarMateriaisCriticosEstoque } from './materiaisEstoqueCritico.service';

type AlertaEstoqueEmailState = {
  lastNotifiedCriticalIds: string[];
  lastSentAt: string;
};

function stateStorageKey(): string {
  return getScopedIsoProStorageKey('iso-pro-alerta-estoque-email-state-v1');
}

export function readAlertaEstoqueEmailState(): AlertaEstoqueEmailState {
  if (typeof localStorage === 'undefined') {
    return { lastNotifiedCriticalIds: [], lastSentAt: '' };
  }
  try {
    const raw = localStorage.getItem(stateStorageKey());
    if (!raw) return { lastNotifiedCriticalIds: [], lastSentAt: '' };
    const parsed = JSON.parse(raw) as Partial<AlertaEstoqueEmailState>;
    return {
      lastNotifiedCriticalIds: Array.isArray(parsed.lastNotifiedCriticalIds)
        ? parsed.lastNotifiedCriticalIds.map(String)
        : [],
      lastSentAt: String(parsed.lastSentAt ?? ''),
    };
  } catch {
    return { lastNotifiedCriticalIds: [], lastSentAt: '' };
  }
}

export function writeAlertaEstoqueEmailState(state: AlertaEstoqueEmailState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(stateStorageKey(), JSON.stringify(state));
}

export function deveEnviarAlertaEstoqueEmail(
  criticosAtuais: MaterialEstoqueCritico[],
  state: AlertaEstoqueEmailState,
): boolean {
  const idsAtuais = criticosAtuais
    .filter((item) => item.severidade === 'critical')
    .map((item) => item.materialId)
    .sort();
  if (idsAtuais.length === 0) {
    return false;
  }
  const idsAnteriores = [...state.lastNotifiedCriticalIds].sort();
  if (idsAtuais.length === idsAnteriores.length && idsAtuais.every((id, i) => id === idsAnteriores[i])) {
    return false;
  }
  return true;
}

export function montarAssuntoAlertaEstoqueCritico(qtd: number, projeto: string): string {
  const ctx = projeto.trim() ? ` — ${projeto.trim()}` : '';
  return `[I.S.O PRO] ${qtd} material(is) critico(s) de estoque${ctx}`;
}

export function montarCorpoTextoAlertaEstoqueCritico(
  itens: MaterialEstoqueCritico[],
  contexto: { cliente: string; projeto: string },
): string {
  const linhas = itens.map(
    (item) =>
      `- ${item.codigo} | ${item.descricao} | saldo ${formatDecimalExcelPtBr(item.saldoAtual)} ${item.unidade} | planejado ${formatDecimalExcelPtBr(item.quantidadePlanejada)} | limite ${formatDecimalExcelPtBr(item.limiteAlerta)} (${item.percentualAlerta}%)`,
  );
  const cabecalho = [
    'Alerta de estoque critico — I.S.O PRO',
    contexto.cliente.trim() ? `Cliente: ${contexto.cliente.trim()}` : '',
    contexto.projeto.trim() ? `Obra/projeto: ${contexto.projeto.trim()}` : '',
    '',
    `${itens.length} material(is) com gravidade CRITICA (saldo zero ou muito abaixo do limite sobre o planejamento):`,
    '',
    ...linhas,
    '',
    'Abra Materiais → Estoque critico no sistema para detalhes.',
  ].filter(Boolean);
  return cabecalho.join('\n');
}

export function montarCorpoHtmlAlertaEstoqueCritico(
  itens: MaterialEstoqueCritico[],
  contexto: { cliente: string; projeto: string },
): string {
  const rows = itens
    .map(
      (item) =>
        `<tr><td><strong>${escapeHtml(item.codigo)}</strong></td><td>${escapeHtml(item.descricao)}</td><td>${formatDecimalExcelPtBr(item.saldoAtual)} ${escapeHtml(item.unidade)}</td><td>${formatDecimalExcelPtBr(item.quantidadePlanejada)}</td><td>${formatDecimalExcelPtBr(item.limiteAlerta)} (${item.percentualAlerta}%)</td></tr>`,
    )
    .join('');
  const ctx =
    contexto.cliente.trim() || contexto.projeto.trim()
      ? `<p>${contexto.cliente.trim() ? `Cliente: <strong>${escapeHtml(contexto.cliente.trim())}</strong><br/>` : ''}${contexto.projeto.trim() ? `Obra/projeto: <strong>${escapeHtml(contexto.projeto.trim())}</strong>` : ''}</p>`
      : '';
  return `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Segoe UI,Arial,sans-serif;color:#1e293b">
<h2 style="color:#b45309">Estoque critico — I.S.O PRO</h2>
${ctx}
<p>${itens.length} material(is) com gravidade <strong>CRITICA</strong> (saldo zero ou muito abaixo do limite sobre o planejamento).</p>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px">
<thead><tr style="background:#fef3c7"><th>Codigo</th><th>Descricao</th><th>Saldo</th><th>Planejado</th><th>Limite</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p style="margin-top:16px;font-size:13px;color:#64748b">Abra <strong>Materiais → Estoque critico</strong> no sistema para acompanhar.</p>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function processarAlertaEstoqueEmailAutomatico(): Promise<void> {
  if (!isDesktopMailDisponivel()) return;

  const config = readConfiguracoes();
  if (!configEmailEstoquePronta(config)) return;

  const todos = await listarMateriaisCriticosEstoque();
  const criticos = todos.filter((item) => item.severidade === 'critical');
  const state = readAlertaEstoqueEmailState();

  if (criticos.length === 0) {
    if (state.lastNotifiedCriticalIds.length > 0) {
      writeAlertaEstoqueEmailState({ lastNotifiedCriticalIds: [], lastSentAt: state.lastSentAt });
    }
    return;
  }

  if (!deveEnviarAlertaEstoqueEmail(criticos, state)) return;

  const smtp = montarSmtpDeConfig(config);
  const destinatarios = parseDestinatariosEmail(config.alertaEstoqueEmailDestinatarios);
  const contexto = { cliente: config.cliente, projeto: config.projeto };
  const payload = {
    smtp: {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      user: smtp.user,
      pass: smtp.pass,
    },
    from: smtp.from,
    to: destinatarios,
    subject: montarAssuntoAlertaEstoqueCritico(criticos.length, config.projeto),
    text: montarCorpoTextoAlertaEstoqueCritico(criticos, contexto),
    html: montarCorpoHtmlAlertaEstoqueCritico(criticos, contexto),
  };

  const result = await enviarEmailDesktop(payload);
  if (!result.ok) return;

  writeAlertaEstoqueEmailState({
    lastNotifiedCriticalIds: criticos.map((item) => item.materialId),
    lastSentAt: new Date().toISOString(),
  });
}
