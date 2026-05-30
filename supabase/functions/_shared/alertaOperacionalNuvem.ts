/** Logica partilhada na Edge Function — espelha desktop (conferencia, RIR, RNC, inventario). */

export type SnapshotPayload = {
  recebimentos?: Array<Record<string, unknown>>;
  rirRegistros?: Array<Record<string, unknown>>;
  rncRegistros?: Array<Record<string, unknown>>;
  inventarios?: Array<Record<string, unknown>>;
  configuracoesSistema?: Record<string, unknown>;
};

export type ConfigAlertaOperacional = {
  alertaOperacionalEmailHabilitado?: boolean;
  alertaOperacionalEmailDestinatarios?: string;
  alertaOperacionalConferenciaHabilitado?: boolean;
  alertaOperacionalConferenciaPrazoDias?: number;
  alertaOperacionalRirHabilitado?: boolean;
  alertaOperacionalRirPrazoDias?: number;
  alertaOperacionalRncHabilitado?: boolean;
  alertaOperacionalRncPrazoDias?: number;
  alertaOperacionalInventarioHabilitado?: boolean;
  alertaOperacionalInventarioPrazoDias?: number;
  alertaOperacionalIntervaloMinimoHoras?: number;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUsuario?: string;
  smtpSenha?: string;
  smtpRemetente?: string;
  cliente?: string;
  projeto?: string;
  alertaOperacionalEmailState?: { lastNotifiedFingerprint?: string; lastSentAt?: string };
};

export function parseDestinatarios(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter((p) => p.includes('@'));
}

export function parseDataIsoFlexivel(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(`${s.slice(0, 10)}T12:00:00`);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const br = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12, 0, 0);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function diasCorridosDesde(dataIso: string, ref: Date = new Date()): number {
  const inicio = parseDataIsoFlexivel(dataIso);
  if (!inicio) return 0;
  const refMeio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 12, 0, 0);
  const inicioMeio = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 12, 0, 0);
  return Math.max(0, Math.floor((refMeio.getTime() - inicioMeio.getTime()) / 86_400_000));
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function planoAcaoVencido(rnc: Record<string, unknown>, ref: Date): boolean {
  const linhas = Array.isArray(rnc.planoAcaoLinhas) ? rnc.planoAcaoLinhas : [];
  for (const raw of linhas) {
    if (!raw || typeof raw !== 'object') continue;
    const linha = raw as Record<string, unknown>;
    const acao = str(linha.acao);
    const prazo = str(linha.prazo);
    if (!acao || !prazo) continue;
    const prazoDate = parseDataIsoFlexivel(prazo);
    if (!prazoDate) continue;
    const refMeio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 12, 0, 0);
    const prazoMeio = new Date(prazoDate.getFullYear(), prazoDate.getMonth(), prazoDate.getDate(), 12, 0, 0);
    if (refMeio.getTime() > prazoMeio.getTime()) return true;
  }
  return false;
}

export type AlertaOperacionalRelatorioNuvem = {
  conferencias: Array<{ id: string; notaFiscal: string; fornecedor: string; dias: number; status: string }>;
  rir: Array<{ id: string; codigo: string; laudo: string; status: string; dias: number; nf: string }>;
  rnc: Array<{ id: string; codigo: string; status: string; dias: number; motivo: string }>;
  inventarios: Array<{ id: string; codigo: string; descricao: string; dias: number }>;
};

