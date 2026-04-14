/** Original index in FormatTemplateData.rows (stable when rows are soft-deleted). */
export const TEMPLATE_ROW_INDEX = '__templateRowIndex' as const;

export function isTemplateRowDeleted(row: unknown): boolean {
  return !!(row && typeof row === 'object' && (row as Record<string, unknown>).__deleted === true);
}

/**
 * Build template rows for employees: exclude soft-deleted rows; attach stable index for picks/API.
 */
export function buildEmployeeTemplatePayload(allRows: unknown[] | undefined | null, templateLimit: number) {
  const input = Array.isArray(allRows) ? allRows : [];
  const active: Record<string, unknown>[] = [];
  for (let i = 0; i < input.length; i++) {
    const r = input[i];
    if (isTemplateRowDeleted(r)) continue;
    const row =
      r && typeof r === 'object'
        ? { ...(r as Record<string, unknown>) }
        : ({} as Record<string, unknown>);
    delete row.__deleted;
    row[TEMPLATE_ROW_INDEX] = i;
    active.push(row);
  }
  const templateRowCount = active.length;
  const templateRows = templateRowCount > templateLimit ? active.slice(0, templateLimit) : active;
  return { templateRows, templateRowCount };
}

/**
 * Full template rows at given original row indices (FormatTemplateData.rows positions).
 * Used when picks point past the first 250 rows sent for quick UI load.
 */
export function getTemplateRowsByOriginalIndices(
  allRows: unknown[] | undefined | null,
  indices: number[]
): Record<string, Record<string, unknown>> {
  const input = Array.isArray(allRows) ? allRows : [];
  const out: Record<string, Record<string, unknown>> = {};
  const seen = new Set<number>();
  for (const n of indices) {
    if (typeof n !== 'number' || n < 0 || !Number.isInteger(n) || seen.has(n)) continue;
    seen.add(n);
    if (n >= input.length) continue;
    const r = input[n];
    if (isTemplateRowDeleted(r)) continue;
    const row =
      r && typeof r === 'object'
        ? { ...(r as Record<string, unknown>) }
        : ({} as Record<string, unknown>);
    delete row.__deleted;
    row[TEMPLATE_ROW_INDEX] = n;
    out[String(n)] = row;
  }
  return out;
}

type ColumnLockSpec = { name: string; editable?: boolean };

export type MergeTemplateOptions = {
  /**
   * When true (My data / daily save): only columns with editable===true keep saved values;
   * everything else comes from HR template (avoids junk in columns that default to editable in DB).
   */
  explicitEditableOnly?: boolean;
};

/**
 * Rebuild rows: template baseline + saved overrides based on column editability.
 */
export function mergeSavedRowsWithTemplateByLocks(
  savedRows: Record<string, unknown>[],
  pickIndices: number[],
  templateRowsByIndex: Record<string, Record<string, unknown>>,
  columns: ColumnLockSpec[],
  opts?: MergeTemplateOptions
): Record<string, unknown>[] {
  const explicitOnly = !!opts?.explicitEditableOnly;
  return savedRows.map((savedRow, i) => {
    const tIdx = pickIndices[i];
    if (typeof tIdx !== 'number' || tIdx < 0) {
      return { ...savedRow };
    }
    const base = templateRowsByIndex[String(tIdx)];
    if (!base || typeof base !== 'object') {
      return { ...savedRow };
    }
    const out: Record<string, unknown> = { ...base };
    for (const col of columns) {
      const name = col.name;
      const useSaved = explicitOnly ? col.editable === true : col.editable !== false;
      if (!useSaved) {
        out[name] = base[name] ?? '';
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(savedRow, name)) {
        out[name] = savedRow[name];
      } else if (base[name] !== undefined) {
        out[name] = base[name];
      }
    }
    out[TEMPLATE_ROW_INDEX] = tIdx;
    return out;
  });
}
