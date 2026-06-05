const express = require('express');
const fs      = require('fs').promises;
const path    = require('path');
const router  = express.Router();

const sessionStore       = require('../services/sessionStore');
const markdownGenerator  = require('../services/markdownGenerator');
const pdfGenerator       = require('../services/pdfGenerator');
const folderPicker       = require('../services/folderPicker');

// Generate preview without saving to the store
router.post('/preview', async (req, res) => {
  try {
    const data     = req.body;
    const markdown = markdownGenerator.generate(data);
    const pdf      = await pdfGenerator.generate(data);
    const num      = String(data.sessionNumber || 0).padStart(3, '0');
    res.json({ filename: `session-${num}`, markdown, pdf: pdf.toString('base64') });
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Open native OS folder picker and write the files there
router.post('/save-files', async (req, res) => {
  try {
    const { markdown, pdf, filename } = req.body;

    const folder = await folderPicker.pick();
    if (!folder) return res.json({ cancelled: true });

    await fs.writeFile(path.join(folder, `${filename}.md`), markdown, 'utf8');
    await fs.writeFile(path.join(folder, `${filename}.pdf`), Buffer.from(pdf, 'base64'));

    res.json({ success: true, path: folder });
  } catch (err) {
    console.error('Save-files error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List all sessions (summary only)
router.get('/', async (_req, res) => {
  try {
    res.json(await sessionStore.getAllSessions());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single session
router.get('/:id', async (req, res) => {
  try {
    const session = await sessionStore.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save session to the store (called after user confirms preview)
router.post('/', async (req, res) => {
  try {
    const data     = req.body;
    const markdown = markdownGenerator.generate(data);
    const pdf      = await pdfGenerator.generate(data);
    const saved    = await sessionStore.saveSession(data, markdown);
    res.json({
      id:            saved.id,
      sessionNumber: saved.sessionNumber,
      markdown,
      pdf:           pdf.toString('base64'),
      filename:      `session-${String(saved.sessionNumber).padStart(3, '0')}`,
    });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete session
router.delete('/:id', async (req, res) => {
  try {
    await sessionStore.deleteSession(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

module.exports = router;
