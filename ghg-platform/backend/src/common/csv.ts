/**
 * Small, dependency-free CSV helpers (RFC 4180 style): quoted fields, escaped quotes ("") and
 * line breaks inside quotes are supported. Used for activity-data import and export.
 */

/** Parses CSV text into rows of string cells. Blank lines are skipped. A UTF-8 BOM is ignored. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** Turns rows into CSV text (CRLF line endings, which Excel opens cleanly). */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    // Prefix cells that spreadsheet apps would treat as formulas (CSV injection protection).
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Normalises a header cell: "Source name" / "source_name" / " SOURCE-NAME " -> "source_name". */
export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s\-/]+/g, '_').replace(/[^a-z0-9_]/g, '');
}
