const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const JWT_SECRET =
  process.env.JWT_SECRET || 'change_this_to_a_strong_secret_in_production';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: true, credentials: true },
  });

  io.use((socket, nextFn) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token || typeof token !== 'string') {
        return nextFn(new Error('Authentication required'));
      }
      jwt.verify(token, JWT_SECRET);
      return nextFn();
    } catch {
      return nextFn(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join('unified-data');
  });

  global.unifiedDataIo = io;

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port} (socket.io /socket.io)`);
  });
});
