import * as XLSX from 'xlsx';
import mongoose from 'mongoose';
import CreatedExcelFile from '@/models/CreatedExcelFile';
import { isTemplateRowDeleted, TEMPLATE_ROW_INDEX } from '@/lib/formatTemplateRows';

export const SUBMITTED_BY_COL = 'Submitted by';
/** Who claimed the template row (Format view / pick); not overwritten by save overlay. */
export const PICKED_BY_COL = 'Picked by';
/** Employee’s saved .xlsx display name (same workbook for every row from that file). */
export const SAVED_AT_COL = 'Saved at (file)';
export const LAST_SAVED_COL = 'Last saved';
/** Internal row meta for admin UI (open full file); not listed in columnOrder / Excel. */
export const ROW_SOURCE_FILE_ID = '_sourceFileId';
export const MERGE_NOTE_COL = 'Merge note';

/** Normalize for comparing IDs across template vs saved file. */
function normId(s: string): string {
  return s.trim().toLowerCase();
}

/** Strip leading Excel column letters from export headers, e.g. "C EMP ID" → "EMP ID". */
function stripLeadingColumnLetters(header: string): string {
  return header.trim().replace(/^[A-Za-z]{1,2}\s+/, '');
}

/**
 * Same header identity across "EMP ID", "Emp ID", "C EMP ID" (used for merge + id lookup).
 */
export function normHeaderKey(header: string): string {
  return stripLeadingColumnLetters(header)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapParsedSourceKeyToCanonicalColumn(parsedKey: string, namedCols: string[]): string | null {
  const pn = normHeaderKey(parsedKey);
  if (!pn) return null;
  for (const col of namedCols) {
    if (normHeaderKey(col) === pn) return col;
  }
  return null;
}

/**
 * Value from parsed row for a template column name, matching any export header synonym
 * ("B COMPANY" → same as "COMPANY").
 */
function resolveParsedValueForTemplateColumn(
  pr: Record<string, unknown>,
  templateColumnKey: string
): unknown | undefined {
  const want = normHeaderKey(templateColumnKey);
  if (!want) return undefined;
  for (const [k, val] of Object.entries(pr)) {
    if (k.startsWith('_')) continue;
    if (normHeaderKey(k) === want) return val;
  }
  return undefined;
}

/**
 * Copy cells from a parsed workbook row onto a template merge row using format column names.
 * Fixes exports where headers include column letters ("C EMP ID") so values land in "EMP ID".
 * Second pass: for every cell already on the template row, pull from pr by normalized header so
 * columns missing from `namedCols` still update (avoids leaving MBM / 03831 while other fields merged).
 */
function copyParsedRowOntoTarget(
  target: Record<string, unknown>,
  pr: Record<string, unknown>,
  namedCols: string[],
  tail: readonly string[]
) {
  for (const col of Object.keys(pr)) {
    if (col.startsWith('_')) continue;
    if (tail.includes(col as string)) continue;
    if (!Object.prototype.hasOwnProperty.call(pr, col)) continue;
    const canonical = mapParsedSourceKeyToCanonicalColumn(col, namedCols);
    if (canonical) {
      target[canonical] = pr[col];
    } else {
      target[col] = pr[col];
    }
  }

  for (const tk of Object.keys(target)) {
    if (tk.startsWith('_')) continue;
    if (tail.includes(tk)) continue;
    const resolved = resolveParsedValueForTemplateColumn(pr, tk);
    if (resolved !== undefined) {
      target[tk] = resolved;
    }
  }
}

/**
 * Read employee / row id from a sheet row (handles header spelling variants).
 * Used so admin merge updates the correct template row when pick indices are wrong or missing.
 * Prefers a true "EMP ID" / "Employee ID" column over "EMP NO" so short codes do not win over edited IDs.
 */
export function getEmpIdFromRow(row: Record<string, unknown> | undefined | null): string {
  if (!row || typeof row !== 'object') return '';
  let fallback = '';
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('_')) continue;
    const nk = normHeaderKey(k);
    if (nk === 'emp id' || nk === 'employee id' || nk === 'empid') {
      return String(v ?? '').trim();
    }
    if (
      nk === 'emp no' ||
      nk === 'employee no' ||
      nk === 'employee number' ||
      nk === 'emp code' ||
      nk === 'employee code'
    ) {
      if (!fallback) fallback = String(v ?? '').trim();
    }
  }
  return fallback;
}

