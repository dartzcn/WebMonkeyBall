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

async function start() {
  try {
    await app.listen({ port, host });

    console.log(`monkey balls gameplay now at http://${host}:${port}/`);

  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`ERROR: port ${port} is already in use!`);
      console.error(`use node serve.js <PORT> to do a different port`);
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
  await app.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nserver shutting down...');
  await app.close();
  process.exit(0);
});

start();
