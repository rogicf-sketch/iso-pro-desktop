/**
 * Armazenamento local de blobs (fotos comprimidas) em IndexedDB.
 * Referências no formato `iso-media:<modulo>:...` ficam no JSON (localStorage / snapshot)
 * sem inflar a quota do localStorage.
 */

import { getAmbienteMediaDbSuffix } from './isoProAmbiente';

export const MEDIA_REF_PREFIX = 'iso-media:';

const DB_NAME_BASE = 'iso-pro-media-blobs-v1';
const STORE = 'blobs';
const DB_VERSION = 1;

function resolveMediaDbName(): string {
  return `${DB_NAME_BASE}${getAmbienteMediaDbSuffix()}`;
}

let cachedMediaDbName: string | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function openMediaDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB indisponivel neste ambiente.'));
  }
  const dbName = resolveMediaDbName();
  if (cachedMediaDbName !== dbName) {
    cachedMediaDbName = dbName;
    dbPromise = null;
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, DB_VERSION);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error ?? new Error('Falha ao abrir IndexedDB.'));
      };
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
    });
  }
  return dbPromise;
}

export async function mediaBlobPut(id: string, blob: Blob): Promise<void> {
  const db = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write'));
    tx.objectStore(STORE).put(blob, id);
  });
}

export async function mediaBlobGet(id: string): Promise<Blob | null> {
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read'));
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
  });
}

export async function mediaBlobDelete(id: string): Promise<void> {
  if (!id) return;
  const db = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete'));
    tx.objectStore(STORE).delete(id);
  });
}

/** Remove todas as chaves que começam com `prefix` (ex.: `iso-media:rf:uuid:`). */
export async function mediaBlobDeleteByPrefix(prefix: string): Promise<void> {
  if (!prefix) return;
  const db = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete prefix'));
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    req.onerror = () => reject(req.error ?? new Error('cursor'));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const key = String(cursor.key ?? '');
      if (key.startsWith(prefix)) {
        cursor.delete();
      }
      cursor.continue();
    };
  });
}

export function isMediaRefKey(s: string | undefined | null): boolean {
  return typeof s === 'string' && s.startsWith(MEDIA_REF_PREFIX);
}
