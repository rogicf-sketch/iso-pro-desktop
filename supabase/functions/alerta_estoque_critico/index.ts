/**
 * Verifica estoque critico por tenant e envia e-mail SMTP configurado em `configuracoesSistema`.
 *
 * Modos:
 * - Cron: cabecalho `x-iso-pro-cron-secret` = ISO_PRO_ALERTA_ESTOQUE_CRON_SECRET; body `{ "modo": "cron" }` (todos os tenants)
 * - Manual (desktop): body `{ tenantId, login, senha, forcar? }` — actor com permissao configuracoes/administrar
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  type MaterialRow,
  type SnapshotPayload,
  deveEnviarEmail,
  listarMateriaisCriticosNuvem,
  montarAssunto,
  montarHtml,
  montarTexto,
  parseDestinatarios,
} from '../_shared/estoqueCriticoNuvem.ts';
import { enviarEmailSmtp } from '../_shared/mailSmtp.ts';

const SNAPSHOT_ID = 'default';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ConfigAlerta = {
  alertaEstoqueEmailHabilitado?: boolean;
  alertaEstoqueEmailDestinatarios?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUsuario?: string;
  smtpSenha?: string;
  smtpRemetente?: string;
  cliente?: string;
  projeto?: string;
  alertaEstoqueEmailState?: { lastNotifiedCriticalIds?: string[]; lastSentAt?: string };
};

type PermRow = { modulo?: string | null; acao?: string | null; permitido?: boolean | null };

function parseTenantId(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s || !UUID_RE.test(s)) return null;
  return s;
}

function lerConfigAlerta(raw: unknown): ConfigAlerta {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const st = o.alertaEstoqueEmailState;
  return {
    alertaEstoqueEmailHabilitado: o.alertaEstoqueEmailHabilitado === true,
    alertaEstoqueEmailDestinatarios: String(o.alertaEstoqueEmailDestinatarios ?? '').trim(),
    smtpHost: String(o.smtpHost ?? '').trim(),
    smtpPort: Number.isFinite(Number(o.smtpPort)) && Number(o.smtpPort) > 0 ? Number(o.smtpPort) : 587,
    smtpSecure: o.smtpSecure === true,
    smtpUsuario: String(o.smtpUsuario ?? '').trim(),
    smtpSenha: String(o.smtpSenha ?? ''),
    smtpRemetente: String(o.smtpRemetente ?? '').trim(),
    cliente: String(o.cliente ?? '').trim(),
    projeto: String(o.projeto ?? '').trim(),
    alertaEstoqueEmailState:
      st && typeof st === 'object' && !Array.isArray(st)
        ? {
            lastNotifiedCriticalIds: Array.isArray((st as Record<string, unknown>).lastNotifiedCriticalIds)
              ? ((st as Record<string, unknown>).lastNotifiedCriticalIds as unknown[]).map(String)
              : [],
            lastSentAt: String((st as Record<string, unknown>).lastSentAt ?? ''),
          }
        : { lastNotifiedCriticalIds: [], lastSentAt: '' },
  };
}

function configPronta(cfg: ConfigAlerta): boolean {
  if (!cfg.alertaEstoqueEmailHabilitado) return false;
  if (!cfg.smtpHost || !cfg.smtpRemetente) return false;
  return parseDestinatarios(cfg.alertaEstoqueEmailDestinatarios ?? '').length > 0;
}

function hasConfigAdministrar(usuarioPerm: PermRow[] | null | undefined, perfilPerm: PermRow[] | null | undefined): boolean {
  const source = usuarioPerm && usuarioPerm.length > 0 ? usuarioPerm : perfilPerm ?? [];
  return source.some(
    (p) => p.permitido === true && String(p.modulo ?? '') === 'configuracoes' && String(p.acao ?? '') === 'administrar',
  );
}

async function carregarMateriaisTenant(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  payload: SnapshotPayload,
): Promise<MaterialRow[]> {
  const { data, error } = await admin
    .from('materiais')
    .select('id,codigo,descricao,unidade,estoque_minimo,ativo')
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`materiais: ${error.message}`);

  if (data && data.length > 0) {
    return data.map((row) => ({
      id: String((row as { id: number }).id),
      codigo: String((row as { codigo?: string }).codigo ?? ''),
      descricao: String((row as { descricao?: string }).descricao ?? ''),
      unidade: String((row as { unidade?: string }).unidade ?? 'UN'),
      estoqueMinimo: Number((row as { estoque_minimo?: number }).estoque_minimo ?? 0),
      ativo: (row as { ativo?: boolean }).ativo !== false,
    }));
  }

  return (payload.materiais ?? []).map((m, idx) => ({
    id: String(m.id ?? idx),
    codigo: String(m.codigo ?? ''),
    descricao: String(m.descricao ?? ''),
    unidade: String(m.unidade ?? 'UN'),
    estoqueMinimo: Number(m.estoqueMinimo ?? m.estoque_minimo ?? 0),
    ativo: m.ativo !== false,
  }));
}

async function processarTenant(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  forcar: boolean,
): Promise<{ enviado: boolean; criticos: number; motivo?: string }> {
  const { data: snapRow, error: snapErr } = await admin
    .from('iso_pro_snapshot')
    .select('payload')
    .eq('id', SNAPSHOT_ID)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (snapErr) throw new Error(snapErr.message);

  const payload = ((snapRow?.payload ?? {}) as SnapshotPayload) ?? {};
  const cfg = lerConfigAlerta(payload.configuracoesSistema);
  if (!configPronta(cfg)) {
    return { enviado: false, criticos: 0, motivo: 'Alerta ou SMTP nao configurado na nuvem.' };
  }

  const materiais = await carregarMateriaisTenant(admin, tenantId, payload);
  const todos = listarMateriaisCriticosNuvem(materiais, payload);
  const criticos = todos.filter((i) => i.severidade === 'critical');
  const criticosIds = criticos.map((i) => i.materialId);
  const stateIds = cfg.alertaEstoqueEmailState?.lastNotifiedCriticalIds ?? [];

  if (criticos.length === 0) {
    if (stateIds.length > 0) {
      const nextConfig = {
        ...(payload.configuracoesSistema ?? {}),
        alertaEstoqueEmailState: { lastNotifiedCriticalIds: [], lastSentAt: cfg.alertaEstoqueEmailState?.lastSentAt ?? '' },
      };
      await admin.from('iso_pro_snapshot').upsert({
        id: SNAPSHOT_ID,
        tenant_id: tenantId,
        payload: { ...payload, configuracoesSistema: nextConfig, dataAtualizacao: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      });
    }
    return { enviado: false, criticos: 0, motivo: 'Nenhum material critico.' };
  }

  if (!deveEnviarEmail(criticosIds, stateIds, forcar)) {
    return { enviado: false, criticos: criticos.length, motivo: 'Lista de criticos inalterada.' };
  }

  const destinatarios = parseDestinatarios(cfg.alertaEstoqueEmailDestinatarios ?? '');
  await enviarEmailSmtp(
    {
      host: cfg.smtpHost!,
      port: cfg.smtpPort ?? 587,
      secure: cfg.smtpSecure === true,
      user: cfg.smtpUsuario ?? '',
      pass: cfg.smtpSenha ?? '',
      from: cfg.smtpRemetente!,
    },
    destinatarios,
    montarAssunto(criticos.length, cfg.projeto ?? ''),
    montarTexto(criticos, { cliente: cfg.cliente ?? '', projeto: cfg.projeto ?? '' }),
    montarHtml(criticos, { cliente: cfg.cliente ?? '', projeto: cfg.projeto ?? '' }),
  );

  const nextConfig = {
    ...(payload.configuracoesSistema ?? {}),
    alertaEstoqueEmailState: {
      lastNotifiedCriticalIds: criticosIds,
      lastSentAt: new Date().toISOString(),
    },
  };
  await admin.from('iso_pro_snapshot').upsert({
    id: SNAPSHOT_ID,
    tenant_id: tenantId,
    payload: { ...payload, configuracoesSistema: nextConfig, dataAtualizacao: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });

  return { enviado: true, criticos: criticos.length };
}

Deno.serve(async (req) => {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-iso-pro-cron-secret',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, message: 'Use POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ ok: false, message: 'Servidor sem credenciais Supabase.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json()) as Record<string, unknown>;
    const cronSecret = Deno.env.get('ISO_PRO_ALERTA_ESTOQUE_CRON_SECRET') ?? '';
    const headerCron = req.headers.get('x-iso-pro-cron-secret') ?? '';
    const modoCron = body.modo === 'cron' || (cronSecret && headerCron === cronSecret);

    if (modoCron) {
      if (!cronSecret || headerCron !== cronSecret) {
        return new Response(JSON.stringify({ ok: false, message: 'Cron secret invalido.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: tenants, error: tErr } = await admin.from('iso_pro_tenants').select('id');
      if (tErr) throw new Error(tErr.message);

      let enviados = 0;
      let ignorados = 0;
      let totalCriticos = 0;

      for (const t of tenants ?? []) {
        const tenantId = String((t as { id: string }).id);
        const r = await processarTenant(admin, tenantId, false);
        totalCriticos += r.criticos;
        if (r.enviado) enviados += 1;
        else ignorados += 1;
      }

      return new Response(
        JSON.stringify({
          ok: true,
          message: `Cron: ${enviados} e-mail(s) enviado(s), ${ignorados} tenant(s) sem envio.`,
          enviados,
          ignorados,
          criticos: totalCriticos,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tenantId = parseTenantId(body.tenantId);
    if (!tenantId) {
      return new Response(JSON.stringify({ ok: false, message: 'Informe tenantId (UUID).' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const login = String(body.login ?? '').trim().toLowerCase();
    const senha = String(body.senha ?? '').trim();
  const forcar = body.forcar === true;

    if (!login || !senha) {
      return new Response(JSON.stringify({ ok: false, message: 'Informe login e senha.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: userRow, error: userErr } = await admin
      .from('usuarios_sistema')
      .select(
        'id,login,senha,ativo,perfis_acesso(perfil_permissoes(modulo,acao,permitido)),usuario_permissoes(modulo,acao,permitido)',
      )
      .eq('login', login)
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .maybeSingle();

    if (userErr) throw new Error(userErr.message);
    if (!userRow || String((userRow as { senha?: string }).senha ?? '') !== senha) {
      return new Response(JSON.stringify({ ok: false, message: 'Login ou senha invalidos.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const u = userRow as {
      perfis_acesso?: { perfil_permissoes?: PermRow[] } | null;
      usuario_permissoes?: PermRow[] | null;
    };
    if (!hasConfigAdministrar(u.usuario_permissoes, u.perfis_acesso?.perfil_permissoes)) {
      return new Response(JSON.stringify({ ok: false, message: 'Sem permissao configuracoes/administrar.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await processarTenant(admin, tenantId, forcar);
    return new Response(
      JSON.stringify({
        ok: true,
        message: result.enviado
          ? `E-mail enviado para ${result.criticos} material(is) critico(s).`
          : (result.motivo ?? 'Nenhum envio.'),
        enviados: result.enviado ? 1 : 0,
        criticos: result.criticos,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro interno.';
    return new Response(JSON.stringify({ ok: false, message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
