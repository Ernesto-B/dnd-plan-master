const express  = require('express');
const fs        = require('fs').promises;
const path      = require('path');
const router    = express.Router();

const encounterStore   = require('../services/encounterStore');
const sessionStore     = require('../services/sessionStore');
const npcStore         = require('../services/npcStore');
const mdGen            = require('../services/encounterMarkdownGenerator');
const pdfGen           = require('../services/pdfGenerator');
const pdfTemplate      = require('../templates/encounterPdfTemplate');
const folderPicker     = require('../services/folderPicker');
const planRelations    = require('../services/planRelations');
const campaignStore    = require('../services/campaignStore');
const { TRASHED, normalizeStatus, isActive } = require('../services/recordLifecycle');

function filename(id) {
  return `encounter-${String(id).replace(/^[eE]-?0*/i, '')}`;
}

router.post('/preview', async (req, res) => {
  try {
    const data     = req.body;
    const markdown = mdGen.generate(data);
    const html     = pdfTemplate.render(data);
    const pdf      = await pdfGen.generateFromHtml(html);
    const id       = data.id || 'new';
    res.json({ filename: filename(id), markdown, pdf: pdf.toString('base64') });
  } catch (err) {
    console.error('Encounter preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/save-files', async (req, res) => {
  try {
    const { markdown, pdf, filename: fn } = req.body;
    const folder = await folderPicker.pick();
    if (!folder) return res.json({ cancelled: true });
    await fs.writeFile(path.join(folder, `${fn}.md`), markdown, 'utf8');
    await fs.writeFile(path.join(folder, `${fn}.pdf`), Buffer.from(pdf, 'base64'));
    res.json({ success: true, path: folder });
  } catch (err) {
    console.error('Encounter save-files error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (_req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const [summaries, sessions, encounters] = await Promise.all([
      encounterStore.getAllEncounters(campaignId),
      sessionStore.getAllFull(),
      encounterStore.getAllFull(),
    ]);
    const index = planRelations.buildRelationIndex(sessions.filter(isActive), encounters.filter(isActive));
    res.json(summaries.map(encounter => ({
      ...encounter,
      linkedSessionCount: index.encounterToSessions.get(encounter.id)?.size || 0,
    })));
  }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/reorder', async (_req, res) => {
  try {
    const ids = Array.isArray(_req.body?.ids) ? _req.body.ids : [];
    const campaignId = await campaignStore.getActiveCampaignId();
    const ordered = await encounterStore.reorderEncounters(ids, campaignId);
    res.json({ success: true, ids: ordered.map(encounter => encounter.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/links', async (req, res) => {
  try {
    res.json(await planRelations.getEncounterLinks(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/linked-npcs', async (req, res) => {
  try {
    const npcs = await npcStore.getAllNpcs();
    const linked = npcs
      .filter(npc => Array.isArray(npc.linkedEncounters) && npc.linkedEncounters.includes(req.params.id))
      .map(npc => ({
        id: npc.id,
        name: npc.name,
        nickname: npc.nickname || '',
        exists: true,
      }));
    res.json(linked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const enc = await encounterStore.getEncounter(req.params.id);
    if (!enc) return res.status(404).json({ error: 'Encounter not found' });
    res.json(enc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const data     = { ...req.body, campaignId };
    const markdown = mdGen.generate(data);
    const html     = pdfTemplate.render(data);
    const pdf      = await pdfGen.generateFromHtml(html);
    const saved    = await encounterStore.saveEncounter(data, markdown);
    res.json({
      id: saved.id,
      markdown,
      pdf: pdf.toString('base64'),
      filename: filename(saved.id),
    });
  } catch (err) {
    console.error('Encounter save error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/tags', async (req, res) => {
  try {
    const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
    await encounterStore.updateTags(req.params.id, tags);
    res.json({ success: true, tags });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

router.patch('/:id/state', async (req, res) => {
  try {
    const status = normalizeStatus(req.body?.status);
    const updated = await encounterStore.updateStatus(req.params.id, status);
    res.json({ success: true, status: updated.status });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const updated = await encounterStore.updateStatus(req.params.id, TRASHED);
    res.json({ success: true, status: updated.status });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

module.exports = router;
