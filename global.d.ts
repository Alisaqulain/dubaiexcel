import type { Server } from 'socket.io';

declare global {
  // Set by custom server.js for Socket.io broadcast from API routes
  // eslint-disable-next-line no-var
  var unifiedDataIo: Server | undefined;
}

export {};
