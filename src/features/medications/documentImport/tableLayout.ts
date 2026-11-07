// Coordinates remain local to the current review, just like the extracted text.
export type DocumentWord = { text: string; x0: number; y0: number; x1: number; y1: number };
export type PrescriptionTableRow = {
  original: string;
  medication: string;
  regimen: string;
  regimenBox?: { x0: number; y0: number; x1: number; y1: number };
};
const token = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
const centerY = (word: DocumentWord) => (word.y0 + word.y1) / 2;
const centerX = (word: DocumentWord) => (word.x0 + word.x1) / 2;
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
export function wordsToLines(words: DocumentWord[]): string {
  const height = median(words.map((word) => word.y1 - word.y0)) || 10;
  const lines: { y: number; words: DocumentWord[] }[] = [];
  for (const word of [...words].sort((a, b) => centerY(a) - centerY(b) || a.x0 - b.x0)) {
    const line = lines.find((candidate) => Math.abs(candidate.y - centerY(word)) < height * 0.6);
    if (line) {
      line.words.push(word);
      line.y = median(line.words.map(centerY));
    } else lines.push({ y: centerY(word), words: [word] });
  }
  return lines
    .sort((a, b) => a.y - b.y)
    .map((line) =>
      line.words
        .sort((a, b) => a.x0 - b.x0)
        .map((word) => word.text)
        .join(' '),
    )
    .join('\n');
}

// Only activate this layout when the document explicitly identifies its prescription
// and posology columns and contains medicine codes. Do not guess a table from arbitrary text.
export function readPrescriptionTable(input: DocumentWord[]): PrescriptionTableRow[] | null {
  const words = input.filter((word) => word.text.trim() && [word.x0, word.x1, word.y0, word.y1].every(Number.isFinite));
  const heading = words.find((word) => token(word.text).startsWith('posologia'));
  const description = words.find(
    (word) => token(word.text).startsWith('prescripciones') || token(word.text).startsWith('instrucciones'),
  );
  if (!heading || !description || heading.x0 <= description.x0) return null;
  const height = median(words.map((word) => word.y1 - word.y0)) || 10;
  const dateHeading = words
    .filter((word) => token(word.text) === 'fecha' && word.x0 > heading.x1)
    .sort((a, b) => a.x0 - b.x0)[0];
  const dates = words.filter((word) => /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(word.text) && word.x0 > heading.x1);
  const regimenRight = dates.length ? Math.min(...dates.map((word) => word.x0)) - height * 0.4 : dateHeading?.x0;
  if (!regimenRight) return null;
  const anchors = words.filter(
    (word) => /^\d{6}(?:[A-ZÁÉÍÓÚÑ].*)?$/i.test(word.text) && word.y0 > heading.y1 && word.x0 < heading.x0,
  );
  if (!anchors.length) return null;
  // Medicine codes align vertically; exclude any coincidental six-digit value in other columns.
  const medicationLeft = median(anchors.map((word) => word.x0));
  const starts = anchors.filter((word) => Math.abs(word.x0 - medicationLeft) < height * 2).sort((a, b) => a.y0 - b.y0);
  const typicalGap = median(starts.slice(1).map((word, index) => word.y0 - starts[index].y0));
  if (starts.some((word, index) => index > 0 && word.y0 - starts[index - 1].y0 < height * 1.7)) return null;
  const nearPosology = (word: DocumentWord) =>
    word.y0 > heading.y1 &&
    Math.abs(centerX(word) - centerX(heading)) < Math.max(heading.x1 - heading.x0, regimenRight - centerX(heading));
  const quantities = words.filter(
    (word) =>
      nearPosology(word) &&
      /^\d+(?:[.,/]\d+)?$/.test(word.text) &&
      words.some(
        (unit) =>
          /^(?:capsulas?|comprimidos?|sobres?|gotas?|ml|mg)$/i.test(token(unit.text)) &&
          nearPosology(unit) &&
          Math.abs(centerY(unit) - centerY(word)) < height * 0.7 &&
          unit.x0 >= word.x1 &&
          unit.x0 - word.x1 < height * 2,
      ),
  );
  const regimenLeft = quantities.length
    ? Math.min(...quantities.map((word) => word.x0)) - height * 0.5
    : heading.x0 - height;
  const rowTop = (word: DocumentWord) =>
    word.y0 - Math.min(typicalGap > 0 ? typicalGap * 0.35 : height * 1.5, height * 1.5);
  return starts.map((anchor, index) => {
    const top = rowTop(anchor),
      bottom = starts[index + 1] ? rowTop(starts[index + 1]) : anchor.y1 + Math.max(typicalGap * 0.65, height * 3);
    const row = words.filter((word) => centerY(word) >= top && centerY(word) < bottom);
    const medication = wordsToLines(
      row.filter((word) => centerX(word) >= medicationLeft - height && centerX(word) < regimenLeft),
    );
    const regimen = wordsToLines(row.filter((word) => centerX(word) >= regimenLeft && centerX(word) < regimenRight));
    return {
      original: wordsToLines(row),
      medication,
      regimen,
      regimenBox: { x0: regimenLeft, y0: top, x1: regimenRight - height * 0.6, y1: bottom - height * 0.6 },
    };
  });
}
