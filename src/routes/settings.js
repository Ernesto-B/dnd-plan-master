const express = require('express');
const fs      = require('fs').promises;
const router  = express.Router();
const settingsStore  = require('../services/settingsStore');
const sessionStore   = require('../services/sessionStore');
const encounterStore = require('../services/encounterStore');
const backupStore    = require('../services/backupStore');
const backupScheduler = require('../services/backupScheduler');
const templateLibrary = require('../services/templateLibrary');
const { getDataFile } = require('../services/appPaths');

router.get('/', async (_req, res) => {
  try { res.json(await settingsStore.getSettings()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const saved = await settingsStore.saveSettings(req.body);
    await backupScheduler.refreshSchedule();
    res.json(saved);
  }
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

router.get('/templates', async (_req, res) => {
  try {
    res.json(await templateLibrary.getTemplates());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/templates/:type', async (req, res) => {
  try {
    const { name, data } = req.body || {};
    if (!name || !data) return res.status(400).json({ error: 'Template name and data are required' });
    res.json(await templateLibrary.saveTemplate(req.params.type, name, data));
  } catch (err) {
    res.status(err.message.includes('Unsupported template type') ? 400 : 500).json({ error: err.message });
  }
});

router.delete('/templates/:type/:id', async (req, res) => {
  try {
    await templateLibrary.deleteTemplate(req.params.type, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : err.message.includes('Unsupported template type') ? 400 : 500).json({ error: err.message });
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
    const restored = await backupStore.restoreBackup(name);
    await backupScheduler.refreshSchedule();
    res.json(restored);
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
