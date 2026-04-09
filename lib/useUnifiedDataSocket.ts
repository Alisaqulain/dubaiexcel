'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

export type UnifiedRowPayload = Record<string, unknown> & { _id?: string };

export function useUnifiedDataSocket(
  token: string | null | undefined,
  handlers: {
    onRowUpdated?: (row: UnifiedRowPayload) => void;
    onRowDeleted?: (payload: { rowId: string }) => void;
    onRowRestored?: (row: UnifiedRowPayload) => void;
    onRowPicked?: (row: UnifiedRowPayload) => void;
    onRowUnpicked?: (row: UnifiedRowPayload) => void;
    onRowsImported?: (payload: { count: number }) => void;
  }
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!token) return;
    const url = typeof window !== 'undefined' ? window.location.origin : undefined;
    const socket: Socket = io(url, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    const h = handlersRef.current;
    socket.on('row_updated', (row: UnifiedRowPayload) => h.onRowUpdated?.(row));
    socket.on('row_deleted', (payload: { rowId: string }) => h.onRowDeleted?.(payload));
    socket.on('row_restored', (row: UnifiedRowPayload) => h.onRowRestored?.(row));
    socket.on('row_picked', (row: UnifiedRowPayload) => h.onRowPicked?.(row));
    socket.on('row_unpicked', (row: UnifiedRowPayload) => h.onRowUnpicked?.(row));
    socket.on('rows_imported', (payload: { count: number }) => h.onRowsImported?.(payload));

    return () => {
      socket.disconnect();
    };
  }, [token]);
}
