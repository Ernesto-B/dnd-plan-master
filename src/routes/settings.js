const express = require('express');
const fs      = require('fs').promises;
const router  = express.Router();
const settingsStore  = require('../services/settingsStore');
const sessionStore   = require('../services/sessionStore');
const encounterStore = require('../services/encounterStore');
const backupStore    = require('../services/backupStore');
const { getDataFile } = require('../services/appPaths');

router.get('/', async (_req, res) => {
  try { res.json(await settingsStore.getSettings()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try { res.json(await settingsStore.saveSettings(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/export-data', async (_req, res) => {
  try {
    const [sessions, encounters] = await Promise.all([
      sessionStore.getAllFull(),
      encounterStore.getAllFull(),
    ]);
    res.json({ sessions, encounters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const { sessions = [], encounters = [] } = req.body;
    const [importedSessions, importedEncounters] = await Promise.all([
      sessionStore.importSessions(sessions),
      encounterStore.importEncounters(encounters),
    ]);
    res.json({ importedSessions, importedEncounters });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/backups', async (_req, res) => {
  try {
    res.json(await backupStore.listBackups());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backup', async (_req, res) => {
  try {
    res.json(await backupStore.createBackup());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/restore', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Backup name is required' });
    res.json(await backupStore.restoreBackup(name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/data', async (_req, res) => {
  try {
    await Promise.allSettled([
      fs.unlink(getDataFile('sessions.json')),
      fs.unlink(getDataFile('encounters.json')),
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
