/**
 * Enfileira job de geração de PDF na nuvem.
 * Body: { tenantId, login, senha, tipo, payload, fileName? }
 */
import {
  assertPdfJobUser,
  corsHeaders,
  createServiceClient,
  isPdfJobTipo,
  jsonResponse,
  parseTenantId,
} from '../_shared/pdfJobAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, message: 'Use POST.' }, 405);
  }

  try {
    const admin = createServiceClient();
    if (!admin) {
      return jsonResponse({ ok: false, message: 'Servidor sem credenciais Supabase.' }, 500);
    }

    const body = (await req.json()) as Record<string, unknown>;
    const tenantId = parseTenantId(body.tenantId);
    if (!tenantId) {
      return jsonResponse({ ok: false, message: 'Informe tenantId (UUID).' }, 400);
    }

    const auth = await assertPdfJobUser(
      admin,
      tenantId,
      body.login,
      body.senha,
      body.operationalToken,
    );
    if (!auth.ok) return jsonResponse({ ok: false, message: auth.message }, auth.status);

    if (!isPdfJobTipo(body.tipo)) {
      return jsonResponse({ ok: false, message: 'tipo de PDF inválido.' }, 400);
    }

    const payload = body.payload;
    if (payload === undefined || payload === null || typeof payload !== 'object') {
      return jsonResponse({ ok: false, message: 'payload inválido.' }, 400);
    }

    const fileName = String(body.fileName ?? 'documento.pdf').trim() || 'documento.pdf';
    const payloadJson = JSON.stringify(payload);
    if (payloadJson.length > 12_000_000) {
      return jsonResponse({ ok: false, message: 'payload demasiado grande.' }, 413);
    }

    const { data, error } = await admin
      .from('pdf_jobs')
      .insert({
        tenant_id: tenantId,
        usuario_id: auth.user.id,
        tipo: body.tipo,
        status: 'pending',
        payload,
        file_name: fileName.slice(0, 260),
      })
      .select('id, status, created_at')
      .single();

    if (error) {
      return jsonResponse({ ok: false, message: error.message }, 400);
    }

    return jsonResponse({
      ok: true,
      jobId: data.id,
      status: data.status,
      createdAt: data.created_at,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, message: msg }, 500);
  }
});
