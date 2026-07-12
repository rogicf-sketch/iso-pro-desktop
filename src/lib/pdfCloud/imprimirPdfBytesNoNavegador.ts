/**
 * Impressão de PDF no browser: abre o diálogo sobre bytes PDF (blob),
 * alinhado ao «Guardar PDF» na nuvem — evita window.print() no HTML.
 */
export async function imprimirPdfBytesNoNavegador(
  bytes: Uint8Array,
  _fileName?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof document === 'undefined' || !document.body) {
    return { ok: false, error: 'Impressão indisponível neste ambiente.' };
  }

  if (bytes.length < 64) {
    return { ok: false, error: 'PDF vazio ou incompleto.' };
  }

  const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    let settled = false;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'I.S.O PRO — impressão PDF');
    iframe.style.cssText =
      'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;';

    const finish = (result: { ok: true } | { ok: false; error: string }) => {
      if (settled) return;
      settled = true;
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 120_000);
      resolve(result);
    };

    const tryPrint = () => {
      try {
        const w = iframe.contentWindow;
        if (!w) {
          window.open(url, '_blank', 'noopener,noreferrer');
          finish({ ok: true });
          return;
        }
        w.focus();
        w.print();
        finish({ ok: true });
      } catch (e) {
        finish({
          ok: false,
          error: e instanceof Error ? e.message : 'Não foi possível abrir a impressão.',
        });
      }
    };

    iframe.onload = () => window.setTimeout(tryPrint, 250);
    iframe.onerror = () => {
      window.open(url, '_blank', 'noopener,noreferrer');
      finish({ ok: true });
    };

    document.body.appendChild(iframe);
    iframe.src = url;
    window.setTimeout(() => {
      if (!settled) tryPrint();
    }, 10_000);
  });
}
