import type { DocumentPage } from './model';

export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PAGES = 10;
export const MAX_PIXELS = 12_000_000;
const resources = () => new URL(`${import.meta.env.BASE_URL}medication-import/`, window.location.origin).href;
export function validateDocument(file: File): 'pdf' | 'image' {
  if (!file.size || file.size > MAX_BYTES) throw Error('El documento debe ocupar entre 1 byte y 20 MB.');
  if (file.type === 'application/pdf' && /\.pdf$/i.test(file.name)) return 'pdf';
  if (/^image\/(jpeg|png)$/.test(file.type) && /\.(png|jpe?g)$/i.test(file.name)) return 'image';
  throw Error('Selecciona un PDF, JPG, JPEG o PNG válido.');
}
function abortIfNeeded(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Cancelado', 'AbortError');
}
export async function extractDocument(
  file: File,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<DocumentPage[]> {
  const kind = validateDocument(file);
  abortIfNeeded(signal);
  let ocr: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | undefined;
  let pdfTask: ReturnType<(typeof import('pdfjs-dist'))['getDocument']> | undefined;
  const stop = () => {
    void ocr?.terminate().catch(() => {});
    void pdfTask?.destroy().catch(() => {});
  };
  signal.addEventListener('abort', stop, { once: true });
  const recognize = async (image: HTMLCanvasElement) => {
    abortIfNeeded(signal);
    if (!ocr) {
      progress('Preparando OCR local en español…');
      const { createWorker } = await import('tesseract.js');
      abortIfNeeded(signal);
      ocr = await createWorker('spa', 1, {
        workerPath: `${resources()}ocr-worker.min.js`,
        corePath: `${resources()}core/`,
        langPath: resources(),
        workerBlobURL: false,
        cacheMethod: 'none',
        gzip: true,
        logger: () => {},
        errorHandler: () => {},
      });
      abortIfNeeded(signal);
    }
    const { data } = await ocr.recognize(image);
    abortIfNeeded(signal);
    return data.text;
  };
  try {
    if (kind === 'image') {
      progress('Leyendo imagen local…');
      const bitmap = await createImageBitmap(file);
      try {
        abortIfNeeded(signal);
        if (bitmap.width * bitmap.height > MAX_PIXELS) throw Error('Imagen demasiado grande (máximo 12 megapíxeles).');
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        try {
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
          return [{ page: 1, text: await recognize(canvas), method: 'ocr' }];
        } finally {
          canvas.width = canvas.height = 0;
        }
      } finally {
        bitmap.close();
      }
    }
    const pdfjs = await import('pdfjs-dist');
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    abortIfNeeded(signal);
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    pdfTask = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      cMapUrl: `${resources()}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${resources()}standard_fonts/`,
      wasmUrl: `${resources()}wasm/`,
      useSystemFonts: true,
      disableFontFace: true,
    });
    // Reject password-protected files rather than retaining passwords or opening prompts.
    pdfTask.onPassword = () => {
      void pdfTask?.destroy();
    };
    const pdf = await pdfTask.promise;
    abortIfNeeded(signal);
    if (pdf.numPages > MAX_PAGES) throw Error('Máximo 10 páginas por documento.');
    const result: DocumentPage[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      abortIfNeeded(signal);
      progress(`Procesando página ${n} de ${pdf.numPages}…`);
      const page = await pdf.getPage(n);
      try {
        const content = await page.getTextContent();
        let text = '';
        let y: number | undefined;
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const nextY = item.transform[5];
          if (y !== undefined && Math.abs(nextY - y) > 3 && !text.endsWith('\n')) text += '\n';
          text += item.str + (item.hasEOL ? '\n' : ' ');
          y = nextY;
        }
        // Image-backed/mixed pages are also OCRed so a selectable header cannot hide a scanned prescription.
        const operators = await page.getOperatorList();
        const hasImages = operators.fnArray.some((op) =>
          [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject].includes(
            op,
          ),
        );
        if (hasImages || !text.trim()) {
          const unscaled = page.getViewport({ scale: 1 });
          const scale = Math.min(2.5, Math.sqrt(MAX_PIXELS / (unscaled.width * unscaled.height)));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          try {
            await page.render({ canvas, viewport }).promise;
            const recognized = await recognize(canvas);
            text =
              hasImages && text.trim()
                ? [
                    ...new Set(
                      [...text.split('\n'), ...recognized.split('\n')].map((line) => line.trim()).filter(Boolean),
                    ),
                  ].join('\n')
                : recognized;
            result.push({ page: n, text, method: 'ocr' });
          } finally {
            canvas.width = canvas.height = 0;
          }
        } else result.push({ page: n, text, method: 'text' });
      } finally {
        page.cleanup();
      }
    }
    return result;
  } finally {
    signal.removeEventListener('abort', stop);
    await ocr?.terminate().catch(() => {});
    await pdfTask?.destroy().catch(() => {});
  }
}
