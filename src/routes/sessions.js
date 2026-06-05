const express = require('express');
const fs      = require('fs').promises;
const path    = require('path');
const router  = express.Router();

const sessionStore       = require('../services/sessionStore');
const encounterStore     = require('../services/encounterStore');
const markdownGenerator  = require('../services/markdownGenerator');
const encounterMdGen     = require('../services/encounterMarkdownGenerator');
const pdfGenerator       = require('../services/pdfGenerator');
const folderPicker       = require('../services/folderPicker');
const planRelations      = require('../services/planRelations');
const encounterPdfTemplate = require('../templates/encounterPdfTemplate');

function sessionFilename(session) {
  return `session-${String(session.sessionNumber).padStart(3, '0')}`;
}

function encounterFilename(id) {
  return `encounter-${String(id).replace(/^[eE]-?0*/i, '')}`;
}

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

router.post('/:id/export-packet', async (req, res) => {
  try {
    const session = await sessionStore.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const folder = await folderPicker.pick();
    if (!folder) return res.json({ cancelled: true });

    const sessionMarkdown = markdownGenerator.generate(session.data);
    const sessionPdf = await pdfGenerator.generate(session.data);
    const sessionBase = sessionFilename(session);

    await fs.writeFile(path.join(folder, `${sessionBase}.md`), sessionMarkdown, 'utf8');
    await fs.writeFile(path.join(folder, `${sessionBase}.pdf`), sessionPdf);

    const links = await planRelations.getSessionLinks(session.id);
    let exportedEncounterCount = 0;
    let missingEncounterCount = 0;

    for (const link of links) {
      const encounter = await encounterStore.getEncounter(link.id);
      if (!encounter) {
        missingEncounterCount++;
        continue;
      }

      const encounterMarkdown = encounterMdGen.generate(encounter.data);
      const encounterPdf = await pdfGenerator.generateFromHtml(encounterPdfTemplate.render(encounter.data));
      const encounterBase = encounterFilename(encounter.id);

      await fs.writeFile(path.join(folder, `${encounterBase}.md`), encounterMarkdown, 'utf8');
      await fs.writeFile(path.join(folder, `${encounterBase}.pdf`), encounterPdf);
      exportedEncounterCount++;
    }

    res.json({
      success: true,
      path: folder,
      sessionBase,
      exportedEncounterCount,
      missingEncounterCount,
    });
  } catch (err) {
    console.error('Export-packet error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List all sessions (summary only)
router.get('/', async (_req, res) => {
  try {
    const [summaries, sessions, encounters] = await Promise.all([
      sessionStore.getAllSessions(),
      sessionStore.getAllFull(),
      encounterStore.getAllFull(),
    ]);
    const index = planRelations.buildRelationIndex(sessions, encounters);
    res.json(summaries.map(session => ({
      ...session,
      linkedEncounterCount: index.sessionToEncounters.get(session.id)?.size || 0,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/links', async (req, res) => {
  try {
    res.json(await planRelations.getSessionLinks(req.params.id));
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
      filename:      sessionFilename(saved),
    });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update tags
router.patch('/:id/tags', async (req, res) => {
  try {
    const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
    await sessionStore.updateTags(req.params.id, tags);
    res.json({ success: true, tags });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
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
