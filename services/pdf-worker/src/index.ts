import {
  claimNextJob,
  completeJob,
  failJob,
  uploadPdf,
  type PdfJobRow,
} from './supabaseAdmin.ts';
import { processPdfJob } from './handlers/index.ts';

const POLL_MS = Number(process.env.PDF_WORKER_POLL_MS ?? '2000');
const WORKER_ID = process.env.PDF_WORKER_ID ?? 'worker-1';

async function handleJob(job: PdfJobRow): Promise<void> {
  const storagePath = `${job.tenant_id}/${job.id}.pdf`;
  const fileName = job.file_name?.trim() || 'documento.pdf';

  console.log(`[${WORKER_ID}] job ${job.id} tipo=${job.tipo} tentativa=${job.attempts}`);

  const bytes = await processPdfJob(job.tipo, job.payload);
  if (!bytes?.length || bytes[0] !== 0x25 || bytes[1] !== 0x50) {
    throw new Error('PDF gerado inválido.');
  }

  await uploadPdf(storagePath, bytes);
  await completeJob(job.id, storagePath, fileName);
  console.log(`[${WORKER_ID}] job ${job.id} concluído (${bytes.length} bytes)`);
}

async function loopOnce(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  try {
    await handleJob(job);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const retry = job.attempts < job.max_attempts;
    console.error(`[${WORKER_ID}] job ${job.id} falhou:`, msg);
    await failJob(job.id, msg, retry);
  }
  return true;
}

async function main(): Promise<void> {
  console.log(`[${WORKER_ID}] pdf-worker iniciado (poll ${POLL_MS}ms)`);

  const shutdown = async () => {
    console.log(`[${WORKER_ID}] encerrando…`);
    try {
      const { closeHtmlBrowser } = await import('./handlers/htmlPaged.ts');
      await closeHtmlBrowser();
    } catch {
      /* worker só RIR — playwright opcional */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  for (;;) {
    try {
      const handled = await loopOnce();
      if (!handled) {
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    } catch (e) {
      console.error(`[${WORKER_ID}] erro no loop:`, e);
      await new Promise((r) => setTimeout(r, POLL_MS * 2));
    }
  }
}

void main();
