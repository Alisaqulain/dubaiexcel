'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { UnifiedSocketPayload } from '@/lib/unifiedDataPayloadTypes';

export function useUnifiedDataSocket(
  token: string | null,
  onEvent: (payload: UnifiedSocketPayload) => void
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!token) return;

    const url =
      typeof window !== 'undefined'
        ? process.env.NEXT_PUBLIC_APP_ORIGIN || window.location.origin
        : '';

    const socket: Socket = io(url, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('unified-data', (payload: UnifiedSocketPayload) => {
      onEventRef.current(payload);
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);
}
