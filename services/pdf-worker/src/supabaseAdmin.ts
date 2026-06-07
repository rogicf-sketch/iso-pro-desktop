import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

async function wsTransportOption(): Promise<Record<string, unknown>> {
  const major = Number(process.versions.node.split('.')[0] ?? 0);
  if (major >= 22) return {};
  try {
    const ws = await import('ws');
    return { realtime: { transport: ws.default } };
  } catch {
    return {};
  }
}

export async function getSupabaseAdmin(): Promise<SupabaseClient> {
  if (client) return client;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }
  const wsOpt = await wsTransportOption();
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...wsOpt,
  });
  return client;
}

export type PdfJobRow = {
  id: string;
  tenant_id: string;
  tipo: string;
  status: string;
  payload: unknown;
  file_name: string | null;
  attempts: number;
  max_attempts: number;
};

export async function claimNextJob(): Promise<PdfJobRow | null> {
  const admin = await getSupabaseAdmin();
  const { data, error } = await admin.rpc('claim_pdf_job');
  if (error) throw new Error(`claim_pdf_job: ${error.message}`);
  const row = data as PdfJobRow | null;
  if (!row?.id || !row.tipo) return null;
  return row;
}

export async function completeJob(jobId: string, storagePath: string, fileName: string): Promise<void> {
  const admin = await getSupabaseAdmin();
  const { error } = await admin.rpc('complete_pdf_job', {
    p_job_id: jobId,
    p_storage_path: storagePath,
    p_file_name: fileName,
  });
  if (error) throw new Error(`complete_pdf_job: ${error.message}`);
}

export async function failJob(jobId: string, message: string, retry: boolean): Promise<void> {
  const admin = await getSupabaseAdmin();
  const { error } = await admin.rpc('fail_pdf_job', {
    p_job_id: jobId,
    p_error: message,
    p_retry: retry,
  });
  if (error) throw new Error(`fail_pdf_job: ${error.message}`);
}

export async function uploadPdf(storagePath: string, bytes: Uint8Array): Promise<void> {
  const admin = await getSupabaseAdmin();
  const { error } = await admin.storage.from('pdfs').upload(storagePath, bytes, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw new Error(`storage upload: ${error.message}`);
}