/** Stable row matcher for format sheets (e.g. S.NO / SR NO). */
function getSerialNoFromRow(row: Record<string, unknown> | undefined | null): string {
  if (!row || typeof row !== 'object') return '';
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('_')) continue;
    const nk = normHeaderKey(k);
    if (
      nk === 's no' ||
      nk === 's.no' ||
      nk === 'sr no' ||
      nk === 'serial no' ||
      nk === 'serial number'
    ) {
      const out = String(v ?? '').trim();
      if (out) return out;
    }
  }
  return '';
}

function findMergedIndexBySerialNo(
  merged: Record<string, unknown>[],
  serial: string,
  skip?: Set<number>
): number {
  if (!serial) return -1;
  const want = normId(serial);
  return merged.findIndex((m, idx) => {
    if (skip?.has(idx)) return false;
    const has = normId(getSerialNoFromRow(m));
    return has.length > 0 && has === want;
  });
}

function findMergedIndexByEmpId(
  merged: Record<string, unknown>[],
  emp: string,
  skip?: Set<number>
): number {
  if (!emp) return -1;
  const e = normId(emp);
  return merged.findIndex((m, idx) => {
    if (skip?.has(idx)) return false;
    const me = normId(getEmpIdFromRow(m));
    return me.length > 0 && me === e;
  });
}

export type MergeDailyFileRowOptions = {
  /** When false, omit per-row file id (e.g. employee merge JSON). Default true. */
  includeSourceFileIds?: boolean;
};

export function parseDayRangeUtc(isoDate: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  return { start, end };
}

/** Boundaries from the browser for `<input type="date">` local calendar day (ISO strings). */
export function parseClientDayRangeIso(
  rangeStart: string | null,
  rangeEnd: string | null
): { start: Date; end: Date } | null {
  if (!rangeStart || !rangeEnd) return null;
  const start = new Date(rangeStart);
  const end = new Date(rangeEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end <= start) return null;
  const maxMs = 49 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxMs) return null;
  return { start, end };
}

/** Normalize file bytes from Mongo (Buffer, Uint8Array, BSON-style, { data: number[] }). */
export function normalizeStoredFileBuffer(raw: unknown): Buffer | null {
  if (raw == null) return null;
  if (Buffer.isBuffer(raw)) return raw.length ? raw : null;
  if (raw instanceof Uint8Array) return raw.length ? Buffer.from(raw) : null;
  if (typeof raw === 'string') {
    const b = Buffer.from(raw, 'base64');
    return b.length ? b : null;
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data) && (o.data as unknown[]).length && typeof (o.data as number[])[0] === 'number') {
      return Buffer.from(o.data as number[]);
    }
    const bson = raw as { _bsontype?: string; buffer?: Buffer | Uint8Array };
    if (bson._bsontype === 'Binary' && bson.buffer) {
      return Buffer.isBuffer(bson.buffer) ? bson.buffer : Buffer.from(bson.buffer);
    }
    const any = raw as { buffer?: ArrayBuffer; byteOffset?: number; byteLength?: number; length?: number };
    if (any.buffer instanceof ArrayBuffer) {
      const off = any.byteOffset ?? 0;
      const len = any.byteLength ?? any.length ?? (any.buffer as ArrayBuffer).byteLength;
      return len ? Buffer.from(any.buffer, off, len) : null;
    }
  }
  try {
    const b = Buffer.from(raw as ArrayLike<number>);
    return b.length ? b : null;
  } catch {
    return null;
  }
}

function pickWorksheet(wb: XLSX.WorkBook): { name: string; sheet: XLSX.WorkSheet } | null {
  const names = wb.SheetNames || [];
  if (!names.length) return null;
  const dataName = names.find((n) => /^data$/i.test(String(n).trim()));
  const name = dataName ?? names[0];
  const sheet = wb.Sheets[name];
  if (!sheet) return null;
  return { name, sheet };
}

/**
 * Prefer object rows (header row); if empty, rebuild from array-of-arrays (pick-style / odd exports).
 */
