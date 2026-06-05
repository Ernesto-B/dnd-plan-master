const { startServer } = require('./server');

startServer()
  .then(({ url }) => {
    console.log(`\n⚔  D&D Session Master running at ${url}\n`);
  })
  .catch((err) => {
    console.error('Failed to start D&D Session Master:', err);
    process.exit(1);
  });
