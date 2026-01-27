const fastify = require('fastify');
const fastifyStatic = require('@fastify/static');

const port = parseInt(process.argv[2] || '27016', 10); // default
const host = process.argv[3] || '0.0.0.0'; // default

const app = fastify({
  logger: false,
});

app.register(fastifyStatic, {
  root: process.cwd(),
  prefix: '/',
  index: ['index.html'],
  dotfiles: 'deny',
});

// multiplayer server
let multiplayerServer = null;
try {
  const { MultiplayerServer } = require('./dist/server/index.js');
  multiplayerServer = new MultiplayerServer();
  app.register(async (fastify) => {
    await multiplayerServer.register(fastify);
  });
  console.log('multiplayer server initialized');
} catch (err) {
  console.warn('run npm run build:server', err.message);
}

async function start() {
  try {
    await app.listen({ port, host });

    console.log(`monkey balls gameplay is now at http://${host}:${port}/`);
    if (multiplayerServer) {
      console.log(`multiplayer WebSocket at ws://${host}:${port}/multiplayer`);
    }

  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`ERROR: port ${port} is already in use!`);
      console.error(`use node serve.js <PORT> to choose a different port`);
    } else if (err.code === 'EACCES') {
      console.error(`ERROR: permission denied for port ${port}!`);
      console.error(`run with sudo (unrecommended) or pick a port >= 1024`);
    } else {
      console.error('error starting server:', err.message);
    }
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\nserver shutting down...');
  if (multiplayerServer) {
    await multiplayerServer.shutdown();
  }
  await app.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nserver shutting down...');
  if (multiplayerServer) {
    await multiplayerServer.shutdown();
  }
  await app.close();
  process.exit(0);
});

start();
