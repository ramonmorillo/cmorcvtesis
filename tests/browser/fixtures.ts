// All content is synthetic. Minimal PDF fixtures are generated rather than checked in.
function pdf(objects: Buffer[]): Buffer {
  const chunks = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let size = chunks[0].length;
  objects.forEach((object, i) => {
    offsets.push(size);
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]);
    chunks.push(chunk);
    size += chunk.length;
  });
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
        .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`,
    ),
  );
  return Buffer.concat(chunks);
}
export function textPdf(pages: string[][]): Buffer {
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from(
      `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    ),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ];
  pages.forEach((lines) => {
    const pageId = objects.length + 1,
      contentId = pageId + 1;
    objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 700] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
    const content = lines
      .map((line, i) => `BT /F1 16 Tf 30 ${650 - i * 35} Td (${line.replace(/[()\\]/g, '\\$&')}) Tj ET`)
      .join('\n');
    objects.push(Buffer.from(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`));
  });
  return pdf(objects);
}
export function scannedPdf(jpeg: Buffer, width = 1600, height = 700): Buffer {
  const content = `q 900 0 0 ${(900 * height) / width} 0 100 cm /Im1 Do Q`;
  return pdf([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 700] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>',
    ),
    Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      Buffer.from('\nendstream'),
    ]),
  ]);
}

export type SyntheticTextCell = { text: string; x: number; y: number };
export function positionedTextPdf(cells: SyntheticTextCell[], width = 1800, height = 1000): Buffer {
  const content = cells
    .map(
      (cell) =>
        `BT /F1 20 Tf ${cell.x} ${height - cell.y} Td (${cell.text
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[()\\]/g, '\\$&')}) Tj ET`,
    )
    .join('\n');
  return pdf([
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    ),
    Buffer.from(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ]);
}