export function montarRelatorioOperacionalNuvem(
  payload: SnapshotPayload,
  cfg: ConfigAlertaOperacional,
  ref: Date = new Date(),
): AlertaOperacionalRelatorioNuvem {
  const rel: AlertaOperacionalRelatorioNuvem = {
    conferencias: [],
    rir: [],
    rnc: [],
    inventarios: [],
  };

  if (cfg.alertaOperacionalConferenciaHabilitado !== false) {
    const prazo = Math.max(1, cfg.alertaOperacionalConferenciaPrazoDias ?? 2);
    for (const raw of payload.recebimentos ?? []) {
      const r = raw as Record<string, unknown>;
      const status = str(r.status).toLowerCase();
      const modo = str(r.modoRecebimento ?? r.modo_recebimento).toLowerCase();
      if (modo !== 'aguardando_conferencia') continue;
      if (!['aguardando_conferencia', 'parcialmente_conferido', 'divergente'].includes(status)) continue;
      const data = str(r.dataRecebimento ?? r.data_recebimento);
      const dias = diasCorridosDesde(data, ref);
      if (dias < prazo) continue;
      rel.conferencias.push({
        id: str(r.id),
        notaFiscal: str(r.notaFiscal ?? r.nota_fiscal),
        fornecedor: str(r.fornecedor),
        dias,
        status,
      });
    }
    rel.conferencias.sort((a, b) => b.dias - a.dias);
  }

  if (cfg.alertaOperacionalRirHabilitado !== false) {
    const prazo = Math.max(1, cfg.alertaOperacionalRirPrazoDias ?? 5);
    for (const raw of payload.rirRegistros ?? []) {
      const r = raw as Record<string, unknown>;
      const status = str(r.status).toLowerCase();
      if (status !== 'aberto' && status !== 'em_analise') continue;
      const dias = diasCorridosDesde(str(r.dataRegistro ?? r.data_registro), ref);
      if (dias < prazo) continue;
      rel.rir.push({
        id: str(r.id),
        codigo: str(r.codigo),
        laudo: str(r.laudo),
        status,
        dias,
        nf: str(r.recebimentoNotaFiscal ?? r.recebimento_nota_fiscal),
      });
    }
    rel.rir.sort((a, b) => {
      const prio = (l: string) => (l === 'reprovado' ? 0 : l === 'observacoes' ? 1 : 2);
      return prio(a.laudo) - prio(b.laudo) || b.dias - a.dias;
    });
  }

  if (cfg.alertaOperacionalRncHabilitado !== false) {
    const prazo = Math.max(1, cfg.alertaOperacionalRncPrazoDias ?? 7);
    for (const raw of payload.rncRegistros ?? []) {
      const r = raw as Record<string, unknown>;
      const status = str(r.status).toLowerCase();
      if (status !== 'aberto' && status !== 'em_tratativa') continue;
      const dias = diasCorridosDesde(str(r.dataRegistro ?? r.data_registro), ref);
      const planoVencido = planoAcaoVencido(r, ref);
      if (dias < prazo && !planoVencido) continue;
      rel.rnc.push({
        id: str(r.id),
        codigo: str(r.codigo),
        status,
        dias,
        motivo: planoVencido && dias < prazo ? 'plano_acao_vencido' : 'prazo_abertura',
      });
    }
    rel.rnc.sort((a, b) => {
      const prio = (m: string) => (m === 'plano_acao_vencido' ? 0 : 1);
      return prio(a.motivo) - prio(b.motivo) || b.dias - a.dias;
    });
    const prazo = Math.max(1, cfg.alertaOperacionalInventarioPrazoDias ?? 7);
    for (const raw of payload.inventarios ?? []) {
      const i = raw as Record<string, unknown>;
      if (str(i.status).toLowerCase() !== 'aberto') continue;
      const dias = diasCorridosDesde(str(i.dataInventario ?? i.data_inventario), ref);
      if (dias < prazo) continue;
      rel.inventarios.push({
        id: str(i.id),
        codigo: str(i.codigo),
        descricao: str(i.descricao),
        dias,
      });
    }
    rel.inventarios.sort((a, b) => b.dias - a.dias);
  }

  return rel;
}

export function totalRelatorioNuvem(rel: AlertaOperacionalRelatorioNuvem): number {
  return rel.conferencias.length + rel.rir.length + rel.rnc.length + rel.inventarios.length;
}

export function montarFingerprintNuvem(rel: AlertaOperacionalRelatorioNuvem): string {
  const partes = [
    ...rel.conferencias.map((i) => `c:${i.id}`),
    ...rel.rir.map((i) => `r:${i.id}`),
    ...rel.rnc.map((i) => `n:${i.id}:${i.motivo}`),
    ...rel.inventarios.map((i) => `i:${i.id}`),
  ];
  return partes.sort().join('|');
}

