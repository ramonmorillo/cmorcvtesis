// Motor de maquetación PDF para informes clínicos (sin dependencias, 100 % en navegador).
// Mejora respecto al generador simple de reportService.ts: negritas, jerarquía de
// encabezados, ajuste de línea por anchura real (métricas Helvetica), bloques que no
// se cortan entre páginas, encabezado/pie consistentes, "Página X de N" y sin páginas
// vacías. No sustituye a los informes existentes.

export type TextSegment = { text: string; bold?: boolean };

export type DocBlock =
  | { kind: 'title'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'paragraph'; segments: TextSegment[]; size?: number }
  | { kind: 'bullet'; segments: TextSegment[] }
  | { kind: 'callout'; segments: TextSegment[] }
  | { kind: 'spacer'; height: number }
  | { kind: 'signatureSpace'; height: number }
  | { kind: 'group'; blocks: DocBlock[]; keepTogether: boolean };

export type DocHeaderFooter = {
  headerTitle: string;
  headerSubtitle: string;
  footerLeft: string;
};

type DrawText = { type: 'text'; x: number; y: number; size: number; bold: boolean; text: string };
type DrawLine = { type: 'line'; x1: number; y1: number; x2: number; y2: number; width: number; gray: number };
type DrawRect = { type: 'rect'; x: number; y: number; w: number; h: number; gray: number };
export type DrawOp = DrawText | DrawLine | DrawRect;

export type LaidOutPage = { body: DrawOp[]; chrome: DrawOp[] };

// A4 en puntos.
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 56;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const CONTENT_TOP = PAGE_H - 90; // bajo el encabezado
const CONTENT_BOTTOM = 64; // sobre el pie
const BODY_SIZE = 10.5;
const LEADING = 1.32;

// Anchuras AFM (1/1000 em) de Helvetica y Helvetica-Bold para ASCII 32..126.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
  584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
  584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584,
];

// Caracteres Unicode -> WinAnsi (cp1252) para los que no coinciden con Latin-1.
const WIN_ANSI_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
};
const REPLACEMENTS: Record<string, string> = { '≥': '>=', '≤': '<=', '→': '->', ' ': ' ', ' ': ' ', ' ': ' ' };

export function toWinAnsi(text: string): string {
  let out = '';
  for (const char of text.replace(/[\r\t]/g, ' ')) {
    const replaced = REPLACEMENTS[char];
    if (replaced !== undefined) {
      out += replaced;
      continue;
    }
    const code = char.codePointAt(0) ?? 63;
    if (WIN_ANSI_EXTRA[char] !== undefined) out += String.fromCharCode(WIN_ANSI_EXTRA[char]);
    else if (code >= 32 && code <= 126) out += char;
    else if (code >= 160 && code <= 255) out += char;
    else out += '?';
  }
  return out;
}

function charWidth(char: string, bold: boolean): number {
  const code = char.charCodeAt(0);
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  if (code >= 32 && code <= 126) return table[code - 32];
  if (code >= 192 && code <= 255) {
    const base = char.normalize('NFD').charAt(0);
    const baseCode = base.charCodeAt(0);
    if (baseCode >= 32 && baseCode <= 126) return table[baseCode - 32];
  }
  if (code === 0x95) return 350;
  return 556;
}

export function measureText(text: string, size: number, bold: boolean): number {
  let width = 0;
  for (const char of text) width += charWidth(char, bold);
  return (width / 1000) * size;
}

type Word = { text: string; bold: boolean };
type Line = { words: Word[] };

/** Ajuste de línea por anchura real, respetando segmentos en negrita. */
export function wrapSegments(segments: TextSegment[], size: number, maxWidth: number): Line[] {
  const words: Word[] = [];
  for (const segment of segments) {
    const encoded = toWinAnsi(segment.text);
    for (const piece of encoded.split(/(\s+)/)) {
      if (!piece || /^\s+$/.test(piece)) continue;
      words.push({ text: piece, bold: Boolean(segment.bold) });
    }
  }
  if (words.length === 0) return [];

  const space = measureText(' ', size, false);
  const lines: Line[] = [];
  let current: Word[] = [];
  let width = 0;
  for (const word of words) {
    const wordWidth = measureText(word.text, size, word.bold);
    const extra = current.length === 0 ? wordWidth : space + wordWidth;
    if (current.length > 0 && width + extra > maxWidth) {
      lines.push({ words: current });
      current = [word];
      width = wordWidth;
    } else {
      current.push(word);
      width += extra;
    }
  }
  if (current.length > 0) lines.push({ words: current });
  return lines;
}

