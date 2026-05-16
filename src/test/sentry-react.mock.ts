import { vi } from 'vitest';

export const browserTracingIntegration = vi.fn(() => ({}));

export function init(options?: unknown): void {
  void options;
}

export function captureException(): void {}
