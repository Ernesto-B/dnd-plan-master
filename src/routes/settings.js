const express = require('express');
const fs      = require('fs').promises;
const path    = require('path');
const router  = express.Router();
const settingsStore = require('../services/settingsStore');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

router.get('/', async (_req, res) => {
  try { res.json(await settingsStore.getSettings()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try { res.json(await settingsStore.saveSettings(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/data', async (_req, res) => {
  try {
    await Promise.allSettled([
      fs.unlink(path.join(DATA_DIR, 'sessions.json')),
      fs.unlink(path.join(DATA_DIR, 'encounters.json')),
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
