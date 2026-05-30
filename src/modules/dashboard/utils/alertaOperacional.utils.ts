import type { InventarioListItem } from '../../inventario/types/inventario.types';
import type { RecebimentoListItem } from '../../recebimentos/types/recebimento.types';
import type { RirRegistro, RncRegistro } from '../../qualidade/types/qualidade.types';
import { listarRirReprovadosSemRnc, type RirReprovadoSemRncItem } from './pendenciasOperacionais.utils';

export type AlertaOperacionalParametros = {
  conferenciaHabilitado: boolean;
  conferenciaPrazoDias: number;
  rirHabilitado: boolean;
  rirPrazoDias: number;
  rncHabilitado: boolean;
  rncPrazoDias: number;
  inventarioHabilitado: boolean;
  inventarioPrazoDias: number;
  intervaloMinimoHoras: number;
};

export type ConferenciaAtrasoItem = {
  id: string;
  fornecedor: string;
  notaFiscal: string;
  romaneio: string;
  dataRecebimento: string;
  status: RecebimentoListItem['status'];
  diasEmAberto: number;
};

export type RirAtrasoItem = {
  id: string;
  codigo: string;
  dataRegistro: string;
  status: RirRegistro['status'];
  laudo: RirRegistro['laudo'];
  recebimentoNotaFiscal: string;
  responsavel: string;
  diasEmAberto: number;
};

export type RncAtrasoItem = {
  id: string;
  codigo: string;
  dataRegistro: string;
  status: RncRegistro['status'];
  recebimentoNotaFiscal: string;
  responsavel: string;
  diasEmAberto: number;
  motivo: 'prazo_abertura' | 'plano_acao_vencido';
};

export type InventarioAtrasoItem = {
  id: string;
  codigo: string;
  descricao: string;
  responsavel: string;
  dataInventario: string;
  diasEmAberto: number;
};

export type AlertaOperacionalRelatorio = {
  conferencias: ConferenciaAtrasoItem[];
  rir: RirAtrasoItem[];
  rnc: RncAtrasoItem[];
  inventarios: InventarioAtrasoItem[];
  rirReprovadoSemRnc: RirReprovadoSemRncItem[];
};

export type AlertaOperacionalEmailState = {
  lastNotifiedFingerprint: string;
  lastSentAt: string;
};

const STATUS_CONFERENCIA_PENDENTE: RecebimentoListItem['status'][] = [
  'aguardando_conferencia',
  'parcialmente_conferido',
  'divergente',
];

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
  const diff = refMeio.getTime() - inicioMeio.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function listarConferenciasEmAtraso(
  recebimentos: RecebimentoListItem[],
  prazoDias: number,
  ref: Date = new Date(),
): ConferenciaAtrasoItem[] {
  return recebimentos
    .filter(
      (r) =>
        r.modoRecebimento === 'aguardando_conferencia' &&
        STATUS_CONFERENCIA_PENDENTE.includes(r.status) &&
        r.status !== 'cancelado',
    )
    .map((r) => ({
      id: r.id,
      fornecedor: r.fornecedor.trim(),
      notaFiscal: r.notaFiscal.trim(),
      romaneio: r.romaneio.trim(),
      dataRecebimento: r.dataRecebimento,
      status: r.status,
      diasEmAberto: diasCorridosDesde(r.dataRecebimento, ref),
    }))
    .filter((r) => r.diasEmAberto >= prazoDias)
    .sort((a, b) => b.diasEmAberto - a.diasEmAberto);
}

