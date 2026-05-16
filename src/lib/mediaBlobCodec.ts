/** Converte data URL para `Blob` (útil antes de gravar no IndexedDB). */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Converte `Blob` em data URL JPEG/PNG… (para impressão HTML / envio à nuvem). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error ?? new Error('FileReader'));
    fr.readAsDataURL(blob);
  });
}