export function rowsFromExcelBuffer(buf: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false, cellNF: false, cellText: false });
  const picked = pickWorksheet(wb);
  if (!picked) return [];
  const ws = picked.sheet;

  let rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false }) as Record<string, unknown>[];
  if (rows.length > 0) return rows;

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  if (!aoa.length) return [];

  const header = (aoa[0] || []).map((h, i) => {
    const t = String(h ?? '').trim();
    return t || `Column_${i + 1}`;
  });
  const out: Record<string, unknown>[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const line = (aoa[r] || []) as unknown[];
    const obj: Record<string, unknown> = {};
    let anyNonEmpty = false;
    for (let c = 0; c < header.length; c++) {
      const v = line[c];
      if (v !== '' && v !== null && v !== undefined) anyNonEmpty = true;
      obj[header[c]] = v ?? '';
    }
    if (anyNonEmpty) out.push(obj);
  }
  return out;
}

export function mergeDailyFileRows(
  files: Array<{
    _id?: mongoose.Types.ObjectId | string;
    filename?: string;
    fileData: Buffer;
    createdByName?: string;
    createdByEmail?: string;
    originalFilename?: string;
    lastEditedAt?: Date;
    updatedAt?: Date;
    createdAt?: Date;
  }>,
  options?: MergeDailyFileRowOptions
): { rows: Record<string, unknown>[]; columnOrder: string[] } {
  const includeSourceFileIds = options?.includeSourceFileIds !== false;
  const all: Record<string, unknown>[] = [];
  const keySet = new Set<string>();

  for (const f of files) {
    let rows: Record<string, unknown>[] = [];
    let bytesMissing = false;
    try {
      const raw = normalizeStoredFileBuffer(f.fileData);
      if (!raw?.length) {
        bytesMissing = true;
      } else {
        rows = rowsFromExcelBuffer(raw);
      }
    } catch {
      bytesMissing = true;
    }
    if (bytesMissing || rows.length === 0) {
      rows = [
        {
          [MERGE_NOTE_COL]: bytesMissing
            ? '(No readable file bytes — re-save from employee app or check DB.)'
            : '(No rows parsed from this workbook; download the file from Saved at (file) to open it.)',
        },
      ];
    }
    const who =
      [f.createdByName, f.createdByEmail].filter(Boolean).join(' · ') ||
      f.originalFilename ||
      'Unknown';
    const savedAt = (
      f.lastEditedAt ||
      f.updatedAt ||
      f.createdAt ||
      new Date()
    ).toISOString();
    const displayName = (f.originalFilename || f.filename || 'file.xlsx').trim() || 'file.xlsx';
    const idStr = f._id != null ? String(f._id) : '';

    for (const r of rows) {
      const row: Record<string, unknown> = {
        ...r,
        [SUBMITTED_BY_COL]: who,
        [SAVED_AT_COL]: displayName,
        [LAST_SAVED_COL]: savedAt,
      };
      if (includeSourceFileIds && idStr) {
        row[ROW_SOURCE_FILE_ID] = idStr;
      }
      Object.keys(row).forEach((k) => {
        if (!k.startsWith('_')) keySet.add(k);
      });
      all.push(row);
    }
  }

  const tail = [SUBMITTED_BY_COL, SAVED_AT_COL, LAST_SAVED_COL];
  const rest = Array.from(keySet).filter((k) => !tail.includes(k)).sort();
  const columnOrder = [...rest, ...tail];
  return { rows: all, columnOrder };
}

export async function loadCreatedFilesForFormatAndDay(
  formatIdObj: mongoose.Types.ObjectId,
  start: Date,
  end: Date,
  /** YYYY-MM-DD — include “My data” / daily saves whose workday is this date even if lastEditedAt falls outside the range. */
  calendarYmd?: string | null
) {
  const orClause: Record<string, unknown>[] = [
    { lastEditedAt: { $gte: start, $lte: end } },
    { updatedAt: { $gte: start, $lte: end } },
    { createdAt: { $gte: start, $lte: end } },
  ];
  if (calendarYmd && /^\d{4}-\d{2}-\d{2}$/.test(calendarYmd)) {
    orClause.push({ dailyWorkDate: calendarYmd });
    orClause.push({
      originalFilename: new RegExp(`_${calendarYmd.replace(/-/g, '\\-')}\\.xlsx$`, 'i'),
    });
  }

  const docs = await CreatedExcelFile.find({
    formatId: formatIdObj,
    isMerged: { $ne: true },
    $or: orClause,
  })
    .select(
      '+fileData createdByName createdByEmail originalFilename lastEditedAt updatedAt createdAt pickedTemplateRowIndices dailyWorkDate'
    )
    .lean();

  if (!(calendarYmd && /^\d{4}-\d{2}-\d{2}$/.test(calendarYmd))) {
    return docs;
  }

  // Admin "All merge data" for a selected day should only use day-stamped saves for that same day.
  // Timestamp-only filtering can pull non-day pick snapshots and overwrite edited day values.
  const daySuffixRe = new RegExp(`_${calendarYmd.replace(/-/g, '\\-')}\\.xlsx$`, 'i');
  return (docs as Array<Record<string, unknown>>).filter((d) => {
    const dailyWorkDate = String(d.dailyWorkDate ?? '').trim();
    const originalFilename = String(d.originalFilename ?? '').trim();
    return dailyWorkDate === calendarYmd || daySuffixRe.test(originalFilename);
  });
}