export function listarRirEmAtraso(rir: RirRegistro[], prazoDias: number, ref: Date = new Date()): RirAtrasoItem[] {
  return rir
    .filter((r) => r.status === 'aberto' || r.status === 'em_analise')
    .map((r) => ({
      id: r.id,
      codigo: r.codigo.trim(),
      dataRegistro: r.dataRegistro,
      status: r.status,
      laudo: r.laudo,
      recebimentoNotaFiscal: (r.recebimentoNotaFiscal ?? '').trim(),
      responsavel: r.responsavel.trim(),
      diasEmAberto: diasCorridosDesde(r.dataRegistro, ref),
    }))
    .filter((r) => r.diasEmAberto >= prazoDias)
    .sort((a, b) => {
      const prio = (x: RirAtrasoItem) => (x.laudo === 'reprovado' ? 0 : x.laudo === 'observacoes' ? 1 : 2);
      const pd = prio(a) - prio(b);
      if (pd !== 0) return pd;
      return b.diasEmAberto - a.diasEmAberto;
    });
}

function planoAcaoVencido(rnc: RncRegistro, ref: Date): boolean {
  for (const linha of rnc.planoAcaoLinhas ?? []) {
    const acao = linha.acao.trim();
    const prazo = linha.prazo.trim();
    if (!acao || !prazo) continue;
    const prazoDate = parseDataIsoFlexivel(prazo);
    if (!prazoDate) continue;
    const refMeio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 12, 0, 0);
    const prazoMeio = new Date(prazoDate.getFullYear(), prazoDate.getMonth(), prazoDate.getDate(), 12, 0, 0);
    if (refMeio.getTime() > prazoMeio.getTime()) return true;
  }
  return false;
}

export function listarRncEmAtraso(rnc: RncRegistro[], prazoDias: number, ref: Date = new Date()): RncAtrasoItem[] {
  return rnc
    .filter((r) => r.status === 'aberto' || r.status === 'em_tratativa')
    .map((r) => {
      const diasEmAberto = diasCorridosDesde(r.dataRegistro, ref);
      const planoVencido = planoAcaoVencido(r, ref);
      const motivo: RncAtrasoItem['motivo'] =
        planoVencido && diasEmAberto < prazoDias ? 'plano_acao_vencido' : 'prazo_abertura';
      return {
        id: r.id,
        codigo: r.codigo.trim(),
        dataRegistro: r.dataRegistro,
        status: r.status,
        recebimentoNotaFiscal: (r.recebimentoNotaFiscal ?? '').trim(),
        responsavel: r.responsavel.trim(),
        diasEmAberto,
        motivo,
      };
    })
    .filter((r) => r.diasEmAberto >= prazoDias || r.motivo === 'plano_acao_vencido')
    .sort((a, b) => {
      const prio = (x: RncAtrasoItem) => (x.motivo === 'plano_acao_vencido' ? 0 : 1);
      const pd = prio(a) - prio(b);
      if (pd !== 0) return pd;
      return b.diasEmAberto - a.diasEmAberto;
    });
}

export function listarInventariosEmAtraso(
  inventarios: InventarioListItem[],
  prazoDias: number,
  ref: Date = new Date(),
): InventarioAtrasoItem[] {
  return inventarios
    .filter((i) => i.status === 'aberto')
    .map((i) => ({
      id: i.id,
      codigo: i.codigo.trim(),
      descricao: i.descricao.trim(),
      responsavel: i.responsavel.trim(),
      dataInventario: i.dataInventario,
      diasEmAberto: diasCorridosDesde(i.dataInventario, ref),
    }))
    .filter((i) => i.diasEmAberto >= prazoDias)
    .sort((a, b) => b.diasEmAberto - a.diasEmAberto);
}

export function montarAlertaOperacionalRelatorio(input: {
  recebimentos: RecebimentoListItem[];
  rir: RirRegistro[];
  rnc: RncRegistro[];
  inventarios: InventarioListItem[];
  params: AlertaOperacionalParametros;
  ref?: Date;
}): AlertaOperacionalRelatorio {
  const ref = input.ref ?? new Date();
  const p = input.params;
  return {
    conferencias: p.conferenciaHabilitado
      ? listarConferenciasEmAtraso(input.recebimentos, Math.max(1, p.conferenciaPrazoDias), ref)
      : [],
    rir: p.rirHabilitado ? listarRirEmAtraso(input.rir, Math.max(1, p.rirPrazoDias), ref) : [],
    rnc: p.rncHabilitado ? listarRncEmAtraso(input.rnc, Math.max(1, p.rncPrazoDias), ref) : [],
    inventarios: p.inventarioHabilitado
      ? listarInventariosEmAtraso(input.inventarios, Math.max(1, p.inventarioPrazoDias), ref)
      : [],
    rirReprovadoSemRnc:
      p.rirHabilitado || p.rncHabilitado
        ? listarRirReprovadosSemRnc(input.rir, input.rnc, ref)
        : [],
  };
}

