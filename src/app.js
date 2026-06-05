const express = require('express');
const path    = require('path');

const sessionsRouter   = require('./routes/sessions');
const encountersRouter = require('./routes/encounters');
const settingsRouter   = require('./routes/settings');

const app  = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/sessions',   sessionsRouter);
app.use('/api/encounters', encountersRouter);
app.use('/api/settings',   settingsRouter);

const pub = p => path.join(__dirname, '..', 'public', p);

app.get('/form',                    (_req, res) => res.sendFile(pub('form.html')));
app.get('/view/:id',                (_req, res) => res.sendFile(pub('view.html')));
app.get('/encounters',              (_req, res) => res.sendFile(pub('encounters.html')));
app.get('/encounter/new',           (_req, res) => res.sendFile(pub('encounter-form.html')));
app.get('/encounter/edit/:id',      (_req, res) => res.sendFile(pub('encounter-form.html')));
app.get('/encounter/view/:id',      (_req, res) => res.sendFile(pub('encounter-view.html')));
app.get('/settings',                (_req, res) => res.sendFile(pub('settings.html')));

app.listen(PORT, () => {
  console.log(`\n⚔  D&D Session Master running at http://localhost:${PORT}\n`);
});
