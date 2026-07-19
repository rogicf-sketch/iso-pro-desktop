import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Observabilidade do processo principal do Electron.
 *
 * Antes: uma exceção não tratada no main process (IPC de PDF, backup, mail…)
 * derrubava a app sem deixar rasto. Agora ficam num log rotativo em
 * `userData/logs/main-process.log`, mesmo offline, para diagnóstico na obra.
 */

export type CrashLevel = 'fatal' | 'error' | 'warning';

const MAX_LOG_BYTES = 512 * 1024; // 512 KB — mantém o ficheiro leve para enviar por email.

/** Serializa um erro/evento numa linha de log. Puro e testável (sem I/O). */
export function formatCrashEntry(
  level: CrashLevel,
  origin: string,
  error: unknown,
  context?: Record<string, unknown>,
  now: Date = new Date(),
): string {
  const err =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: typeof error === 'string' ? error : safeJson(error) };
  const payload = {
    ts: now.toISOString(),
    level,
    origin,
    error: err,
    ...(context ? { context } : {}),
  };
  return `${safeJson(payload)}\n`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function logFilePath(): string {
  return path.join(app.getPath('userData'), 'logs', 'main-process.log');
}

/** Roda o ficheiro quando passa do limite, guardando um `.1` anterior. */
function rotateIfNeeded(file: string): void {
  try {
    const stat = fs.statSync(file);
    if (stat.size <= MAX_LOG_BYTES) return;
    const previous = `${file}.1`;
    try {
      fs.rmSync(previous, { force: true });
    } catch {
      /* ignore */
    }
    fs.renameSync(file, previous);
  } catch {
    /* ficheiro ainda não existe — nada a rodar */
  }
}

let installed = false;

/** Escreve uma entrada no log do main process (best-effort, nunca lança). */
export function logMainProcessEvent(
  level: CrashLevel,
  origin: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const line = formatCrashEntry(level, origin, error, context);
  try {
    const file = logFilePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotateIfNeeded(file);
    fs.appendFileSync(file, line, 'utf8');
  } catch {
    /* sem disco — não há mais o que fazer */
  }
  if (level === 'warning') {
    console.warn('[I.S.O PRO main]', origin, error);
  } else {
    console.error('[I.S.O PRO main]', origin, error);
  }
}

/**
 * Instala os handlers globais do processo principal. Idempotente.
 * `uncaughtException`/`unhandledRejection` deixam de matar a app em silêncio.
 */
export function initMainProcessCrashReporter(): void {
  if (installed) return;
  installed = true;

  process.on('uncaughtException', (error) => {
    logMainProcessEvent('fatal', 'uncaughtException', error);
  });

  process.on('unhandledRejection', (reason) => {
    logMainProcessEvent('error', 'unhandledRejection', reason);
  });

  app.on('render-process-gone', (_event, _webContents, details) => {
    logMainProcessEvent('error', 'render-process-gone', details.reason, {
      exitCode: details.exitCode,
    });
  });

  app.on('child-process-gone', (_event, details) => {
    logMainProcessEvent('error', 'child-process-gone', details.reason, {
      type: details.type,
      exitCode: details.exitCode,
    });
  });
}
