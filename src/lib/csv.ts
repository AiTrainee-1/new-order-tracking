/** Quoted, CRLF-separated CSV text - every cell quoted so commas, quotes and
 *  line breaks inside a value can't break the row. */
export function buildCsv(head: string[], rows: (string | number)[][]): string {
  return [head, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

/** `orders-2026-09-19.csv` - the base name plus today's date. */
export function datedCsvName(base: string): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
}

/** Saves CSV text as a file download. A BOM keeps Excel reading it as UTF-8. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
