/**
 * Super-admin: emitir / listar / revogar licenças desktop para qualquer tenant.
 *
 * Segurança:
 * - Cabeçalho `x-iso-pro-admin-user-secret` = `ISO_PRO_ADMIN_USER_SECRET`
 * - Actor: login+senha em usuarios_sistema do tenant default com `plataforma_super_admin`
 * - Chave privada: secret `ISO_PRO_DESKTOP_LICENSE_PRIVATE_KEY` (PEM) — nunca no browser
 *
 * Modes: capabilities | list | issue | set_status
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { createSign, randomUUID } from 'node:crypto';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const LOOSE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseTenantUuid(label: string, value: string): string {
  const t = value.trim();
  if (!t || !LOOSE_UUID_RE.test(t)) {
    throw new Error(`${label} nao e um UUID valido.`);
  }
  return t;
}

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function json(cors: Record<string, string>, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function assertSuperAdmin(
  admin: ReturnType<typeof createClient>,
  actorLogin: string,
  actorSenha: string,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; message: string }> {
  if (!actorLogin.trim() || !actorSenha) {
    return { ok: false, status: 400, message: 'Informe actorLogin e actorSenha.' };
  }

  const { data: isAdmin, error: adminErr } = await admin.rpc('iso_pro_usuario_administra_utilizadores', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_actor_login: actorLogin.trim(),
    p_actor_senha: actorSenha,
  });
  if (adminErr) {
    return { ok: false, status: 400, message: adminErr.message ?? String(adminErr) };
  }
  if (!isAdmin) {
    return { ok: false, status: 403, message: 'Sem permissao de administrador na organizacao principal.' };
  }

  const { data: row, error: rowErr } = await admin
    .from('usuarios_sistema')
    .select('id, plataforma_super_admin, ativo')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .ilike('login', actorLogin.trim())
    .maybeSingle();

  if (rowErr) {
    return { ok: false, status: 400, message: rowErr.message };
  }
  if (!row || row.ativo === false) {
    return { ok: false, status: 403, message: 'Utilizador da sede inexistente ou inactivo.' };
  }
  if (!row.plataforma_super_admin) {
    return {
      ok: false,
      status: 403,
      message:
        'Conta sem flag plataforma_super_admin. Na org principal, um admin precisa desta flag (migracao / SQL).',
    };
  }

  return { ok: true, userId: String(row.id) };
}

function signLicenseToken(payload: Record<string, unknown>, privateKeyPem: string): string {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(encodedPayload);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${encodedPayload}.${toBase64Url(signature)}`;
}

Deno.serve(async (req) => {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-iso-pro-admin-user-secret',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(corsHeaders, 405, { ok: false, message: 'Use POST.' });
  }

  try {
    const expected = Deno.env.get('ISO_PRO_ADMIN_USER_SECRET') ?? '';
    const headerSecret = req.headers.get('x-iso-pro-admin-user-secret') ?? '';
    if (!expected || headerSecret !== expected) {
      return json(corsHeaders, 401, { ok: false, message: 'Nao autorizado.' });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const mode = String(body.mode ?? '').trim().toLowerCase();
    const actorLogin = String(body.actorLogin ?? '').trim();
    const actorSenha = String(body.actorSenha ?? '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      return json(corsHeaders, 500, {
        ok: false,
        message: 'Servidor sem SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const gate = await assertSuperAdmin(admin, actorLogin, actorSenha);
    if (!gate.ok) {
      return json(corsHeaders, gate.status, { ok: false, message: gate.message });
    }

    if (mode === 'capabilities') {
      const privateKeyConfigured = Boolean(Deno.env.get('ISO_PRO_DESKTOP_LICENSE_PRIVATE_KEY')?.trim());
      const { data: tenants } = await admin.from('iso_pro_tenants').select('id,slug,name').order('name');
      return json(corsHeaders, 200, {
        ok: true,
        superAdmin: true,
        privateKeyConfigured,
        actorUserId: gate.userId,
        tenants: tenants ?? [],
      });
    }

    if (mode === 'list') {
      const filterTenant =
        body.tenantId != null && String(body.tenantId).trim()
          ? parseTenantUuid('tenantId', String(body.tenantId))
          : '';

      let q = admin
        .from('desktop_licencas')
        .select(
          'license_id, tenant_id, issued_to, machine_fingerprint, machine_label, app_version, status, emitida_em, expira_em, revogada_em, motivo_revogacao',
        )
        .order('emitida_em', { ascending: false });
      if (filterTenant) {
        q = q.eq('tenant_id', filterTenant);
      }

      const { data, error } = await q;
      if (error) {
        return json(corsHeaders, 400, { ok: false, message: error.message });
      }

      const { data: tenants } = await admin.from('iso_pro_tenants').select('id,slug,name');
      const tenantMap = new Map(
        (tenants ?? []).map((t) => [
          String(t.id),
          { slug: String(t.slug ?? ''), name: String(t.name ?? '') },
        ]),
      );

      const items = (data ?? []).map((row) => {
        const tid = String(row.tenant_id ?? '');
        const meta = tenantMap.get(tid);
        return {
          licenseId: String(row.license_id),
          tenantId: tid,
          tenantSlug: meta?.slug ?? '',
          tenantName: meta?.name ?? tid,
          issuedTo: String(row.issued_to ?? ''),
          machineFingerprint: String(row.machine_fingerprint ?? ''),
          machineLabel: String(row.machine_label ?? ''),
          appVersion: String(row.app_version ?? ''),
          status: row.status === 'revoked' ? 'revoked' : 'active',
          emitidaEm: String(row.emitida_em ?? ''),
          expiraEm: String(row.expira_em ?? ''),
          revogadaEm: String(row.revogada_em ?? ''),
          motivoRevogacao: String(row.motivo_revogacao ?? ''),
        };
      });

      return json(corsHeaders, 200, { ok: true, items });
    }

    if (mode === 'issue') {
      const privateKey = (Deno.env.get('ISO_PRO_DESKTOP_LICENSE_PRIVATE_KEY') ?? '').trim();
      if (!privateKey) {
        return json(corsHeaders, 500, {
          ok: false,
          message:
            'Secret ISO_PRO_DESKTOP_LICENSE_PRIVATE_KEY nao configurado no Dashboard (PEM da chave privada).',
        });
      }

      const targetTenantId = parseTenantUuid('tenantId', String(body.tenantId ?? ''));
      const issuedTo = String(body.issuedTo ?? '').trim();
      const machineFingerprint = String(body.machineFingerprint ?? '').trim();
      const machineLabel = String(body.machineLabel ?? '').trim();
      const expiresAtRaw = String(body.expiresAt ?? '').trim();
      const appVersion = String(body.appVersion ?? '').trim();
      const licenseId = String(body.licenseId ?? '').trim() || randomUUID();

      if (!issuedTo) {
        return json(corsHeaders, 400, { ok: false, message: 'Informe issuedTo (titular / empresa).' });
      }
      if (!machineFingerprint || machineFingerprint.length < 16) {
        return json(corsHeaders, 400, {
          ok: false,
          message: 'Informe machineFingerprint valido (copiado do PC do cliente).',
        });
      }

      const { data: tenantOk } = await admin
        .from('iso_pro_tenants')
        .select('id,slug,name')
        .eq('id', targetTenantId)
        .maybeSingle();
      if (!tenantOk) {
        return json(corsHeaders, 404, { ok: false, message: 'Empresa (tenant) nao encontrada.' });
      }

      let expiresAt: string | undefined;
      if (expiresAtRaw) {
        const t = new Date(expiresAtRaw).getTime();
        if (!Number.isFinite(t)) {
          return json(corsHeaders, 400, { ok: false, message: 'expiresAt invalido.' });
        }
        expiresAt = new Date(t).toISOString();
      }

      const issuedAt = new Date().toISOString();
      const payload = {
        licenseId,
        issuedTo,
        machineFingerprint,
        machineLabel: machineLabel || undefined,
        issuedAt,
        expiresAt,
        appVersion: appVersion || undefined,
        status: 'active' as const,
      };

      let token: string;
      try {
        token = signLicenseToken(payload, privateKey);
      } catch (e) {
        return json(corsHeaders, 500, {
          ok: false,
          message: `Falha ao assinar licenca: ${e instanceof Error ? e.message : String(e)}`,
        });
      }

      const { error: upErr } = await admin.from('desktop_licencas').upsert(
        {
          license_id: licenseId,
          tenant_id: targetTenantId,
          issued_to: issuedTo,
          machine_fingerprint: machineFingerprint,
          machine_label: machineLabel || null,
          app_version: appVersion || null,
          status: 'active',
          emitida_em: issuedAt,
          expira_em: expiresAt ?? null,
          revogada_em: null,
          motivo_revogacao: null,
        },
        { onConflict: 'license_id,tenant_id' },
      );
      if (upErr) {
        return json(corsHeaders, 400, { ok: false, message: upErr.message });
      }

      return json(corsHeaders, 200, {
        ok: true,
        token,
        payload,
        tenant: {
          id: String(tenantOk.id),
          slug: String(tenantOk.slug ?? ''),
          name: String(tenantOk.name ?? ''),
        },
        issuedBy: actorLogin.trim().toLowerCase(),
        issuedByUserId: gate.userId,
      });
    }

    if (mode === 'set_status') {
      const targetTenantId = parseTenantUuid('tenantId', String(body.tenantId ?? ''));
      const licenseId = String(body.licenseId ?? '').trim();
      const statusRaw = String(body.status ?? '').trim().toLowerCase();
      const status = statusRaw === 'revoked' ? 'revoked' : statusRaw === 'active' ? 'active' : '';
      const reason = String(body.reason ?? '').trim();

      if (!licenseId) {
        return json(corsHeaders, 400, { ok: false, message: 'Informe licenseId.' });
      }
      if (!status) {
        return json(corsHeaders, 400, { ok: false, message: 'Informe status: active ou revoked.' });
      }

      const { data: existing, error: exErr } = await admin
        .from('desktop_licencas')
        .select(
          'license_id, tenant_id, issued_to, machine_fingerprint, machine_label, app_version, emitida_em, expira_em',
        )
        .eq('license_id', licenseId)
        .eq('tenant_id', targetTenantId)
        .maybeSingle();

      if (exErr) {
        return json(corsHeaders, 400, { ok: false, message: exErr.message });
      }
      if (!existing) {
        return json(corsHeaders, 404, { ok: false, message: 'Licenca nao encontrada nesse tenant.' });
      }

      const { error: upErr } = await admin.from('desktop_licencas').upsert(
        {
          license_id: licenseId,
          tenant_id: targetTenantId,
          issued_to: existing.issued_to,
          machine_fingerprint: existing.machine_fingerprint,
          machine_label: existing.machine_label,
          app_version: existing.app_version,
          status,
          emitida_em: existing.emitida_em,
          expira_em: existing.expira_em,
          revogada_em: status === 'revoked' ? new Date().toISOString() : null,
          motivo_revogacao:
            status === 'revoked'
              ? reason || `Revogada por super-admin ${actorLogin.trim().toLowerCase()}.`
              : null,
        },
        { onConflict: 'license_id,tenant_id' },
      );
      if (upErr) {
        return json(corsHeaders, 400, { ok: false, message: upErr.message });
      }

      return json(corsHeaders, 200, {
        ok: true,
        licenseId,
        tenantId: targetTenantId,
        status,
        actorLogin: actorLogin.trim().toLowerCase(),
      });
    }

    return json(corsHeaders, 400, {
      ok: false,
      message: 'Informe mode: capabilities | list | issue | set_status.',
    });
  } catch (e) {
    return json(corsHeaders, 400, {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    });
  }
});
