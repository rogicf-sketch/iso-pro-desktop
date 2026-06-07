import { getSupabase } from '../supabase';
import { getActiveTenantId } from '../isoProTenant';
import { getCurrentUser, getVolatileSessionPassword } from '../../modules/auth/services/auth.service';
import { obterTokenOperacionalIsoPro } from '../isoProAuthRpc';
import type { EnqueuePdfResponse, PdfJobStatus, PdfJobTipo, StatusPdfResponse } from './types';

type PdfCredenciais =
  | { tenantId: string; login: string; operationalToken: string }
  | { tenantId: string; login: string; senha: string };

async function credenciaisPdf(): Promise<PdfCredenciais | null> {
  const user = getCurrentUser();
  if (!user?.login) return null;
  const tenantId = getActiveTenantId();
  const senha = getVolatileSessionPassword();
  if (senha) {
    const token = await obterTokenOperacionalIsoPro(tenantId, user.login, senha);
    if (token.ok) {
      return { tenantId, login: user.login, operationalToken: token.token };
    }
  }
  if (senha) {
    return { tenantId, login: user.login, senha };
  }
  return null;
}

function corpoCredenciaisPdf(cred: PdfCredenciais): Record<string, string> {
  if ('operationalToken' in cred) {
    return { tenantId: cred.tenantId, login: cred.login, operationalToken: cred.operationalToken };
  }
  return { tenantId: cred.tenantId, login: cred.login, senha: cred.senha };
}

export async function enqueuePdfJob(
  tipo: PdfJobTipo,
  payload: unknown,
  fileName: string,
): Promise<EnqueuePdfResponse> {
  const supabase = getSupabase();
  const cred = await credenciaisPdf();
  if (!supabase || !cred) {
    return { ok: false, error: 'Sessão ou Supabase indisponível para PDF na nuvem.' };
  }

  const { data, error } = await supabase.functions.invoke<EnqueuePdfResponse>('pdf_enqueue', {
    body: {
      ...corpoCredenciaisPdf(cred),
      tipo,
      payload,
      fileName,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data?.ok || !('jobId' in data) || !data.jobId) {
    const msg = data && 'error' in data ? String(data.error) : 'Falha ao enfileirar PDF.';
    return { ok: false, error: msg };
  }
  return { ok: true, jobId: data.jobId, status: (data.status as PdfJobStatus) ?? 'pending' };
}

export async function consultarPdfJob(jobId: string): Promise<StatusPdfResponse> {
  const supabase = getSupabase();
  const cred = await credenciaisPdf();
  if (!supabase || !cred) {
    return { ok: false, error: 'Sessão ou Supabase indisponível.' };
  }

  const { data, error } = await supabase.functions.invoke<StatusPdfResponse>('pdf_status', {
    body: {
      ...corpoCredenciaisPdf(cred),
      jobId,
    },
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.ok) {
    return { ok: false, error: data && 'error' in data ? String((data as { error?: string }).error) : 'Consulta falhou.' };
  }
  return data;
}

export async function aguardarPdfJobConcluido(
  jobId: string,
  timeoutMs: number,
): Promise<StatusPdfResponse & { ok: true }> {
  const supabase = getSupabase();
  const cred = await credenciaisPdf();
  if (!supabase || !cred) {
    throw new Error('Sessão ou Supabase indisponível.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let pollIv = 0;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      window.clearInterval(pollIv);
      channel?.unsubscribe();
      reject(new Error('Timeout ao aguardar PDF na nuvem.'));
    }, timeoutMs);

    const finishOk = (res: StatusPdfResponse & { ok: true }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearInterval(pollIv);
      channel?.unsubscribe();
      resolve(res);
    };

    const finishErr = (msg: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearInterval(pollIv);
      channel?.unsubscribe();
      reject(new Error(msg));
    };

    const poll = async () => {
      const st = await consultarPdfJob(jobId);
      if (!st.ok) {
        finishErr(st.error);
        return;
      }
      if (st.status === 'done' && st.signedUrl) {
        finishOk(st);
        return;
      }
      if (st.status === 'failed') {
        finishErr(st.error ?? 'Geração de PDF falhou na nuvem.');
      }
    };

    const channel = supabase
      .channel(`pdf-job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pdf_jobs',
          filter: `id=eq.${jobId}`,
        },
        () => {
          void poll();
        },
      )
      .subscribe();

    void poll();
    pollIv = window.setInterval(() => {
      if (settled) {
        window.clearInterval(pollIv);
        return;
      }
      void poll();
    }, 2000);
  });
}

export async function baixarPdfDeUrl(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download PDF falhou (${res.status}).`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function gerarPdfViaNuvem(
  tipo: PdfJobTipo,
  payload: unknown,
  fileName: string,
  timeoutMs: number,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const enq = await enqueuePdfJob(tipo, payload, fileName);
  if (!enq.ok) throw new Error(enq.error);

  const st = await aguardarPdfJobConcluido(enq.jobId, timeoutMs);
  if (!st.signedUrl) throw new Error('PDF concluído sem URL de download.');

  const bytes = await baixarPdfDeUrl(st.signedUrl);
  return { bytes, fileName: st.fileName ?? fileName };
}