type AdminMergeFile = {
  _id?: mongoose.Types.ObjectId | string;
  filename?: string;
  fileData?: unknown;
  createdByName?: string;
  createdByEmail?: string;
  originalFilename?: string;
  lastEditedAt?: Date;
  updatedAt?: Date;
  createdAt?: Date;
  pickedTemplateRowIndices?: unknown;
};

/**
 * Admin “full sheet” view: start from master template (same row set as Format & picks active rows),
 * then overlay cells from each saved file for the day when `pickedTemplateRowIndices` lines up with parsed rows.
 * Files that are not pick-shaped are appended below. Matches how format-view shows complete Excel + live edits.
 */
export type TemplatePickForMerge = { rowIndex: number; empName?: string; empId?: string };

/**
 * Add {@link PICKED_BY_COL} from template-row picks (storage index in FormatTemplateData.rows).
 */
export function applyPickedByToAdminMerge(
  rows: Record<string, unknown>[],
  columnOrder: string[],
  rowStorageIndices: (number | null)[],
  picks: TemplatePickForMerge[]
): { rows: Record<string, unknown>[]; columnOrder: string[] } {
  const labelByStorage = new Map<number, string>();
  for (const p of picks) {
    if (typeof p.rowIndex !== 'number' || !Number.isInteger(p.rowIndex) || p.rowIndex < 0) continue;
    const name = String(p.empName ?? '').trim() || 'Unknown';
    const id = String(p.empId ?? '').trim();
    const label = id ? `${name} (${id})` : name;
    labelByStorage.set(p.rowIndex, label);
  }

  const nextRows = rows.map((row, i) => {
    const si = rowStorageIndices[i];
    const label = si != null ? labelByStorage.get(si) : undefined;
    return { ...row, [PICKED_BY_COL]: label ?? '' };
  });

  const without = columnOrder.filter((c) => c !== PICKED_BY_COL);
  const submitIdx = without.indexOf(SUBMITTED_BY_COL);
  const nextOrder =
    submitIdx >= 0
      ? [...without.slice(0, submitIdx), PICKED_BY_COL, ...without.slice(submitIdx)]
      : [...without, PICKED_BY_COL];

  return { rows: nextRows, columnOrder: nextOrder };
}

