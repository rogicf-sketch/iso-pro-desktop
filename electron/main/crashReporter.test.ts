import { describe, expect, it } from 'vitest';
import { formatCrashEntry } from './crashReporter';

describe('formatCrashEntry', () => {
  const now = new Date('2026-07-19T12:00:00.000Z');

  it('serializa um Error com nome, mensagem e stack', () => {
    const err = new Error('boom');
    const line = formatCrashEntry('fatal', 'uncaughtException', err, undefined, now);
    expect(line.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe('fatal');
    expect(parsed.origin).toBe('uncaughtException');
    expect(parsed.ts).toBe('2026-07-19T12:00:00.000Z');
    expect(parsed.error.name).toBe('Error');
    expect(parsed.error.message).toBe('boom');
    expect(typeof parsed.error.stack).toBe('string');
  });

  it('serializa rejeicoes nao-Error (string/objeto) sem lancar', () => {
    const line = formatCrashEntry('error', 'unhandledRejection', 'falha textual', undefined, now);
    expect(JSON.parse(line).error.message).toBe('falha textual');

    const linhaObj = formatCrashEntry('error', 'unhandledRejection', { code: 500 }, undefined, now);
    expect(JSON.parse(linhaObj).error.message).toContain('500');
  });

  it('inclui o contexto quando fornecido', () => {
    const line = formatCrashEntry('warning', 'child-process-gone', 'gpu', { type: 'GPU', exitCode: 9 }, now);
    const parsed = JSON.parse(line);
    expect(parsed.context.type).toBe('GPU');
    expect(parsed.context.exitCode).toBe(9);
  });

  it('nao lanca em valores circulares', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => formatCrashEntry('error', 'x', circular, undefined, now)).not.toThrow();
  });
});
