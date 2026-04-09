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
