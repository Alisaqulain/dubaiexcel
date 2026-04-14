import { isTemplateRowDeleted } from '@/lib/formatTemplateRows';

function normalizeCell(v: unknown): string {
  return String(v ?? '').trim();
}

type FormatCol = { name: string; editable?: boolean };

/**
 * Find template row index for a file row using locked (read-only) columns first, then all columns if none locked.
 */
export function findTemplateIndexForFileRow(
  fileRow: Record<string, unknown>,
  templateRows: unknown[],
  formatColumns: FormatCol[]
): number | null {
  const lockedNames = formatColumns
    .filter((c) => c.editable === false)
    .map((c) => c.name.trim())
    .filter(Boolean);
  const colNames = formatColumns.map((c) => c.name.trim()).filter(Boolean);
  const namesToCompare = lockedNames.length > 0 ? lockedNames : colNames;

  const matches: number[] = [];
  for (let j = 0; j < templateRows.length; j++) {
    if (isTemplateRowDeleted(templateRows[j])) continue;
    const tr = templateRows[j] as Record<string, unknown>;
    let ok = true;
    for (const n of namesToCompare) {
      if (normalizeCell(fileRow[n]) !== normalizeCell(tr[n])) {
        ok = false;
        break;
      }
    }
    if (ok) matches.push(j);
  }
  if (matches.length === 0) return null;
  return matches[0];
}

export type ReconcilePickFileResult = {
  rows: Record<string, unknown>[];
  indices: number[];
  changed: boolean;
};

/**
 * Remove file rows whose template row was soft-deleted; realign indices using stored picks and/or content match.
 */
export function reconcilePickFileWithTemplate(
  fileRows: Record<string, unknown>[],
  templateRows: unknown[],
  formatColumns: FormatCol[],
  storedIndices: number[] | undefined | null
): ReconcilePickFileResult {
  const outRows: Record<string, unknown>[] = [];
  const outIndices: number[] = [];

  const hasStores = Array.isArray(storedIndices) && storedIndices.length === fileRows.length;

  for (let i = 0; i < fileRows.length; i++) {
    const fr = fileRows[i];
    let templateIdx: number | null = null;

    if (hasStores && typeof storedIndices![i] === 'number') {
      const s = storedIndices![i];
      if (s >= 0 && s < templateRows.length && !isTemplateRowDeleted(templateRows[s])) {
        templateIdx = s;
      } else if (s >= 0 && s < templateRows.length && isTemplateRowDeleted(templateRows[s])) {
        templateIdx = findTemplateIndexForFileRow(fr, templateRows, formatColumns);
        if (templateIdx === null) {
          continue;
        }
      } else {
        templateIdx = findTemplateIndexForFileRow(fr, templateRows, formatColumns);
        if (templateIdx === null) continue;
      }
    } else {
      templateIdx = findTemplateIndexForFileRow(fr, templateRows, formatColumns);
      if (templateIdx === null) continue;
    }

    if (templateIdx === null || templateIdx < 0 || templateIdx >= templateRows.length) continue;
    if (isTemplateRowDeleted(templateRows[templateIdx])) {
      const alt = findTemplateIndexForFileRow(fr, templateRows, formatColumns);
      if (alt === null) continue;
      templateIdx = alt;
    }

    outRows.push(fr);
    outIndices.push(templateIdx);
  }

  let changed = outRows.length !== fileRows.length;
  if (!changed && hasStores && outIndices.length === storedIndices!.length) {
    changed = outIndices.some((v, k) => v !== storedIndices![k]);
  }

  return { rows: outRows, indices: outIndices, changed };
}

/**
 * Overlay master template values only for locked (non-editable) columns.
 * Editable columns keep the employee's saved values; otherwise reopening the file would
 * wipe edits whenever the template still differed from the pick file.
 */
export function mergePickFileRowsFromTemplate(
  fileRows: Record<string, unknown>[],
  templateIndices: number[],
  templateRows: unknown[],
  formatColumns: FormatCol[]
): { rows: Record<string, unknown>[]; changed: boolean } {
  const formatColumnNames = formatColumns.map((c) => c.name.trim()).filter(Boolean);
  let anyChanged = false;
  const rows = fileRows.map((fr, i) => {
    const t = templateIndices[i];
    if (typeof t !== 'number' || t < 0 || t >= templateRows.length) return fr;
    if (isTemplateRowDeleted(templateRows[t])) return fr;
    const tr = templateRows[t] as Record<string, unknown>;
    const next = { ...fr };
    let rowChanged = false;
    for (const col of formatColumnNames) {
      if (!col || col.startsWith('__')) continue;
      if (!Object.prototype.hasOwnProperty.call(tr, col)) continue;
      const colDef = formatColumns.find((c) => c.name.trim() === col);
      if (colDef?.editable !== false) continue;
      const nv = tr[col];
      if (normalizeCell(next[col]) !== normalizeCell(nv)) {
        rowChanged = true;
      }
      next[col] = nv;
    }
    if (rowChanged) anyChanged = true;
    return next;
  });
  return { rows, changed: anyChanged };
}
