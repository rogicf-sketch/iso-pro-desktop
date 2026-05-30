/**
 * Verifica pendencias operacionais (conferencia, RIR, RNC, inventario) e envia e-mail SMTP.
 *
 * Modos:
 * - Cron: cabecalho `x-iso-pro-cron-secret` = ISO_PRO_ALERTA_OPERACIONAL_CRON_SECRET; body `{ "modo": "cron" }`
 * - Manual: body `{ tenantId, login, senha, forcar? }` — actor com permissao configuracoes/administrar
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  configOperacionalPronta,
  deveEnviarOperacionalNuvem,
  lerConfigOperacional,
  montarAssuntoOperacionalNuvem,
  montarFingerprintNuvem,
  montarHtmlOperacionalNuvem,
  montarRelatorioOperacionalNuvem,
  montarTextoOperacionalNuvem,
  parseDestinatarios,
  totalRelatorioNuvem,
  type SnapshotPayload,
} from '../_shared/alertaOperacionalNuvem.ts';
import { enviarEmailSmtp } from '../_shared/mailSmtp.ts';
import { verifyPassword } from '../_shared/passwordHash.ts';

const SNAPSHOT_ID = 'default';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PermRow = { modulo?: string | null; acao?: string | null; permitido?: boolean | null };

function parseTenantId(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s || !UUID_RE.test(s)) return null;
  return s;
}

function hasConfigAdministrar(usuarioPerm: PermRow[] | null | undefined, perfilPerm: PermRow[] | null | undefined): boolean {
  const source = usuarioPerm && usuarioPerm.length > 0 ? usuarioPerm : perfilPerm ?? [];
  return source.some(
    (p) => p.permitido === true && String(p.modulo ?? '') === 'configuracoes' && String(p.acao ?? '') === 'administrar',
  );
}

async function processarTenant(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  forcar: boolean,
): Promise<{ enviado: boolean; pendencias: number; motivo?: string }> {
  const { data: snapRow, error: snapErr } = await admin
    .from('iso_pro_snapshot')
    .select('payload')
    .eq('id', SNAPSHOT_ID)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (snapErr) throw new Error(snapErr.message);

  const payload = ((snapRow?.payload ?? {}) as SnapshotPayload) ?? {};
  const cfg = lerConfigOperacional(payload.configuracoesSistema);
  if (!configOperacionalPronta(cfg)) {
    return { enviado: false, pendencias: 0, motivo: 'Alerta operacional ou SMTP nao configurado na nuvem.' };
  }

  const relatorio = montarRelatorioOperacionalNuvem(payload, cfg);
  const total = totalRelatorioNuvem(relatorio);
  const fingerprint = montarFingerprintNuvem(relatorio);
  const state = cfg.alertaOperacionalEmailState ?? { lastNotifiedFingerprint: '', lastSentAt: '' };

  if (total === 0) {
    if (state.lastNotifiedFingerprint) {
      const nextConfig = {
        ...(payload.configuracoesSistema ?? {}),
        alertaOperacionalEmailState: { lastNotifiedFingerprint: '', lastSentAt: state.lastSentAt ?? '' },
      };
      await admin.from('iso_pro_snapshot').upsert({
        id: SNAPSHOT_ID,
        tenant_id: tenantId,
        payload: { ...payload, configuracoesSistema: nextConfig, dataAtualizacao: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      });
    }
    return { enviado: false, pendencias: 0, motivo: 'Nenhuma pendencia operacional no prazo.' };
  }

  if (!deveEnviarOperacionalNuvem(fingerprint, state, cfg.alertaOperacionalIntervaloMinimoHoras ?? 24, total > 0, forcar)) {
    return { enviado: false, pendencias: total, motivo: 'Lista inalterada dentro do intervalo minimo.' };
  }

  const destinatarios = parseDestinatarios(cfg.alertaOperacionalEmailDestinatarios ?? '');
  const ctx = { cliente: cfg.cliente ?? '', projeto: cfg.projeto ?? '' };
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
    montarAssuntoOperacionalNuvem(total, cfg.projeto ?? ''),
    montarTextoOperacionalNuvem(relatorio, ctx),
    montarHtmlOperacionalNuvem(relatorio, ctx),
  );

  const nextConfig = {
    ...(payload.configuracoesSistema ?? {}),
    alertaOperacionalEmailState: {
      lastNotifiedFingerprint: fingerprint,
      lastSentAt: new Date().toISOString(),
    },
  };
  await admin.from('iso_pro_snapshot').upsert({
    id: SNAPSHOT_ID,
    tenant_id: tenantId,
    payload: { ...payload, configuracoesSistema: nextConfig, dataAtualizacao: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });

  return { enviado: true, pendencias: total };
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
    const cronSecret = Deno.env.get('ISO_PRO_ALERTA_OPERACIONAL_CRON_SECRET') ?? '';
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
      let totalPendencias = 0;

      for (const t of tenants ?? []) {
        const tenantId = String((t as { id: string }).id);
        const r = await processarTenant(admin, tenantId, false);
        totalPendencias += r.pendencias;
        if (r.enviado) enviados += 1;
        else ignorados += 1;
      }

      return new Response(
        JSON.stringify({
          ok: true,
          message: `Cron operacional: ${enviados} e-mail(s) enviado(s), ${ignorados} tenant(s) sem envio.`,
          enviados,
          ignorados,
          pendencias: totalPendencias,
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
    if (!userRow || !(await verifyPassword(senha, String((userRow as { senha?: string }).senha ?? '')))) {
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
          ? `E-mail enviado com ${result.pendencias} pendencia(s) operacional(is).`
          : (result.motivo ?? 'Nenhum envio.'),
        enviados: result.enviado ? 1 : 0,
        pendencias: result.pendencias,
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