function lineOps(line: Line, x: number, y: number, size: number): DrawText[] {
  const ops: DrawText[] = [];
  const space = measureText(' ', size, false);
  let cursor = x;
  // Agrupa palabras consecutivas con el mismo estilo en un único texto.
  let run: Word[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const text = run.map((word) => word.text).join(' ');
    ops.push({ type: 'text', x: cursor, y, size, bold: run[0].bold, text });
    cursor += measureText(text, size, run[0].bold) + space;
    run = [];
  };
  for (const word of line.words) {
    if (run.length > 0 && run[0].bold !== word.bold) flush();
    run.push(word);
  }
  flush();
  return ops;
}

// --- Medición de bloques (alto) y dibujo -------------------------------------

type Placed = { height: number; draw: (topY: number) => DrawOp[] };

function textBlock(segments: TextSegment[], size: number, indent: number, gapBefore: number, gapAfter: number, bullet = false): Placed {
  const lines = wrapSegments(segments, size, CONTENT_W - indent);
  const lineHeight = size * LEADING;
  return {
    height: gapBefore + lines.length * lineHeight + gapAfter,
    draw: (topY) => {
      const ops: DrawOp[] = [];
      lines.forEach((line, index) => {
        const baseline = topY - gapBefore - size - index * lineHeight;
        if (bullet && index === 0) ops.push({ type: 'text', x: MARGIN_X + indent - 11, y: baseline, size, bold: false, text: toWinAnsi('•') });
        ops.push(...lineOps(line, MARGIN_X + indent, baseline, size));
      });
      return ops;
    },
  };
}

function placeBlock(block: Exclude<DocBlock, { kind: 'group' }>): Placed {
  switch (block.kind) {
    case 'title': {
      const inner = textBlock([{ text: block.text, bold: true }], 15, 0, 0, 6);
      return {
        height: inner.height + 10,
        draw: (topY) => [
          ...inner.draw(topY),
          { type: 'line', x1: MARGIN_X, y1: topY - inner.height, x2: PAGE_W - MARGIN_X, y2: topY - inner.height, width: 1.2, gray: 0.15 },
        ],
      };
    }
    case 'heading': {
      const inner = textBlock([{ text: block.text, bold: true }], 12.5, 0, 11, 4);
      return {
        height: inner.height + 2,
        draw: (topY) => [
          ...inner.draw(topY),
          { type: 'line', x1: MARGIN_X, y1: topY - inner.height + 1, x2: PAGE_W - MARGIN_X, y2: topY - inner.height + 1, width: 0.5, gray: 0.7 },
        ],
      };
    }
    case 'subheading':
      return textBlock([{ text: block.text, bold: true }], 11, 0, 9, 3);
    case 'paragraph':
      return textBlock(block.segments, block.size ?? BODY_SIZE, 0, 2, 2);
    case 'bullet':
      return textBlock(block.segments, BODY_SIZE, 14, 1, 1, true);
    case 'callout': {
      const inner = textBlock(block.segments, BODY_SIZE + 0.5, 12, 6, 6);
      return {
        height: inner.height + 6,
        draw: (topY) => [
          { type: 'rect', x: MARGIN_X, y: topY - inner.height - 3, w: CONTENT_W, h: inner.height, gray: 0.94 },
          { type: 'rect', x: MARGIN_X, y: topY - inner.height - 3, w: 3, h: inner.height, gray: 0.35 },
          ...inner.draw(topY - 3),
        ],
      };
    }
    case 'spacer':
    case 'signatureSpace':
      return { height: block.height, draw: () => [] };
  }
}

const CONTENT_HEIGHT = CONTENT_TOP - CONTENT_BOTTOM;

function flatten(blocks: DocBlock[]): Array<{ placed: Placed[]; keepTogether: boolean; isHeading: boolean; isSpacer: boolean }> {
  return blocks.map((block) => {
    if (block.kind === 'group') {
      return {
        placed: block.blocks.map((inner) => (inner.kind === 'group' ? flatten([inner])[0].placed : [placeBlock(inner)])).flat(),
        keepTogether: block.keepTogether,
        isHeading: false,
        isSpacer: false,
      };
    }
    return {
      placed: [placeBlock(block)],
      keepTogether: false,
      isHeading: block.kind === 'heading' || block.kind === 'subheading',
      isSpacer: block.kind === 'spacer',
    };
  });
}

