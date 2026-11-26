import { CSV_COLUMNS, REASON_CODES } from "./model";
import type { ReasonCode } from "../types";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

export type CsvRejection = {
  address: string;
  city: string;
  state: string;
  zip: string;
  rejectedBy: string;
  rejectedAt: Date;
  reasonCode: ReasonCode;
  reasonText: string;
};

export type CsvIssue = { row: number; message: string };

export function parseRejectionCsv(text: string): { rows: CsvRejection[]; issues: CsvIssue[] } {
  const table = parseCsv(text.replace(/^\uFEFF/, ""));
  if (table.length === 0) return { rows: [], issues: [{ row: 1, message: "The file is empty." }] };

  const header = table[0].map((cell) => cell.trim());
  const expected = [...CSV_COLUMNS];
  if (header.length !== expected.length || header.some((cell, index) => cell !== expected[index])) {
    return {
      rows: [],
      issues: [{ row: 1, message: `Header must be ${expected.join(", ")}.` }],
    };
  }
  if (table.length > 201) {
    return { rows: [], issues: [{ row: 1, message: "Limit is 200 data rows." }] };
  }

  const rows: CsvRejection[] = [];
  const issues: CsvIssue[] = [];
  for (let index = 1; index < table.length; index += 1) {
    const cells = table[index];
    const line = index + 1;
    if (cells.length !== expected.length) {
      issues.push({ row: line, message: "Wrong number of columns." });
      continue;
    }
    const record = Object.fromEntries(expected.map((key, cell) => [key, cells[cell].trim()])) as Record<
      (typeof CSV_COLUMNS)[number],
      string
    >;
    if (!REASON_CODES.includes(record.reasonCode as ReasonCode)) {
      issues.push({ row: line, message: "Unknown reasonCode." });
      continue;
    }
    const when = new Date(record.rejectedAt);
    if (Number.isNaN(when.getTime())) {
      issues.push({ row: line, message: "rejectedAt must be a date." });
      continue;
    }
    if (!record.address || !record.city || !/^[A-Za-z]{2}$/.test(record.state)) {
      issues.push({ row: line, message: "Address, city, and 2-letter state are required." });
      continue;
    }
    if (!/^\d{5}$/.test(record.zip)) {
      issues.push({ row: line, message: "ZIP must be 5 digits." });
      continue;
    }
    if (!record.rejectedBy || !record.reasonText) {
      issues.push({ row: line, message: "rejectedBy and reasonText are required." });
      continue;
    }
    rows.push({
      address: record.address,
      city: record.city,
      state: record.state.toUpperCase(),
      zip: record.zip,
      rejectedBy: record.rejectedBy,
      rejectedAt: when,
      reasonCode: record.reasonCode as ReasonCode,
      reasonText: record.reasonText,
    });
  }
  return { rows, issues };
}
