const express = require('express');
const path = require('path');

const sessionsRouter   = require('./routes/sessions');
const encountersRouter = require('./routes/encounters');
const settingsRouter   = require('./routes/settings');
const npcsRouter       = require('./routes/npcs');
const locationsRouter  = require('./routes/locations');
const factionsRouter   = require('./routes/factions');
const searchRouter     = require('./routes/search');
const exportRouter     = require('./routes/export');
const campaignsRouter  = require('./routes/campaigns');
const mapsRouter       = require('./routes/maps');
const campaignStore    = require('./services/campaignStore');
const demoSeed         = require('./services/demoSeed');

async function initApp() {
  const { firstLaunch } = await campaignStore.init();
  if (firstLaunch) {
    await demoSeed.generateDemoCampaign({ activate: true });
  }
}

function createApp() {
  const app = express();

  // Must precede the global parser — map image uploads arrive as base64 JSON
  app.use('/api/map/image', express.json({ limit: '50mb' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));
  app.get('/vendor/marked.js', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'node_modules', 'marked', 'lib', 'marked.umd.js'));
  });

  app.use('/api/sessions', sessionsRouter);
  app.use('/api/encounters', encountersRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/npcs', npcsRouter);
  app.use('/api/locations', locationsRouter);
  app.use('/api/factions', factionsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/map', mapsRouter);

  const pub = p => path.join(__dirname, '..', 'public', p);

  // ─── React SPA ───────────────────────────────────────────────────────────
  // Migration complete: every page is now React. Express serves the Vite build
  // and React Router owns all non-API paths. (`pub` retained for any future use.)
  void pub;
  // Serves the Vite build; React Router owns every path not claimed above.
  const clientDir = path.join(__dirname, '..', 'dist-client');
  app.use(express.static(clientDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next(); // unmatched API → 404
    res.sendFile(path.join(clientDir, 'index.html'), err => {
      if (err) res.status(500).send('SPA bundle missing — run `npm run build`.');
    });
  });

  return app;
}

module.exports = { createApp, initApp };
