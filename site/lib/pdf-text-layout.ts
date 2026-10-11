import bidiFactory from "bidi-js";
import type * as Fontkit from "@pdf-lib/fontkit";

const bidi = bidiFactory();

export function pdfTextIsRtl(text: string) {
  return !!((bidi.getEmbeddingLevels(text).paragraphs[0]?.level ?? 0) & 1);
}

// Shape each directional run separately, then place the glyph runs in their
// Unicode visual order. A single Arabic fontkit run reverses Latin words and
// numbers too. Register this adapter for text, form appearances and OCR layers.
export function bidirectionalFontkit(fontkit: Pick<typeof Fontkit, "create">) {
  return {
    create(data: Uint8Array, postscriptName?: string) {
      const font = fontkit.create(data, postscriptName);
      const originalLayout = font.layout.bind(font);
      font.layout = (text, features) => {
        const embedding = bidi.getEmbeddingLevels(text);
        const logicalRuns: string[] = [];
        const runAt: number[] = [];
        for (let start = 0; start < text.length;) {
          let end = start + 1;
          while (end < text.length && embedding.levels[end] === embedding.levels[start]) end++;
          const index = logicalRuns.length;
          logicalRuns.push(text.slice(start, end).replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ""));
          for (let i = start; i < end; i++) runAt[i] = index;
          start = end;
        }
        if (logicalRuns.length < 2) return originalLayout(logicalRuns[0] ?? "", features);
        const order = [...new Set(bidi.getReorderedIndices(text, embedding).map(index => runAt[index]))];
        const runs = order.map(index => originalLayout(logicalRuns[index], features));
        const result = originalLayout(text, features);
        result.glyphs = runs.flatMap(run => run.glyphs);
        result.positions = runs.flatMap(run => run.positions);
        result.direction = "ltr";
        return result;
      };
      return font;
    },
  };
}