export function totalItensAlertaOperacional(relatorio: AlertaOperacionalRelatorio): number {
  return (
    relatorio.conferencias.length +
    relatorio.rir.length +
    relatorio.rnc.length +
    relatorio.inventarios.length +
    relatorio.rirReprovadoSemRnc.length
  );
}

export function montarFingerprintAlertaOperacional(relatorio: AlertaOperacionalRelatorio): string {
  const partes = [
    ...relatorio.conferencias.map((i) => `c:${i.id}`),
    ...relatorio.rir.map((i) => `r:${i.id}`),
    ...relatorio.rnc.map((i) => `n:${i.id}:${i.motivo}`),
    ...relatorio.inventarios.map((i) => `i:${i.id}`),
    ...relatorio.rirReprovadoSemRnc.map((i) => `rs:${i.id}`),
  ];
  return partes.sort().join('|');
}

export function deveEnviarAlertaOperacional(
  fingerprint: string,
  state: AlertaOperacionalEmailState,
  intervaloMinimoHoras: number,
  temItens: boolean,
  ref: Date = new Date(),
): boolean {
  if (!temItens) return false;
  if (!fingerprint) return false;
  if (fingerprint !== state.lastNotifiedFingerprint) return true;
  if (!state.lastSentAt) return true;
  const last = new Date(state.lastSentAt).getTime();
  if (!Number.isFinite(last)) return true;
  const intervaloMs = Math.max(1, intervaloMinimoHoras) * 3_600_000;
  return ref.getTime() - last >= intervaloMs;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusConferenciaLabel(s: RecebimentoListItem['status']): string {
  const m: Record<string, string> = {
    aguardando_conferencia: 'Aguardando conferencia',
    parcialmente_conferido: 'Parcialmente conferido',
    divergente: 'Divergente',
  };
  return m[s] ?? s;
}

function statusRirLabel(s: RirRegistro['status']): string {
  const m: Record<RirRegistro['status'], string> = {
    aberto: 'Aberto',
    em_analise: 'Em analise',
    tratado: 'Tratado',
    cancelado: 'Cancelado',
  };
  return m[s];
}

function statusRncLabel(s: RncRegistro['status']): string {
  const m: Record<RncRegistro['status'], string> = {
    aberto: 'Aberto',
    em_tratativa: 'Em tratativa',
    concluido: 'Concluido',
    cancelado: 'Cancelado',
  };
  return m[s];
}

function laudoRirLabel(l: RirRegistro['laudo']): string {
  const m: Record<RirRegistro['laudo'], string> = {
    aprovado: 'Aprovado',
    reprovado: 'Reprovado',
    observacoes: 'Conforme observacoes',
  };
  return m[l];
}

export function montarAssuntoAlertaOperacional(total: number, projeto: string): string {
  const ctx = projeto.trim() ? ` — ${projeto.trim()}` : '';
  return `[I.S.O PRO] ${total} pendencia(s) operacional(is)${ctx}`;
}

export function montarCorpoTextoAlertaOperacional(
  relatorio: AlertaOperacionalRelatorio,
  contexto: { cliente: string; projeto: string },
): string {
  const linhas: string[] = [
    'Alerta operacional — I.S.O PRO',
    contexto.cliente.trim() ? `Cliente: ${contexto.cliente.trim()}` : '',
    contexto.projeto.trim() ? `Obra/projeto: ${contexto.projeto.trim()}` : '',
    '',
  ].filter(Boolean);

  if (relatorio.conferencias.length > 0) {
    linhas.push(`Conferencia em atraso (${relatorio.conferencias.length}):`);
    for (const c of relatorio.conferencias) {
      linhas.push(
        `- NF ${c.notaFiscal || '—'} | ${c.fornecedor || '—'} | ${c.diasEmAberto} dia(s) | ${statusConferenciaLabel(c.status)}`,
      );
    }
    linhas.push('');
  }

  if (relatorio.rir.length > 0) {
    linhas.push(`RIR sem finalizar (${relatorio.rir.length}):`);
    for (const r of relatorio.rir) {
      linhas.push(
        `- ${r.codigo} | ${laudoRirLabel(r.laudo)} | ${statusRirLabel(r.status)} | ${r.diasEmAberto} dia(s) | NF ${r.recebimentoNotaFiscal || '—'}`,
      );
    }
    linhas.push('');
  }

  if (relatorio.rirReprovadoSemRnc.length > 0) {
    linhas.push(`RIR reprovado sem RNC vinculada (${relatorio.rirReprovadoSemRnc.length}):`);
    for (const r of relatorio.rirReprovadoSemRnc) {
      linhas.push(
        `- ${r.codigo} | NF ${r.recebimentoNotaFiscal || '—'} | ${r.diasEmAberto} dia(s) | ${r.responsavel || '—'}`,
      );
    }
    linhas.push('');
  }

  if (relatorio.rnc.length > 0) {
    linhas.push(`RNC em aberto (${relatorio.rnc.length}):`);
    for (const r of relatorio.rnc) {
      const extra = r.motivo === 'plano_acao_vencido' ? ' | PLANO DE ACAO VENCIDO' : '';
      linhas.push(`- ${r.codigo} | ${statusRncLabel(r.status)} | ${r.diasEmAberto} dia(s)${extra}`);
    }
    linhas.push('');
  }

  if (relatorio.inventarios.length > 0) {
    linhas.push(`Inventarios abertos (${relatorio.inventarios.length}):`);
    for (const i of relatorio.inventarios) {
      linhas.push(`- ${i.codigo} | ${i.descricao || '—'} | ${i.diasEmAberto} dia(s)`);
    }
    linhas.push('');
  }

  linhas.push('Abra o painel de controle ou os modulos correspondentes no I.S.O PRO.');
  return linhas.join('\n');
}

export function montarCorpoHtmlAlertaOperacional(
  relatorio: AlertaOperacionalRelatorio,
  contexto: { cliente: string; projeto: string },
): string {
  const ctx =
    contexto.cliente.trim() || contexto.projeto.trim()
      ? `<p>${contexto.cliente.trim() ? `Cliente: <strong>${escapeHtml(contexto.cliente.trim())}</strong><br/>` : ''}${contexto.projeto.trim() ? `Obra/projeto: <strong>${escapeHtml(contexto.projeto.trim())}</strong>` : ''}</p>`
      : '';

  const secoes: string[] = [];

  if (relatorio.conferencias.length > 0) {
    const rows = relatorio.conferencias
      .map(
        (c) =>
          `<tr><td>${escapeHtml(c.notaFiscal || '—')}</td><td>${escapeHtml(c.fornecedor || '—')}</td><td>${escapeHtml(c.dataRecebimento)}</td><td><strong>${c.diasEmAberto}</strong></td><td>${escapeHtml(statusConferenciaLabel(c.status))}</td></tr>`,
      )
      .join('');
    secoes.push(`<h3 style="color:#b45309;margin-top:20px">Conferencia em atraso (${relatorio.conferencias.length})</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%">
<thead><tr style="background:#fef3c7"><th>NF</th><th>Fornecedor</th><th>Data receb.</th><th>Dias</th><th>Status</th></tr></thead>
<tbody>${rows}</tbody></table>`);
  }

  if (relatorio.rir.length > 0) {
    const rows = relatorio.rir
      .map(
        (r) =>
          `<tr><td><strong>${escapeHtml(r.codigo)}</strong></td><td>${escapeHtml(laudoRirLabel(r.laudo))}</td><td>${escapeHtml(statusRirLabel(r.status))}</td><td><strong>${r.diasEmAberto}</strong></td><td>${escapeHtml(r.recebimentoNotaFiscal || '—')}</td><td>${escapeHtml(r.responsavel || '—')}</td></tr>`,
      )
      .join('');
    secoes.push(`<h3 style="color:#b45309;margin-top:20px">RIR sem finalizar (${relatorio.rir.length})</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%">
<thead><tr style="background:#fef3c7"><th>Codigo</th><th>Laudo</th><th>Status</th><th>Dias</th><th>NF</th><th>Responsavel</th></tr></thead>
<tbody>${rows}</tbody></table>`);
  }

  if (relatorio.rirReprovadoSemRnc.length > 0) {
    const rows = relatorio.rirReprovadoSemRnc
      .map(
        (r) =>
          `<tr><td><strong>${escapeHtml(r.codigo)}</strong></td><td>${escapeHtml(r.recebimentoNotaFiscal || '—')}</td><td><strong>${r.diasEmAberto}</strong></td><td>${escapeHtml(r.responsavel || '—')}</td></tr>`,
      )
      .join('');
    secoes.push(`<h3 style="color:#b91c1c;margin-top:20px">RIR reprovado sem RNC (${relatorio.rirReprovadoSemRnc.length})</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%">
<thead><tr style="background:#fee2e2"><th>Codigo</th><th>NF</th><th>Dias</th><th>Responsavel</th></tr></thead>
<tbody>${rows}</tbody></table>`);
  }

  if (relatorio.rnc.length > 0) {
    const rows = relatorio.rnc
      .map(
        (r) =>
          `<tr><td><strong>${escapeHtml(r.codigo)}</strong></td><td>${escapeHtml(r.status === 'em_tratativa' ? 'Em tratativa' : 'Aberto')}</td><td><strong>${r.diasEmAberto}</strong></td><td>${r.motivo === 'plano_acao_vencido' ? '<span style="color:#b91c1c">Plano vencido</span>' : 'Tempo em aberto'}</td><td>${escapeHtml(r.responsavel || '—')}</td></tr>`,
      )
      .join('');
    secoes.push(`<h3 style="color:#b45309;margin-top:20px">RNC em aberto (${relatorio.rnc.length})</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%">
<thead><tr style="background:#fef3c7"><th>Codigo</th><th>Status</th><th>Dias</th><th>Motivo</th><th>Responsavel</th></tr></thead>
<tbody>${rows}</tbody></table>`);
  }

  if (relatorio.inventarios.length > 0) {
    const rows = relatorio.inventarios
      .map(
        (i) =>
          `<tr><td><strong>${escapeHtml(i.codigo)}</strong></td><td>${escapeHtml(i.descricao || '—')}</td><td>${escapeHtml(i.responsavel || '—')}</td><td><strong>${i.diasEmAberto}</strong></td></tr>`,
      )
      .join('');
    secoes.push(`<h3 style="color:#b45309;margin-top:20px">Inventarios abertos (${relatorio.inventarios.length})</h3>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%">
<thead><tr style="background:#fef3c7"><th>Codigo</th><th>Descricao</th><th>Responsavel</th><th>Dias</th></tr></thead>
<tbody>${rows}</tbody></table>`);
  }

  const total = totalItensAlertaOperacional(relatorio);
  return `<!DOCTYPE html><html lang="pt-BR"><body style="font-family:Segoe UI,Arial,sans-serif;color:#1e293b">
<h2 style="color:#b45309">Pendencias operacionais — I.S.O PRO</h2>
${ctx}
<p>${total} registro(s) ultrapassaram o prazo configurado ou exigem tratativa imediata.</p>
${secoes.join('\n')}
<p style="margin-top:16px;font-size:13px;color:#64748b">Abra o <strong>painel de controle</strong> ou os modulos correspondentes para regularizar.</p>
</body></html>`;
}