export function mergeAdminTemplateDailyMerge(
  formatColumns: Array<{ name: string; order?: number }> | undefined,
  templateRows: unknown[] | null | undefined,
  files: AdminMergeFile[]
): { rows: Record<string, unknown>[]; columnOrder: string[]; rowStorageIndices: (number | null)[] } {
  const namedCols = [...(formatColumns || [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c) => c.name)
    .filter(Boolean);
  const tail = [SUBMITTED_BY_COL, SAVED_AT_COL, LAST_SAVED_COL];

  const fullRows = Array.isArray(templateRows) ? templateRows : [];
  const activeStorageIndices: number[] = [];
  fullRows.forEach((r, i) => {
    if (!isTemplateRowDeleted(r)) activeStorageIndices.push(i);
  });

  if (activeStorageIndices.length === 0) {
    const r = mergeDailyFileRows(files as any[]);
    return {
      ...r,
      rowStorageIndices: r.rows.map(() => null as number | null),
    };
  }

  const storageToMergedIdx = new Map<number, number>();
  const merged: Record<string, unknown>[] = activeStorageIndices.map((storageIndex) => {
    const r = fullRows[storageIndex] as Record<string, unknown>;
    const clean = { ...r };
    delete clean.__deleted;
    delete clean[TEMPLATE_ROW_INDEX];
    return {
      ...clean,
      [SUBMITTED_BY_COL]: '',
      [SAVED_AT_COL]: '',
      [LAST_SAVED_COL]: '',
    };
  });
  activeStorageIndices.forEach((si, j) => storageToMergedIdx.set(si, j));

  /** Oldest → newest so later iterations win (newest save must not be overwritten by an older file same day). */
  const sortedDocs = [...files].sort((a, b) => {
    const t = (x: AdminMergeFile) =>
      new Date((x.lastEditedAt as Date) || x.updatedAt || x.createdAt || 0).getTime();
    const d = t(a) - t(b);
    if (d !== 0) return d;
    return String(a._id ?? '').localeCompare(String(b._id ?? ''));
  });

  const appendRows: Record<string, unknown>[] = [];

  for (const f of sortedDocs) {
    const who =
      [f.createdByName, f.createdByEmail].filter(Boolean).join(' · ') ||
      f.originalFilename ||
      'Unknown';
    const savedAt = (
      f.lastEditedAt ||
      f.updatedAt ||
      f.createdAt ||
      new Date()
    ).toISOString();
    const displayName = String(f.originalFilename || f.filename || 'file.xlsx').trim() || 'file.xlsx';
    const idStr = f._id != null ? String(f._id) : '';

    let parsed: Record<string, unknown>[] = [];
    try {
      const raw = normalizeStoredFileBuffer(f.fileData);
      if (raw?.length) parsed = rowsFromExcelBuffer(raw);
    } catch {
      parsed = [];
    }

    const indicesRaw = f.pickedTemplateRowIndices;
    const indices =
      Array.isArray(indicesRaw) && indicesRaw.length > 0
        ? indicesRaw.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0)
        : null;

    const pairCount =
      indices && indices.length > 0 && parsed.length > 0
        ? Math.min(indices.length, parsed.length)
        : 0;
    const pickPartial = pairCount > 0 && !!indices;
    const extraParsedRows =
      pickPartial && parsed.length > pairCount ? parsed.slice(pairCount) : [];

    if (pickPartial && indices) {
      for (let i = 0; i < pairCount; i++) {
        const si = indices[i];
        const pr = parsed[i];
        // Trust pick file row order ↔ template indices first. EMP-ID routing breaks when the
        // employee edits EMP ID (new id no longer matches the template row) or when multiple
        // "emp*" columns disagree (e.g. EMP NO vs EMP ID).
        let mj: number | undefined = storageToMergedIdx.get(si);
        if (mj === undefined && typeof si === 'number' && si >= 0 && si < fullRows.length) {
          const tpl = fullRows[si] as Record<string, unknown>;
          if (!isTemplateRowDeleted(tpl)) {
            const serialTpl = getSerialNoFromRow(tpl);
            if (serialTpl) {
              const jSerial = findMergedIndexBySerialNo(merged, serialTpl);
              if (jSerial >= 0) mj = jSerial;
            }
            const origEmp = getEmpIdFromRow(tpl);
            if (mj === undefined && origEmp) {
              const jEmp = findMergedIndexByEmpId(merged, origEmp);
              if (jEmp >= 0) mj = jEmp;
            }
          }
        }
        if (mj === undefined) {
          const sNo = getSerialNoFromRow(pr);
          if (sNo) {
            const jSerial = findMergedIndexBySerialNo(merged, sNo);
            if (jSerial >= 0) mj = jSerial;
          }
        }
        if (mj === undefined) {
          const pe = getEmpIdFromRow(pr);
          if (pe) {
            const jEmp = findMergedIndexByEmpId(merged, pe);
            if (jEmp >= 0) mj = jEmp;
          }
        }
        if (mj === undefined) {
          console.warn(
            '[mergeAdminTemplateDailyMerge] skipped overlay: no merged row for pick index',
            { fileId: idStr, pickStorageIndex: si, rowInFile: i }
          );
          continue;
        }
        const target = merged[mj];
        copyParsedRowOntoTarget(target, pr, namedCols, tail);
        target[SUBMITTED_BY_COL] = who;
        target[SAVED_AT_COL] = displayName;
        target[LAST_SAVED_COL] = savedAt;
        if (idStr) target[ROW_SOURCE_FILE_ID] = idStr;
      }
      for (const r of extraParsedRows) {
        const row: Record<string, unknown> = {
          ...r,
          [SUBMITTED_BY_COL]: who,
          [SAVED_AT_COL]: displayName,
          [LAST_SAVED_COL]: savedAt,
        };
        if (idStr) row[ROW_SOURCE_FILE_ID] = idStr;
        appendRows.push(row);
      }
    } else if (parsed.length > 0 && merged.length > 0) {
      /**
       * No valid pick map (or empty indices): overlay onto template rows.
       * Prefer matching by EMP ID so row order / stale pick indices cannot leave the wrong template row stale.
       * Remaining parsed rows fill unused merged slots in order, then append.
       */
      const usedMerged = new Set<number>();
      const overlayOnto = (mj: number, pr: Record<string, unknown>) => {
        const target = merged[mj];
        copyParsedRowOntoTarget(target, pr, namedCols, tail);
        target[SUBMITTED_BY_COL] = who;
        target[SAVED_AT_COL] = displayName;
        target[LAST_SAVED_COL] = savedAt;
        if (idStr) target[ROW_SOURCE_FILE_ID] = idStr;
        usedMerged.add(mj);
      };

      const unmatched: Record<string, unknown>[] = [];
      for (const pr of parsed) {
        const sNo = getSerialNoFromRow(pr);
        if (sNo) {
          const jBySerial = findMergedIndexBySerialNo(merged, sNo, usedMerged);
          if (jBySerial >= 0) {
            overlayOnto(jBySerial, pr);
            continue;
          }
        }
        const pe = getEmpIdFromRow(pr);
        if (pe) {
          const j = findMergedIndexByEmpId(merged, pe, usedMerged);
          if (j >= 0) {
            overlayOnto(j, pr);
            continue;
          }
        }
        unmatched.push(pr);
      }
      let scan = 0;
      for (const pr of unmatched) {
        while (scan < merged.length && usedMerged.has(scan)) scan++;
        if (scan < merged.length) {
          overlayOnto(scan, pr);
          scan++;
        } else {
          const row: Record<string, unknown> = {
            ...pr,
            [SUBMITTED_BY_COL]: who,
            [SAVED_AT_COL]: displayName,
            [LAST_SAVED_COL]: savedAt,
          };
          if (idStr) row[ROW_SOURCE_FILE_ID] = idStr;
          appendRows.push(row);
        }
      }
    } else if (parsed.length > 0) {
      for (const r of parsed) {
        const row: Record<string, unknown> = {
          ...r,
          [SUBMITTED_BY_COL]: who,
          [SAVED_AT_COL]: displayName,
          [LAST_SAVED_COL]: savedAt,
        };
        if (idStr) row[ROW_SOURCE_FILE_ID] = idStr;
        appendRows.push(row);
      }
    } else {
      appendRows.push({
        [MERGE_NOTE_COL]:
          '(Could not read grid rows from this saved file. It may still download — use another tool to inspect.)',
        [SUBMITTED_BY_COL]: who,
        [SAVED_AT_COL]: displayName,
        [LAST_SAVED_COL]: savedAt,
        ...(idStr ? { [ROW_SOURCE_FILE_ID]: idStr } : {}),
      });
    }
  }

  const allMerged = [...merged, ...appendRows];

  const keySet = new Set<string>();
  allMerged.forEach((r) =>
    Object.keys(r).forEach((k) => {
      if (!k.startsWith('_')) keySet.add(k);
    })
  );
  tail.forEach((t) => keySet.delete(t));
  const fromFormat = namedCols.filter((n) => keySet.has(n));
  fromFormat.forEach((n) => keySet.delete(n));
  const rest = Array.from(keySet).sort();
  const columnOrder = [...fromFormat, ...rest, ...tail];

  const rowStorageIndices: (number | null)[] = [
    ...activeStorageIndices,
    ...appendRows.map(() => null as number | null),
  ];

  return { rows: allMerged, columnOrder, rowStorageIndices };
}

export function buildMergeXlsxBuffer(
  rows: Record<string, unknown>[],
  columnOrder: string[],
  sheetName = 'All merge data'
): Buffer {
  const slim = rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of columnOrder) {
      o[c] = r[c] !== undefined && r[c] !== null ? r[c] : '';
    }
    return o;
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(slim.length ? slim : [{}]);
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Data');
  return Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}
