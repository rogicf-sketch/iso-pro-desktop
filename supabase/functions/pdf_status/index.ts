/**
 * Consulta estado de job PDF e devolve URL assinada quando concluído.
 * Body: { tenantId, login, senha, jobId }
 */
import {
  assertPdfJobUser,
  corsHeaders,
  createServiceClient,
  jsonResponse,
  parseJobId,
  parseTenantId,
} from '../_shared/pdfJobAuth.ts';

const SIGNED_URL_TTL_SEC = 900;

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
    const jobId = parseJobId(body.jobId);
    if (!tenantId || !jobId) {
      return jsonResponse({ ok: false, message: 'Informe tenantId e jobId.' }, 400);
    }

    const auth = await assertPdfJobUser(
      admin,
      tenantId,
      body.login,
      body.senha,
      body.operationalToken,
    );
    if (!auth.ok) return jsonResponse({ ok: false, message: auth.message }, auth.status);

    const { data: job, error } = await admin
      .from('pdf_jobs')
      .select('id, tenant_id, status, storage_path, file_name, error, completed_at')
      .eq('id', jobId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) return jsonResponse({ ok: false, message: error.message }, 400);
    if (!job) return jsonResponse({ ok: false, message: 'Job não encontrado.' }, 404);

    let signedUrl: string | undefined;
    if (job.status === 'done' && job.storage_path) {
      const { data: signed, error: signErr } = await admin.storage
        .from('pdfs')
        .createSignedUrl(job.storage_path, SIGNED_URL_TTL_SEC);
      if (signErr) {
        return jsonResponse({ ok: false, message: signErr.message }, 500);
      }
      signedUrl = signed?.signedUrl;
    }

    return jsonResponse({
      ok: true,
      jobId: job.id,
      status: job.status,
      fileName: job.file_name,
      error: job.error,
      completedAt: job.completed_at,
      signedUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, message: msg }, 500);
  }
});
