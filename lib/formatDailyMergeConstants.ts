/** Shared merge column names — safe to import from client components (no DB). */

export const SUBMITTED_BY_COL = 'Submitted by';
/** Who claimed the template row (Format view / pick); not overwritten by save overlay. */
export const PICKED_BY_COL = 'Picked by';
/** Employee’s saved .xlsx display name (same workbook for every row from that file). */
export const SAVED_AT_COL = 'Saved at (file)';
export const LAST_SAVED_COL = 'Last saved';
/** Internal row meta for admin UI (open full file); not listed in columnOrder / Excel. */
export const ROW_SOURCE_FILE_ID = '_sourceFileId';
export const MERGE_NOTE_COL = 'Merge note';
