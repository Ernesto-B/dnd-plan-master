const express = require('express');
const path = require('path');

const sessionsRouter  = require('./routes/sessions');
const encountersRouter = require('./routes/encounters');
const settingsRouter  = require('./routes/settings');
const npcsRouter      = require('./routes/npcs');
const searchRouter    = require('./routes/search');
const exportRouter    = require('./routes/export');

function createApp() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/vendor/marked.js', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'node_modules', 'marked', 'lib', 'marked.umd.js'));
  });

  app.use('/api/sessions', sessionsRouter);
  app.use('/api/encounters', encountersRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/npcs', npcsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/export', exportRouter);

  const pub = p => path.join(__dirname, '..', 'public', p);

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
  app.get('/campaign', (_req, res) => res.sendFile(pub('campaign.html')));
  app.get('/settings', (_req, res) => res.sendFile(pub('settings.html')));
  app.get('/run/:id',  (_req, res) => res.sendFile(pub('run.html')));
  app.get('/shell',    (_req, res) => res.sendFile(pub('shell.html')));

  return app;
}

module.exports = { createApp };