export function deveEnviarOperacionalNuvem(
  fingerprint: string,
  state: { lastNotifiedFingerprint?: string; lastSentAt?: string },
  intervaloHoras: number,
  temItens: boolean,
  forcar: boolean,
  ref: Date = new Date(),
): boolean {
  if (forcar) return temItens;
  if (!temItens || !fingerprint) return false;
  const lastFp = str(state.lastNotifiedFingerprint);
  if (fingerprint !== lastFp) return true;
  const lastSent = str(state.lastSentAt);
  if (!lastSent) return true;
  const last = new Date(lastSent).getTime();
  if (!Number.isFinite(last)) return true;
  return ref.getTime() - last >= Math.max(1, intervaloHoras) * 3_600_000;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function montarAssuntoOperacionalNuvem(total: number, projeto: string): string {
  const ctx = projeto.trim() ? ` — ${projeto.trim()}` : '';
  return `[I.S.O PRO] ${total} pendencia(s) operacional(is)${ctx}`;
}

export function montarTextoOperacionalNuvem(
  rel: AlertaOperacionalRelatorioNuvem,
  ctx: { cliente: string; projeto: string },
): string {
  const linhas = ['Alerta operacional — I.S.O PRO', ctx.cliente ? `Cliente: ${ctx.cliente}` : '', ctx.projeto ? `Obra: ${ctx.projeto}` : '', ''].filter(Boolean);
  if (rel.conferencias.length) {
    linhas.push(`Conferencia (${rel.conferencias.length}):`);
    for (const c of rel.conferencias) linhas.push(`- NF ${c.notaFiscal || '—'} | ${c.fornecedor} | ${c.dias} dia(s)`);
    linhas.push('');
  }
  if (rel.rir.length) {
    linhas.push(`RIR (${rel.rir.length}):`);
    for (const r of rel.rir) linhas.push(`- ${r.codigo} | ${r.laudo} | ${r.dias} dia(s)`);
    linhas.push('');
  }
  if (rel.rnc.length) {
    linhas.push(`RNC (${rel.rnc.length}):`);
    for (const r of rel.rnc) linhas.push(`- ${r.codigo} | ${r.dias} dia(s) | ${r.motivo}`);
    linhas.push('');
  }
  if (rel.inventarios.length) {
    linhas.push(`Inventarios (${rel.inventarios.length}):`);
    for (const i of rel.inventarios) linhas.push(`- ${i.codigo} | ${i.dias} dia(s)`);
  }
  return linhas.join('\n');
}

export function montarHtmlOperacionalNuvem(
  rel: AlertaOperacionalRelatorioNuvem,
  ctx: { cliente: string; projeto: string },
): string {
  const secoes: string[] = [];
  if (rel.conferencias.length) {
    const rows = rel.conferencias
      .map((c) => `<tr><td>${escapeHtml(c.notaFiscal)}</td><td>${escapeHtml(c.fornecedor)}</td><td>${c.dias}</td></tr>`)
      .join('');
    secoes.push(`<h3>Conferencia (${rel.conferencias.length})</h3><table border="1" cellpadding="6"><tr><th>NF</th><th>Fornecedor</th><th>Dias</th></tr>${rows}</table>`);
  }
  if (rel.rir.length) {
    const rows = rel.rir.map((r) => `<tr><td>${escapeHtml(r.codigo)}</td><td>${escapeHtml(r.laudo)}</td><td>${r.dias}</td></tr>`).join('');
    secoes.push(`<h3>RIR (${rel.rir.length})</h3><table border="1" cellpadding="6"><tr><th>Codigo</th><th>Laudo</th><th>Dias</th></tr>${rows}</table>`);
  }
  if (rel.rnc.length) {
    const rows = rel.rnc.map((r) => `<tr><td>${escapeHtml(r.codigo)}</td><td>${r.dias}</td><td>${escapeHtml(r.motivo)}</td></tr>`).join('');
    secoes.push(`<h3>RNC (${rel.rnc.length})</h3><table border="1" cellpadding="6"><tr><th>Codigo</th><th>Dias</th><th>Motivo</th></tr>${rows}</table>`);
  }
  if (rel.inventarios.length) {
    const rows = rel.inventarios.map((i) => `<tr><td>${escapeHtml(i.codigo)}</td><td>${i.dias}</td></tr>`).join('');
    secoes.push(`<h3>Inventarios (${rel.inventarios.length})</h3><table border="1" cellpadding="6"><tr><th>Codigo</th><th>Dias</th></tr>${rows}</table>`);
  }
  const total = totalRelatorioNuvem(rel);
  return `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Segoe UI,Arial,sans-serif"><h2>Pendencias operacionais — I.S.O PRO</h2><p>${total} registro(s) em atraso.</p>${secoes.join('')}</body></html>`;
}

export function configOperacionalPronta(cfg: ConfigAlertaOperacional): boolean {
  if (!cfg.alertaOperacionalEmailHabilitado) return false;
  if (!str(cfg.smtpHost) || !str(cfg.smtpRemetente)) return false;
  if (parseDestinatarios(cfg.alertaOperacionalEmailDestinatarios ?? '').length === 0) return false;
  return (
    cfg.alertaOperacionalConferenciaHabilitado !== false ||
    cfg.alertaOperacionalRirHabilitado !== false ||
    cfg.alertaOperacionalRncHabilitado !== false ||
    cfg.alertaOperacionalInventarioHabilitado === true
  );
}

export function lerConfigOperacional(raw: unknown): ConfigAlertaOperacional {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const st = o.alertaOperacionalEmailState;
  return {
    alertaOperacionalEmailHabilitado: o.alertaOperacionalEmailHabilitado === true,
    alertaOperacionalEmailDestinatarios: str(o.alertaOperacionalEmailDestinatarios),
    alertaOperacionalConferenciaHabilitado: o.alertaOperacionalConferenciaHabilitado !== false,
    alertaOperacionalConferenciaPrazoDias: Number(o.alertaOperacionalConferenciaPrazoDias) > 0 ? Number(o.alertaOperacionalConferenciaPrazoDias) : 2,
    alertaOperacionalRirHabilitado: o.alertaOperacionalRirHabilitado !== false,
    alertaOperacionalRirPrazoDias: Number(o.alertaOperacionalRirPrazoDias) > 0 ? Number(o.alertaOperacionalRirPrazoDias) : 5,
    alertaOperacionalRncHabilitado: o.alertaOperacionalRncHabilitado !== false,
    alertaOperacionalRncPrazoDias: Number(o.alertaOperacionalRncPrazoDias) > 0 ? Number(o.alertaOperacionalRncPrazoDias) : 7,
    alertaOperacionalInventarioHabilitado: o.alertaOperacionalInventarioHabilitado === true,
    alertaOperacionalInventarioPrazoDias: Number(o.alertaOperacionalInventarioPrazoDias) > 0 ? Number(o.alertaOperacionalInventarioPrazoDias) : 7,
    alertaOperacionalIntervaloMinimoHoras: Number(o.alertaOperacionalIntervaloMinimoHoras) > 0 ? Number(o.alertaOperacionalIntervaloMinimoHoras) : 24,
    smtpHost: str(o.smtpHost),
    smtpPort: Number.isFinite(Number(o.smtpPort)) && Number(o.smtpPort) > 0 ? Number(o.smtpPort) : 587,
    smtpSecure: o.smtpSecure === true,
    smtpUsuario: str(o.smtpUsuario),
    smtpSenha: String(o.smtpSenha ?? ''),
    smtpRemetente: str(o.smtpRemetente),
    cliente: str(o.cliente),
    projeto: str(o.projeto),
    alertaOperacionalEmailState:
      st && typeof st === 'object' && !Array.isArray(st)
        ? {
            lastNotifiedFingerprint: str((st as Record<string, unknown>).lastNotifiedFingerprint),
            lastSentAt: str((st as Record<string, unknown>).lastSentAt),
          }
        : { lastNotifiedFingerprint: '', lastSentAt: '' },
  };
}
