import { getEngine, type Bytes } from "./pdf-engine";

export type MarkdownLine = { text: string; size: number; bold: boolean; box: [number, number, number, number]; block: number };
export type MarkdownPage = { index: number; height: number; lines: MarkdownLine[]; fromOcr?: boolean };
export type MarkdownOptions = { removeRepeated: boolean; pageMarkers: boolean };
export type MarkdownResult = { text: string; emptyPages: number[]; unreadablePages: number[]; removedLines: number; words: number };

export function markdownPageNeedsOcr(page: MarkdownPage): boolean {
  const text = page.lines.map(line => line.text).join("\n");
  if (!text.trim()) return true;
  // A PDF can draw Arabic correctly while its text mapping returns Latin I's,
  // replacement characters or private glyph codes. Nonempty text is not proof
  // that extraction succeeded; these pages need recognition from their image.
  return /[\uFFFD\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u.test(text)
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)
    || /I{4,}|l{5,}|i{5,}/.test(text);
}

export async function readMarkdownPages(bytes: Bytes, indices: number[], progress: (value: number) => void = () => {}): Promise<MarkdownPage[]> {
  const m = await getEngine();
  const doc = new m.PDFDocument(bytes);
  const result: MarkdownPage[] = [];
  try {
    if (doc.needsPassword()) throw new Error("افتح الملف المحمي أولاً.");
    if (!indices.length || indices.length > 250 || indices.some(index => !Number.isInteger(index) || index < 0 || index >= doc.countPages())) throw new Error("نطاق الصفحات خارج المستند.");
    for (const [position, index] of indices.entries()) {
      const page = doc.loadPage(index);
      try {
        const bounds = page.getBounds();
        const structured = page.toStructuredText("preserve-whitespace");
        const lines: MarkdownLine[] = [];
        let block = 0, current: MarkdownLine | null = null, chars = 0, boldChars = 0;
        try {
          structured.walk({
            beginTextBlock: () => { block++; },
            beginLine: box => { current = { text: "", size: 0, bold: false, box: [box[0] - bounds[0], box[1] - bounds[1], box[2] - bounds[0], box[3] - bounds[1]], block }; chars = 0; boldChars = 0; },
            onChar: (char, _origin, font, size) => {
              if (!current) return;
              current.text += char;
              if (char.trim()) { current.size += size; chars++; if (/bold|black|heavy|semibold/i.test(font.getName())) boldChars++; }
            },
            endLine: () => {
              if (current?.text.trim()) { current.size = chars ? current.size / chars : 12; current.bold = boldChars > chars / 2; lines.push(current); }
              current = null;
            },
          });
        } finally { structured.destroy(); }
        result.push({ index, height: bounds[3] - bounds[1], lines });
      } finally { page.destroy(); }
      progress((position + 1) / indices.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return result;
  } finally { doc.destroy(); }
}

function clean(text: string): string { return text.replace(/[\u00a0\u200b\ufeff]/g, " ").replace(/[ \t]+/g, " ").trim(); }
function escapeText(text: string): string { return text.replace(/([\\`*_[\]<>])/g, "\\$1").replace(/^(#{1,6})(\s)/, "\\$1$2"); }
function repeatingKey(line: MarkdownLine, page: MarkdownPage): string | null {
  if (page.fromOcr) return null;
  const edge = line.box[3] < page.height * .075 ? "top" : line.box[1] > page.height * .925 ? "bottom" : null;
  if (!edge) return null;
  const text = clean(line.text);
  // Normalize digits only for page counters; dates, totals and document IDs remain intact.
  const pageCounter = /^(?:(?:page|صفحة|الصفحة)\s*)?[\d\u0660-\u0669]+(?:\s*(?:\/|of|من)\s*[\d\u0660-\u0669]+)?$/i.test(text);
  return edge + ":" + (pageCounter ? text.replace(/[\d\u0660-\u0669]+/g, "#") : text);
}
function bodySize(pages: MarkdownPage[]): number {
  const sizes = pages.flatMap(page => page.lines.map(line => ({ size: line.size, weight: clean(line.text).length }))).sort((a, b) => a.size - b.size);
  const half = sizes.reduce((sum, line) => sum + line.weight, 0) / 2;
  let weight = 0;
  for (const line of sizes) { weight += line.weight; if (weight >= half) return line.size || 12; }
  return 12;
}
type Row = { lines: MarkdownLine[]; y: number };
function rowsFrom(lines: MarkdownLine[]): Row[] {
  const rows: Row[] = [];
  for (const line of lines) {
    const y = (line.box[1] + line.box[3]) / 2;
    const previous = rows.at(-1);
    if (previous && Math.abs(previous.y - y) <= Math.max(2, (line.box[3] - line.box[1]) * .35)) previous.lines.push(line);
    else rows.push({ lines: [line], y });
  }
  return rows.map(row => ({ ...row, lines: row.lines.sort((a, b) => a.box[0] - b.box[0]) }));
}
function tableRun(rows: Row[], start: number): number {
  const first = rows[start].lines;
  if (first.length < 2 || first.length > 8 || first.some((line, i) => i && line.box[0] - first[i - 1].box[2] < 12)) return 0;
  let end = start + 1;
  while (end < rows.length) {
    const next = rows[end].lines;
    if (next.length !== first.length || next.some((line, index) => Math.abs(line.box[0] - first[index].box[0]) > 8) || rows[end].y - rows[end - 1].y > 70) break;
    end++;
  }
  return end - start >= 3 ? end - start : 0;
}
function formatPage(lines: MarkdownLine[], baseSize: number): string {
  const rows = rowsFrom(lines), output: string[] = [];
  let paragraph: string[] = [], previous: MarkdownLine | null = null;
  const flush = () => { if (paragraph.length) output.push(paragraph.join(" ")); paragraph = []; };
  for (let i = 0; i < rows.length; i++) {
    const count = tableRun(rows, i);
    if (count) {
      flush();
      const cells = rows.slice(i, i + count).map(row => row.lines.map(line => escapeText(clean(line.text)).replace(/\|/g, "\\|")));
      output.push(["| " + cells[0].join(" | ") + " |", "| " + cells[0].map(() => "---").join(" | ") + " |", ...cells.slice(1).map(row => "| " + row.join(" | ") + " |")].join("\n"));
      i += count - 1; previous = null; continue;
    }
    for (const line of rows[i].lines) {
      const text = clean(line.text);
      if (!text) continue;
      const heading = text.length <= 180 && line.size >= baseSize * 1.22;
      const bullet = text.match(/^[•●▪◦‣]\s*(.+)$/);
      const numbered = text.match(/^(\d{1,3})[.)]\s+(.+)$/);
      if (heading) { flush(); output.push((line.size >= baseSize * 1.65 ? "# " : "## ") + escapeText(text)); }
      else if (bullet || numbered) {
        flush();
        const item = bullet ? "- " + escapeText(bullet[1]) : numbered![1] + ". " + escapeText(numbered![2]);
        if (output.at(-1)?.match(/^(?:- |\d+\. )/)) output[output.length - 1] += "\n" + item;
        else output.push(item);
      } else {
        if (previous && (line.block !== previous.block || line.box[1] - previous.box[3] > Math.max(5, baseSize * .8) || line.box[0] - previous.box[0] > baseSize * 2)) flush();
        const content = escapeText(text);
        // Join a clearly hyphenated Latin word across a wrapped line only.
        if (paragraph.length && /[A-Za-z]{2}-$/.test(paragraph.at(-1)!) && /^[a-z]/.test(content)) paragraph[paragraph.length - 1] = paragraph.at(-1)!.slice(0, -1) + content;
        else paragraph.push(content);
      }
      previous = line;
    }
  }
  flush();
  return output.join("\n\n");
}

export function buildMarkdown(pages: MarkdownPage[], options: MarkdownOptions = { removeRepeated: true, pageMarkers: false }): MarkdownResult {
  const repeated = new Map<string, Set<number>>();
  if (options.removeRepeated && pages.length >= 3) {
    for (const page of pages) for (const line of page.lines) {
      const key = repeatingKey(line, page);
      if (key) { if (!repeated.has(key)) repeated.set(key, new Set()); repeated.get(key)!.add(page.index); }
    }
  }
  const baseSize = bodySize(pages), parts: string[] = [], emptyPages: number[] = [], unreadablePages: number[] = [];
  let removedLines = 0;
  for (const page of pages) {
    if (!page.lines.some(line => clean(line.text))) emptyPages.push(page.index);
    else if (markdownPageNeedsOcr(page)) unreadablePages.push(page.index);
    const lines = page.lines.filter(line => {
      const key = repeatingKey(line, page);
      const remove = !!key && (repeated.get(key)?.size || 0) >= Math.max(3, Math.ceil(pages.length * .6));
      if (remove) removedLines++;
      return !remove;
    });
    const text = formatPage(lines, baseSize);
    if (text) parts.push((options.pageMarkers ? `<!-- Page ${page.index + 1} -->\n\n` : "") + text);
  }
  const text = parts.join("\n\n").trim();
  return { text: text ? text + "\n" : "", emptyPages, unreadablePages, removedLines, words: text ? text.split(/\s+/u).length : 0 };
}
