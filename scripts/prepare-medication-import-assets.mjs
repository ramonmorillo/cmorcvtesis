import { cp, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const dest = path.join(root, 'public/medication-import');
await mkdir(dest, { recursive: true });
const copy = (from, to) => copyFile(path.join(root, 'node_modules', from), path.join(dest, to));
await copy('tesseract.js/dist/worker.min.js', 'ocr-worker.min.js');
await copy('@tesseract.js-data/spa/4.0.0/spa.traineddata.gz', 'spa.traineddata.gz');
await cp(path.join(root, 'node_modules/tesseract.js-core'), path.join(dest, 'core'), { recursive: true });
await cp(path.join(root, 'node_modules/pdfjs-dist/cmaps'), path.join(dest, 'cmaps'), { recursive: true });
await cp(path.join(root, 'node_modules/pdfjs-dist/standard_fonts'), path.join(dest, 'standard_fonts'), {
  recursive: true,
});
await cp(path.join(root, 'node_modules/pdfjs-dist/wasm'), path.join(dest, 'wasm'), { recursive: true });
for (const [from, name] of [
  ['pdfjs-dist/LICENSE', 'LICENSE-pdfjs'],
  ['tesseract.js/LICENSE.md', 'LICENSE-tesseract'],
  ['tesseract.js-core/LICENSE', 'LICENSE-tesseract-core'],
]) {
  await copy(from, name);
}
console.log('Recursos locales de PDF/OCR preparados.');
