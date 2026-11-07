import type { DocumentPage } from './model';
import { readPrescriptionTable, type DocumentWord, type PrescriptionTableRow } from './tableLayout';

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
    const { PSM } = await import('tesseract.js');
    await ocr.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const { data } = await ocr.recognize(image, {}, { text: true, blocks: true });
    abortIfNeeded(signal);
    const words: DocumentWord[] = (data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.flatMap((line) => line.words.map((word) => ({ text: word.text, ...word.bbox }))),
      ),
    );
    return { text: data.text, words };
  };
  const readCells = async (canvas: HTMLCanvasElement, recognized: { text: string; words: DocumentWord[] }) => {
    const rows = readPrescriptionTable(recognized.words);
    if (!rows?.length) return recognized;
    const tableRows: PrescriptionTableRow[] = [];
    const { PSM } = await import('tesseract.js');
    for (const [index, row] of rows.entries()) {
      abortIfNeeded(signal);
      const box = row.regimenBox;
      if (!box) {
        tableRows.push(row);
        continue;
      }
      const left = Math.max(0, Math.floor(box.x0)),
        top = Math.max(0, Math.floor(box.y0));
      const width = Math.min(canvas.width, Math.ceil(box.x1)) - left,
        height = Math.min(canvas.height, Math.ceil(box.y1)) - top;
      if (width < 8 || height < 8) {
        tableRows.push(row);
        continue;
      }
      progress(`Revisando posología local ${index + 1} de ${rows.length}…`);
      const cell = document.createElement('canvas');
      cell.width = width;
      cell.height = height;
      const enlarged = document.createElement('canvas');
      const scale = Math.min(3, Math.sqrt(MAX_PIXELS / (width * height)));
      enlarged.width = Math.floor(width * scale);
      enlarged.height = Math.floor(height * scale);
      try {
        const ctx = cell.getContext('2d')!;
        ctx.drawImage(canvas, left, top, width, height, 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height);
        const dark = (x: number, y: number) =>
          pixels.data[(y * width + x) * 4] < 100 &&
          pixels.data[(y * width + x) * 4 + 1] < 100 &&
          pixels.data[(y * width + x) * 4 + 2] < 100;
        const horizontal: number[] = [],
          vertical: number[] = [];
        for (let y = 0; y < height; y++) {
          let count = 0;
          for (let x = 0; x < width; x++) if (dark(x, y)) count++;
          if (count > width * 0.85) horizontal.push(y);
        }
        for (let x = 0; x < width; x++) {
          let count = 0;
          for (let y = 0; y < height; y++) if (dark(x, y)) count++;
          if (count > height * 0.85) vertical.push(x);
        }
        ctx.fillStyle = 'white';
        for (const y of horizontal) ctx.fillRect(0, y - 1, width, 3);
        for (const x of vertical) ctx.fillRect(x - 1, 0, 3, height);
        const enlargedCtx = enlarged.getContext('2d')!;
        enlargedCtx.fillStyle = 'white';
        enlargedCtx.fillRect(0, 0, enlarged.width, enlarged.height);
        enlargedCtx.drawImage(cell, 0, 0, enlarged.width, enlarged.height);
        await ocr!.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
        const { data } = await ocr!.recognize(enlarged, {}, { text: true, blocks: false });
        abortIfNeeded(signal);
        const regimen = data.text.trim() || row.regimen;
        tableRows.push({ ...row, regimen, original: `${row.original}\n${regimen}` });
      } catch {
        abortIfNeeded(signal);
        tableRows.push(row); // Keep the initial reading available for manual review.
      } finally {
        cell.width = cell.height = 0;
        enlarged.width = enlarged.height = 0;
      }
    }
    return { ...recognized, tableRows };
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
          return [{ page: 1, ...(await readCells(canvas, await recognize(canvas))), method: 'ocr' }];
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
        const words: DocumentWord[] = [];
        let y: number | undefined;
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const nextY = item.transform[5];
          const height = Math.abs(item.height) || 10;
          for (const match of item.str.matchAll(/\S+/g)) {
            words.push({
              text: match[0],
              x0: item.transform[4] + (item.width * match.index!) / Math.max(item.str.length, 1),
              x1: item.transform[4] + (item.width * (match.index! + match[0].length)) / Math.max(item.str.length, 1),
              y0: page.view[3] - nextY - height,
              y1: page.view[3] - nextY,
            });
          }
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
            const nativeTable = readPrescriptionTable(words),
              ocrTable = readPrescriptionTable(recognized.words);
            // A page must use one coherent layout: concatenating two readings duplicates rows
            // and separates posology from its medication. Prefer selectable table text when complete.
            if (nativeTable?.length && (!ocrTable?.length || nativeTable.length >= ocrTable.length))
              result.push({ page: n, text, words, method: 'text' });
            else if (!recognized.text.trim() && text.trim()) result.push({ page: n, text, words, method: 'text' });
            else result.push({ page: n, ...(await readCells(canvas, recognized)), method: 'ocr' });
          } finally {
            canvas.width = canvas.height = 0;
          }
        } else result.push({ page: n, text, words, method: 'text' });
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