/** Distribuye bloques en páginas. Nunca crea páginas vacías. */
export function layoutDocument(blocks: DocBlock[], chrome: DocHeaderFooter): LaidOutPage[] {
  const pages: DrawOp[][] = [];
  let current: DrawOp[] = [];
  let y = CONTENT_TOP;

  const newPage = () => {
    if (current.length > 0) pages.push(current);
    current = [];
    y = CONTENT_TOP;
  };
  const remaining = () => y - CONTENT_BOTTOM;
  const put = (placed: Placed) => {
    current.push(...placed.draw(y));
    y -= placed.height;
  };

  const units = flatten(blocks);
  units.forEach((unit, index) => {
    if (unit.isSpacer && current.length === 0) return; // sin espacios al inicio de página
    const total = unit.placed.reduce((sum, placed) => sum + placed.height, 0);

    // Un encabezado no queda huérfano: exige sitio para él y el comienzo del bloque siguiente.
    if (unit.isHeading) {
      const next = units[index + 1];
      const nextNeed = next ? (next.keepTogether ? Math.min(next.placed.reduce((s, p) => s + p.height, 0), 60) : (next.placed[0]?.height ?? 0)) : 0;
      if (current.length > 0 && total + Math.min(nextNeed, 60) > remaining()) newPage();
      put(unit.placed[0]);
      return;
    }

    if (unit.keepTogether && total <= CONTENT_HEIGHT && total > remaining() && current.length > 0) newPage();

    for (const placed of unit.placed) {
      if (placed.height > remaining() && current.length > 0) newPage();
      put(placed);
    }
  });
  if (current.length > 0) pages.push(current);

  const totalPages = pages.length;
  return pages.map((body, index) => ({
    body,
    chrome: [
      { type: 'text', x: MARGIN_X, y: PAGE_H - 50, size: 10, bold: true, text: toWinAnsi(chrome.headerTitle) },
      { type: 'text', x: MARGIN_X, y: PAGE_H - 63, size: 8.5, bold: false, text: toWinAnsi(chrome.headerSubtitle) },
      { type: 'line', x1: MARGIN_X, y1: PAGE_H - 72, x2: PAGE_W - MARGIN_X, y2: PAGE_H - 72, width: 0.6, gray: 0.6 },
      { type: 'line', x1: MARGIN_X, y1: 46, x2: PAGE_W - MARGIN_X, y2: 46, width: 0.6, gray: 0.6 },
      { type: 'text', x: MARGIN_X, y: 34, size: 8, bold: false, text: toWinAnsi(chrome.footerLeft) },
      (() => {
        const label = toWinAnsi(`Página ${index + 1} de ${totalPages}`);
        return { type: 'text', x: PAGE_W - MARGIN_X - measureText(label, 8, false), y: 34, size: 8, bold: false, text: label } as DrawText;
      })(),
    ],
  }));
}

// --- Serialización PDF ---------------------------------------------------------

function escapePdf(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function fmt(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function opsToStream(ops: DrawOp[]): string {
  return ops
    .map((op) => {
      if (op.type === 'text') return `BT /${op.bold ? 'F2' : 'F1'} ${fmt(op.size)} Tf ${fmt(op.x)} ${fmt(op.y)} Td (${escapePdf(op.text)}) Tj ET`;
      if (op.type === 'line') return `q ${fmt(op.gray)} G ${fmt(op.width)} w ${fmt(op.x1)} ${fmt(op.y1)} m ${fmt(op.x2)} ${fmt(op.y2)} l S Q`;
      return `q ${fmt(op.gray)} g ${fmt(op.x)} ${fmt(op.y)} ${fmt(op.w)} ${fmt(op.h)} re f Q`;
    })
    .join('\n');
}

export function serializePdf(pages: LaidOutPage[], title: string): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length; // id = índice 1-based
  };
  const catalogId = add('');
  const pagesId = add('');
  const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const infoId = add(`<< /Title (${escapePdf(toWinAnsi(title))}) /Producer (IRIS-CMO) >>`);

  const pageIds: number[] = [];
  for (const page of pages) {
    const stream = `${opsToStream([...page.chrome, ...page.body])}\n`;
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let output = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(output.length);
  for (let index = 0; index < output.length; index += 1) bytes[index] = output.charCodeAt(index) & 0xff;
  return bytes;
}
