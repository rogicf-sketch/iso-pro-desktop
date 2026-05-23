/** Logica partilhada na Edge Function — espelha desktop (saldo + planejamento + alerta %). */

export function normalizeCodigo(value: string): string {
  return value.trim().toLowerCase();
}

export type SnapshotPayload = {
  materiais?: Array<Record<string, unknown>>;
  documentos?: Array<Record<string, unknown>>;
  recebimentos?: Array<Record<string, unknown>>;
  estoqueAjustes?: Array<Record<string, unknown>>;
  configuracoesSistema?: Record<string, unknown>;
};

export type MaterialRow = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  estoqueMinimo: number;
  ativo: boolean;
};

export type MaterialCritico = {
  materialId: string;
  codigo: string;
  descricao: string;
  unidade: string;
  saldoAtual: number;
  quantidadePlanejada: number;
  percentualAlerta: number;
  limiteAlerta: number;
  severidade: 'critical' | 'warning';
};

function quantidadeAtendidaLinha(item: Record<string, unknown>): number {
  const v = item.quantidadeAtendida ?? item.quantidade_atendida;
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function modoRecebimento(rec: Record<string, unknown>): string {
  const raw = rec.modoRecebimento ?? rec.modo_recebimento ?? 'direto';
  const t = String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  if (t === 'aguardando_conferencia' || t === 'conferencia' || t === 'aguardando') {
    return 'aguardando_conferencia';
  }
  return 'direto';
}

function statusConferencia(rec: Record<string, unknown>): string | null {
  const s = rec.statusConferencia ?? rec.status_conferencia;
  if (s === undefined || s === null || String(s).trim() === '') return null;
  return String(s).trim().toLowerCase() === 'conferido' ? 'conferido' : 'pendente';
}

function qtdRecebida(item: Record<string, unknown>, modo: string, status: string | null): number {
  if (modo === 'direto') return Number(item.quantidade ?? 0) || 0;
  return status === 'conferido' ? Number(item.quantidadeConferida ?? item.quantidade_conferida ?? 0) || 0 : 0;
}

export function buildSaldoMapNuvem(payload: SnapshotPayload): Map<string, number> {
  const recebimentosMap = new Map<string, number>();
  for (const rawRec of payload.recebimentos ?? []) {
    const rec = rawRec as Record<string, unknown>;
    if (String(rec.status ?? '').toLowerCase() === 'cancelado') continue;
    const modo = modoRecebimento(rec);
    const status = statusConferencia(rec);
    const itens = (Array.isArray(rec.itens) ? rec.itens : []) as Record<string, unknown>[];
    for (const item of itens) {
      const codigo = normalizeCodigo(String(item.codigo ?? item.codigo_material ?? item.codigoMaterial ?? ''));
      if (!codigo) continue;
      recebimentosMap.set(codigo, (recebimentosMap.get(codigo) ?? 0) + qtdRecebida(item, modo, status));
    }
  }

  const atendidoMap = new Map<string, number>();
  for (const doc of payload.documentos ?? []) {
    if (String(doc.status ?? '').toLowerCase() === 'cancelado') continue;
    const itens = (Array.isArray(doc.itens) ? doc.itens : []) as Record<string, unknown>[];
    for (const item of itens) {
      const codigo = normalizeCodigo(String(item.codigo ?? item.codigo_material ?? item.codigoMaterial ?? ''));
      if (!codigo) continue;
      atendidoMap.set(codigo, (atendidoMap.get(codigo) ?? 0) + quantidadeAtendidaLinha(item));
    }
  }

  const ajustesMap = new Map<string, number>();
  for (const ajuste of payload.estoqueAjustes ?? []) {
    const codigo = normalizeCodigo(String(ajuste.codigo ?? ''));
    if (!codigo) continue;
    ajustesMap.set(codigo, (ajustesMap.get(codigo) ?? 0) + Number(ajuste.delta ?? 0));
  }

  const explicit = new Map<string, number>();
  for (const material of payload.materiais ?? []) {
    const codigo = normalizeCodigo(String(material.codigo ?? ''));
    if (!codigo) continue;
    const rawSaldo = material.saldoAtual;
    if (rawSaldo !== undefined && rawSaldo !== null && String(rawSaldo).trim() !== '' && !Number.isNaN(Number(rawSaldo))) {
      explicit.set(codigo, Math.max(0, Number(rawSaldo)));
    }
  }

  const todos = new Set<string>([
    ...recebimentosMap.keys(),
    ...atendidoMap.keys(),
    ...ajustesMap.keys(),
    ...explicit.keys(),
  ]);

  const saldoMap = new Map<string, number>();
  for (const codigo of todos) {
    const calculado = Math.max(
      0,
      (recebimentosMap.get(codigo) ?? 0) - (atendidoMap.get(codigo) ?? 0) + (ajustesMap.get(codigo) ?? 0),
    );
    const exp = explicit.get(codigo);
    saldoMap.set(codigo, exp !== undefined ? Math.max(exp, calculado) : calculado);
  }
  return saldoMap;
}

export function montarPlanejadoPorCodigo(payload: SnapshotPayload): Map<string, number> {
  const map = new Map<string, number>();
  for (const doc of payload.documentos ?? []) {
    if (String(doc.status ?? '').toLowerCase() === 'cancelado') continue;
    const itens = (Array.isArray(doc.itens) ? doc.itens : []) as Record<string, unknown>[];
    for (const item of itens) {
      const codigo = normalizeCodigo(String(item.codigo ?? item.codigo_material ?? item.codigoMaterial ?? ''));
      if (!codigo) continue;
      const qtd = Number(item.quantidade ?? item.quantidadeProjeto ?? item.quantidade_projeto ?? 0) || 0;
      map.set(codigo, (map.get(codigo) ?? 0) + qtd);
    }
  }
  return map;
}

function normalizarPercentual(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(100, Math.max(0, value));
}

function calcularLimite(planejado: number, pct: number): number {
  if (!(pct > 0 && planejado > 0)) return 0;
  return (planejado * pct) / 100;
}

function severidade(saldo: number, limite: number): 'critical' | 'warning' {
  if (saldo <= 0) return 'critical';
  if (limite > 0 && saldo <= limite * 0.5) return 'critical';
  return 'warning';
}

export function listarMateriaisCriticosNuvem(
  materiais: MaterialRow[],
  payload: SnapshotPayload,
): MaterialCritico[] {
  const saldoMap = buildSaldoMapNuvem(payload);
  const planejadoMap = montarPlanejadoPorCodigo(payload);
  const criticos: MaterialCritico[] = [];

  for (const m of materiais) {
    if (!m.ativo) continue;
    const pct = normalizarPercentual(m.estoqueMinimo);
    if (pct <= 0) continue;
    const codigoKey = normalizeCodigo(m.codigo);
    const planejado = planejadoMap.get(codigoKey) ?? 0;
    if (planejado <= 0) continue;
    const saldo = saldoMap.get(codigoKey) ?? 0;
    const limite = calcularLimite(planejado, pct);
    if (limite <= 0 || saldo > limite) continue;
    criticos.push({
      materialId: m.id,
      codigo: m.codigo,
      descricao: m.descricao,
      unidade: m.unidade,
      saldoAtual: saldo,
      quantidadePlanejada: planejado,
      percentualAlerta: pct,
      limiteAlerta: limite,
      severidade: severidade(saldo, limite),
    });
  }

  return criticos.sort((a, b) => {
    if (a.severidade !== b.severidade) return a.severidade === 'critical' ? -1 : 1;
    return a.saldoAtual - b.saldoAtual;
  });
}

export function parseDestinatarios(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter((p) => p.includes('@'));
}

export function deveEnviarEmail(
  criticosIds: string[],
  stateIds: string[],
  forcar: boolean,
): boolean {
  if (forcar) return criticosIds.length > 0;
  if (criticosIds.length === 0) return false;
  const a = [...criticosIds].sort();
  const b = [...stateIds].sort();
  if (a.length === b.length && a.every((id, i) => id === b[i])) return false;
  return true;
}

export function montarAssunto(qtd: number, projeto: string): string {
  const ctx = projeto.trim() ? ` — ${projeto.trim()}` : '';
  return `[I.S.O PRO] ${qtd} material(is) critico(s) de estoque${ctx}`;
}

export function montarTexto(
  itens: MaterialCritico[],
  contexto: { cliente: string; projeto: string },
): string {
  const linhas = itens.map(
    (i) =>
      `- ${i.codigo} | ${i.descricao} | saldo ${i.saldoAtual} ${i.unidade} | planejado ${i.quantidadePlanejada} | limite ${i.limiteAlerta} (${i.percentualAlerta}%)`,
  );
  return [
    'Alerta de estoque critico — I.S.O PRO (nuvem)',
    contexto.cliente ? `Cliente: ${contexto.cliente}` : '',
    contexto.projeto ? `Obra/projeto: ${contexto.projeto}` : '',
    '',
    `${itens.length} material(is) CRITICO(S):`,
    '',
    ...linhas,
  ]
    .filter(Boolean)
    .join('\n');
}

export function montarHtml(itens: MaterialCritico[], contexto: { cliente: string; projeto: string }): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rows = itens
    .map(
      (i) =>
        `<tr><td><strong>${esc(i.codigo)}</strong></td><td>${esc(i.descricao)}</td><td>${i.saldoAtual} ${esc(i.unidade)}</td><td>${i.quantidadePlanejada}</td><td>${i.limiteAlerta} (${i.percentualAlerta}%)</td></tr>`,
    )
    .join('');
  return `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Segoe UI,Arial,sans-serif">
<h2 style="color:#b45309">Estoque critico — I.S.O PRO</h2>
<p>${contexto.cliente ? `Cliente: <strong>${esc(contexto.cliente)}</strong><br/>` : ''}${contexto.projeto ? `Obra: <strong>${esc(contexto.projeto)}</strong>` : ''}</p>
<p>${itens.length} material(is) com gravidade <strong>CRITICA</strong>.</p>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse"><thead><tr style="background:#fef3c7"><th>Codigo</th><th>Descricao</th><th>Saldo</th><th>Planejado</th><th>Limite</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}
