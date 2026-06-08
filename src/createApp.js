const express = require('express');
const path = require('path');

const sessionsRouter   = require('./routes/sessions');
const encountersRouter = require('./routes/encounters');
const settingsRouter   = require('./routes/settings');
const npcsRouter       = require('./routes/npcs');
const locationsRouter  = require('./routes/locations');
const searchRouter     = require('./routes/search');
const exportRouter     = require('./routes/export');
const campaignsRouter  = require('./routes/campaigns');
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
  app.use('/api/search', searchRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/campaigns', campaignsRouter);

  const pub = p => path.join(__dirname, '..', 'public', p);

  app.get('/', (_req, res) => res.sendFile(pub('campaign.html')));
  app.get('/sessions', (_req, res) => res.sendFile(pub('sessions.html')));
  app.get('/form', (_req, res) => res.sendFile(pub('form.html')));
  app.get('/view/:id', (_req, res) => res.sendFile(pub('view.html')));
  app.get('/encounters', (_req, res) => res.sendFile(pub('encounters.html')));
  app.get('/encounter/new', (_req, res) => res.sendFile(pub('encounter-form.html')));
  app.get('/encounter/edit/:id', (_req, res) => res.sendFile(pub('encounter-form.html')));
  app.get('/encounter/view/:id', (_req, res) => res.sendFile(pub('encounter-view.html')));
  app.get('/npcs', (_req, res) => res.sendFile(pub('npcs.html')));
  app.get('/npc/new', (_req, res) => res.sendFile(pub('npc-form.html')));
  app.get('/npc/edit/:id', (_req, res) => res.sendFile(pub('npc-form.html')));
  app.get('/npc/view/:id', (_req, res) => res.sendFile(pub('npc-view.html')));
  app.get('/locations', (_req, res) => res.sendFile(pub('locations.html')));
  app.get('/location/new', (_req, res) => res.sendFile(pub('location-form.html')));
  app.get('/location/edit/:id', (_req, res) => res.sendFile(pub('location-form.html')));
  app.get('/location/view/:id', (_req, res) => res.sendFile(pub('location-view.html')));
  app.get('/campaign', (_req, res) => res.sendFile(pub('campaign.html')));
  app.get('/campaigns', (_req, res) => res.sendFile(pub('campaigns.html')));
  app.get('/settings', (_req, res) => res.sendFile(pub('settings.html')));
  app.get('/run/:id',  (_req, res) => res.sendFile(pub('run.html')));
  app.get('/shell',    (_req, res) => res.sendFile(pub('shell.html')));

  return app;
}

module.exports = { createApp, initApp };
