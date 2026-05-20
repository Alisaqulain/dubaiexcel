/** Shared format column display + Excel import helpers. */

import * as XLSX from 'xlsx';

export type FormatColumnSpec = {
  name: string;
  type?: string;
  required?: boolean;
  unique?: boolean;
  order?: number;
  validation?: { options?: string[] };
};

function normUniqueKey(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim().toLowerCase();
}

/** Skip incoming rows whose value in the chosen unique column(s) already exists in template or batch. */
export function filterIncomingRowsByUniqueColumns(
  existingRows: Record<string, unknown>[],
  incomingRows: Record<string, unknown>[],
  formatColumns: FormatColumnSpec[],
  options?: { uniqueColumnNames?: string[] }
): {
  accepted: Record<string, unknown>[];
  skipped: number;
  skippedSamples: string[];
} {
  const fromOptions = (options?.uniqueColumnNames || []).map((n) => String(n).trim()).filter(Boolean);
  const uniqueCols =
    fromOptions.length > 0
      ? fromOptions
      : formatColumns.filter((c) => c.unique === true && c.name).map((c) => c.name);

  if (uniqueCols.length === 0) {
    return {
      accepted: incomingRows.map((r) => ({ ...r })),
      skipped: 0,
      skippedSamples: [],
    };
  }

  const seenByCol = new Map<string, Set<string>>();
  for (const col of uniqueCols) {
    const set = new Set<string>();
    for (const row of existingRows) {
      const k = normUniqueKey(row[col]);
      if (k) set.add(k);
    }
    seenByCol.set(col, set);
  }

  const accepted: Record<string, unknown>[] = [];
  const skippedSamples: string[] = [];
  let skipped = 0;

  for (const row of incomingRows) {
    let isDup = false;
    let dupCol = '';
    let dupVal = '';
    for (const col of uniqueCols) {
      const k = normUniqueKey(row[col]);
      if (!k) continue;
      const set = seenByCol.get(col)!;
      if (set.has(k)) {
        isDup = true;
        dupCol = col;
        dupVal = String(row[col]).trim();
        break;
      }
    }
    if (isDup) {
      skipped++;
      if (skippedSamples.length < 8) {
        skippedSamples.push(`${dupCol}=${dupVal}`);
      }
      continue;
    }
    for (const col of uniqueCols) {
      const k = normUniqueKey(row[col]);
      if (k) seenByCol.get(col)!.add(k);
    }
    accepted.push({ ...row });
  }

  return { accepted, skipped, skippedSamples };
}

/** Suggest default unique key column for Excel import (EMP ID, S.NO, etc.). */
export function guessDefaultUniqueColumnName(columns: FormatColumnSpec[]): string {
  const sorted = [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const marked = sorted.find((c) => c.unique === true && c.name);
  if (marked) return marked.name;
  const byName = sorted.find((c) => {
    const n = (c.name || '').toLowerCase();
    return n.includes('emp id') || n === 'empid' || n.includes('employee id');
  });
  if (byName) return byName.name;
  const sno = sorted.find((c) => normalizeHeaderKey(c.name) === 'sno');
  if (sno) return sno.name;
  return sorted[0]?.name || '';
}

/** Normalize imported cell to storage form (dates → YYYY-MM-DD). */
export function normalizeImportedCellValue(value: string, col: FormatColumnSpec): string {
  let val = value.trim();
  if (!val) return '';

  if (col.type === 'dropdown' && col.validation?.options?.length) {
    const optionsLower = col.validation.options.map((o) => String(o).trim().toLowerCase());
    const optionIndex = optionsLower.indexOf(val.toLowerCase());
    return optionIndex !== -1 ? col.validation.options[optionIndex] : '';
  }

  if (col.type !== 'date') return val;

  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;

  const excelSerial = parseFloat(val);
  if (!isNaN(excelSerial) && excelSerial > 0 && excelSerial < 1000000) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + excelSerial * 24 * 60 * 60 * 1000);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  const dmy = /^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{2,4})$/.exec(val);
  if (dmy) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const mo = months[dmy[2].slice(0, 3).toLowerCase()];
    if (mo) {
      let year = dmy[3];
      if (year.length === 2) year = `20${year}`;
      return `${year}-${mo}-${dmy[1].padStart(2, '0')}`;
    }
  }

  const parsed = new Date(val);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return val;
}

/** Collapse header text for fuzzy match: "S.NO" / "S NO" / "Emp Id" → comparable keys. */
export function normalizeHeaderKey(s: string): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function headerMatchesExcel(formatName: string, excelHeader: string): boolean {
  const a = normalizeHeaderKey(formatName);
  const b = normalizeHeaderKey(excelHeader);
  if (!a || !b) return false;
  if (a === b) return true;
  return false;
}

