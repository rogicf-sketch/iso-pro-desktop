/** Estado da última validação de sessão contra a nuvem (refresh periódico). */

import { useEffect, useState } from 'react';

let lastCloudValidationOkAt = 0;
let cloudValidationStale = false;

const STALE_AFTER_MS = 5 * 60 * 1000;
const listeners = new Set<() => void>();

function notifySessionCloudHealthListeners(): void {
  for (const fn of listeners) fn();
}

export function subscribeSessionCloudHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markSessionCloudValidationOk(): void {
  lastCloudValidationOkAt = Date.now();
  cloudValidationStale = false;
  notifySessionCloudHealthListeners();
}

export function markSessionCloudValidationStale(): void {
  cloudValidationStale = true;
  notifySessionCloudHealthListeners();
}

export function isSessionCloudValidationStale(): boolean {
  if (cloudValidationStale) return true;
  if (!lastCloudValidationOkAt) return false;
  return Date.now() - lastCloudValidationOkAt > STALE_AFTER_MS;
}

export function resetSessionCloudHealth(): void {
  lastCloudValidationOkAt = 0;
  cloudValidationStale = false;
  notifySessionCloudHealthListeners();
}

export function useSessionCloudValidationStale(): boolean {
  const [, tick] = useState(0);
  useEffect(() => subscribeSessionCloudHealth(() => tick((n) => n + 1)), []);
  return isSessionCloudValidationStale();
}
