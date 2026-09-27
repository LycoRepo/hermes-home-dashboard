/** Whole glyph rows that fit in `height` px. The canvas is sized to exactly
 *  `paintHeight`, so the bottom row is never cut in half by the widget edge. */
export function matrixRows(height: number, rowH: number): { rows: number; paintHeight: number } {
  const rows = Math.max(0, Math.floor(height / rowH));
  return { rows, paintHeight: rows * rowH };
}
