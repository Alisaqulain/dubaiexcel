import type { UnifiedSocketPayload } from '@/lib/unifiedDataPayloadTypes';
import type { SerializedUnifiedRow } from '@/lib/unifiedDataRowSerialize';

export type { UnifiedSocketPayload };

export function emitUnifiedDataEvent(payload: UnifiedSocketPayload) {
  try {
    global.unifiedDataIo?.to('unified-data').emit('unified-data', payload);
  } catch (e) {
    console.error('emitUnifiedDataEvent:', e);
  }
}

export function emitRowUpdated(row: SerializedUnifiedRow) {
  emitUnifiedDataEvent({
    type: 'row-updated',
    rowId: row._id,
    row: row as unknown as Record<string, unknown>,
  });
}

export function emitRowDeleted(rowId: string) {
  emitUnifiedDataEvent({ type: 'row-removed', rowId });
}

export function emitRowRestored(row: SerializedUnifiedRow) {
  emitUnifiedDataEvent({
    type: 'row-restored',
    rowId: row._id,
    row: row as unknown as Record<string, unknown>,
  });
}

export function emitRowPicked(row: SerializedUnifiedRow) {
  emitUnifiedDataEvent({
    type: 'row-picked',
    rowId: row._id,
    row: row as unknown as Record<string, unknown>,
  });
}

export function emitRowUnpicked(row: SerializedUnifiedRow) {
  emitUnifiedDataEvent({
    type: 'row-unpicked',
    rowId: row._id,
    row: row as unknown as Record<string, unknown>,
  });
}

export function emitRowsImported(count: number) {
  emitUnifiedDataEvent({ type: 'rows-imported', count });
}

/** Notify admin merge view when an employee saved a file for this format (live refresh). */
export function emitFormatDailyMergeInvalidate(payload: { formatId: string }) {
  try {
    const id = payload?.formatId;
    if (!id || typeof id !== 'string') return;
    global.unifiedDataIo?.to('unified-data').emit('format_daily_merge_invalidate', { formatId: id });
  } catch (e) {
    console.error('emitFormatDailyMergeInvalidate:', e);
  }
}