/** Pick the row that best matches format column names (handles title rows above headers). */
function findHeaderRowIndex(allData: unknown[][], formatColumns: FormatColumnSpec[]): number {
  let bestIdx = 0;
  let bestScore = 0;
  const scan = Math.min(12, allData.length);
  for (let i = 0; i < scan; i++) {
    const row = allData[i] as unknown[] | undefined;
    if (!row?.length) continue;
    const headers = row.map((h) => String(h ?? '').trim());
    let score = 0;
    for (const col of formatColumns) {
      if (headers.some((h) => headerMatchesExcel(col.name, h))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function buildColumnMapping(
  excelHeaders: string[],
  formatColumns: FormatColumnSpec[]
): { columnMapping: Record<string, number>; missingColumns: string[]; matchedCount: number } {
  const columnMapping: Record<string, number> = {};
  const missingColumns: string[] = [];
  const usedIndices = new Set<number>();

  for (const col of formatColumns) {
    let index = excelHeaders.findIndex((h, i) => !usedIndices.has(i) && headerMatchesExcel(col.name, h));
    if (index === -1) {
      index = excelHeaders.findIndex((h) => headerMatchesExcel(col.name, h));
    }
    if (index !== -1) {
      columnMapping[col.name] = index;
      usedIndices.add(index);
    } else if (col.required) {
      missingColumns.push(col.name);
    }
  }

  return { columnMapping, missingColumns, matchedCount: Object.keys(columnMapping).length };
}

export function buildColumnTypesMap(columns: FormatColumnSpec[] | undefined): Record<string, string> {
  const m: Record<string, string> = {};
  for (const c of columns || []) {
    const name = String(c.name || '').trim();
    if (name) m[name] = String(c.type || 'text');
  }
  return m;
}

export function formatCellValueForDisplay(value: unknown, columnType: string): string {
  if (value === undefined || value === null || value === '') return '';
  const stringValue = String(value).trim();
  if (columnType === 'date') {
    const excelSerial = parseFloat(stringValue);
    if (!isNaN(excelSerial) && excelSerial > 0 && excelSerial < 1000000) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + excelSerial * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
      const parts = stringValue.split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const parsedDate = new Date(stringValue);
    if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900 && parsedDate.getFullYear() < 2100) {
      const day = String(parsedDate.getDate()).padStart(2, '0');
      const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const year = parsedDate.getFullYear();
      return `${day}/${month}/${year}`;
    }
  }
  return stringValue;
}

/** Map an Excel file buffer to format column keys (auto-detect header row). */
export function parseExcelBufferToFormatRows(
  buffer: ArrayBuffer,
  formatColumns: FormatColumnSpec[]
): {
  rows: Record<string, string>[];
  missingColumns: string[];
  headerRowIndex: number;
  excelHeaders: string[];
} {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: 'array', cellDates: false, cellNF: false, cellText: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const allData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false }) as unknown[][];

  if (allData.length < 2) {
    throw new Error('Excel file must have a header row and at least one data row');
  }

  const sortedColumns = [...formatColumns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  let headerRowIndex = findHeaderRowIndex(allData, sortedColumns);
  let headerRow = allData[headerRowIndex] as unknown[];
  let excelHeaders = headerRow.map((h) => String(h ?? '').trim());

  let { columnMapping, missingColumns, matchedCount } = buildColumnMapping(excelHeaders, sortedColumns);

  /** File has data only (no header row) — map columns by position when names do not match. */
  const firstCell = String((allData[0] as unknown[])?.[0] ?? '').trim();
  const firstRowLooksLikeData = /^\d+$/.test(firstCell);
  if (
    matchedCount < Math.min(3, Math.ceil(sortedColumns.length * 0.2)) &&
    firstRowLooksLikeData
  ) {
    columnMapping = {};
    sortedColumns.forEach((col, i) => {
      columnMapping[col.name] = i;
    });
    missingColumns = [];
    matchedCount = sortedColumns.length;
    headerRowIndex = -1;
    excelHeaders = sortedColumns.map((c) => c.name);
  }

  if (matchedCount === 0) {
    throw new Error(
      `Could not match any columns. Excel headers: ${excelHeaders.filter(Boolean).slice(0, 8).join(', ') || '(empty)'}. ` +
        `Expected format columns like: ${sortedColumns.slice(0, 5).map((c) => c.name).join(', ')}…`
    );
  }

  const dataStartIndex = headerRowIndex < 0 ? 0 : headerRowIndex + 1;
  const rows = allData
    .slice(dataStartIndex)
    .filter(
      (row) =>
        row &&
        row.length > 0 &&
        row.some((cell) => cell !== '' && cell !== null && cell !== undefined)
    )
    .map((row) => {
      const newRow: Record<string, string> = {};
      sortedColumns.forEach((col) => {
        const excelIndex = columnMapping[col.name];
        if (
          excelIndex !== undefined &&
          excelIndex !== -1 &&
          row[excelIndex] !== undefined &&
          row[excelIndex] !== null &&
          row[excelIndex] !== ''
        ) {
          let val = String(row[excelIndex]).trim();
          val = normalizeImportedCellValue(val, col);
          newRow[col.name] = val;
        } else {
          newRow[col.name] = '';
        }
      });
      return newRow;
    })
    .filter((row) =>
      sortedColumns.some((col) => {
        const v = row[col.name];
        return v !== undefined && v !== null && String(v).trim() !== '';
      })
    );

  return { rows, missingColumns, headerRowIndex, excelHeaders };
}
