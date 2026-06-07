/**
 * Remove PDFs antigos do bucket `pdfs` e jobs concluídos (>7 dias).
 * Invocar via cron (x-iso-pro-cron-secret) ou manual admin.
 */
import {
  assertPdfJobUser,
  corsHeaders,
  createServiceClient,
  jsonResponse,
  parseTenantId,
} from '../_shared/pdfJobAuth.ts';

const RETENTION_DAYS = Number(Deno.env.get('PDF_RETENTION_DAYS') ?? '7');
const CRON_SECRET = Deno.env.get('ISO_PRO_PDF_CLEANUP_CRON_SECRET') ?? '';

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
    const cronHeader = req.headers.get('x-iso-pro-cron-secret') ?? '';
    const isCron = Boolean(CRON_SECRET && cronHeader === CRON_SECRET);

    if (!isCron) {
      const tenantId = parseTenantId(body.tenantId);
      if (!tenantId) {
        return jsonResponse({ ok: false, message: 'Informe tenantId ou use cron secret.' }, 400);
      }
      const auth = await assertPdfJobUser(
        admin,
        tenantId,
        body.login,
        body.senha,
        body.operationalToken,
      );
      if (!auth.ok) return jsonResponse({ ok: false, message: auth.message }, auth.status);
    }

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
    const { data: oldJobs, error: selErr } = await admin
      .from('pdf_jobs')
      .select('id, storage_path')
      .lt('completed_at', cutoff)
      .in('status', ['done', 'failed'])
      .limit(200);

    if (selErr) return jsonResponse({ ok: false, message: selErr.message }, 400);

    const paths = (oldJobs ?? [])
      .map((j) => String((j as { storage_path?: string }).storage_path ?? ''))
      .filter(Boolean);

    if (paths.length) {
      const { error: rmErr } = await admin.storage.from('pdfs').remove(paths);
      if (rmErr) console.warn('[pdf_cleanup] storage remove:', rmErr.message);
    }

    const ids = (oldJobs ?? []).map((j) => (j as { id: string }).id);
    if (ids.length) {
      const { error: delErr } = await admin.from('pdf_jobs').delete().in('id', ids);
      if (delErr) return jsonResponse({ ok: false, message: delErr.message }, 400);
    }

    return jsonResponse({
      ok: true,
      removedJobs: ids.length,
      removedFiles: paths.length,
      retentionDays: RETENTION_DAYS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ ok: false, message: msg }, 500);
  }
});
