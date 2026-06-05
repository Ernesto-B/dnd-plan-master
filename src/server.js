const { createApp } = require('./createApp');
const backupScheduler = require('./services/backupScheduler');

async function startServer(options = {}) {
  const port = options.port ?? (Number(process.env.PORT) || 3000);
  const host = options.host || '127.0.0.1';
  const app = createApp();
  await backupScheduler.start();

  return await new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({ app, server, port: actualPort, host, url: `http://${host}:${actualPort}` });
    });

    server.on('error', reject);
  });
}

module.exports = { startServer };
