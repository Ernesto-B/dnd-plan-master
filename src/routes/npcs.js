const express = require('express');
const router  = express.Router();
const npcStore = require('../services/npcStore');
const sessionStore = require('../services/sessionStore');
const encounterStore = require('../services/encounterStore');
const markdownGenerator = require('../services/npcMarkdownGenerator');
const pdfGenerator = require('../services/pdfGenerator');
const pdfTemplate = require('../templates/npcPdfTemplate');
const campaignStore = require('../services/campaignStore');

function filename(id) {
  return `npc-${String(id).replace(/^n-?/i, '')}`;
}

router.get('/', async (_req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    res.json(await npcStore.getAllNpcs(campaignId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/reorder', async (_req, res) => {
  try {
    const ids = Array.isArray(_req.body?.ids) ? _req.body.ids : [];
    const campaignId = await campaignStore.getActiveCampaignId();
    const ordered = await npcStore.reorderNpcs(ids, campaignId);
    res.json({ success: true, ids: ordered.map(npc => npc.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/linked-sessions', async (req, res) => {
  try {
    const npc = await npcStore.getNpc(req.params.id);
    if (!npc) return res.status(404).json({ error: 'NPC not found' });
    const ids = npc.linkedSessions || [];
    const results = await Promise.all(ids.map(async sid => {
      const s = await sessionStore.getSession(sid);
      return { id: sid, sessionNumber: s?.sessionNumber, goal: s?.goal, date: s?.date, exists: !!s };
    }));
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/linked-encounters', async (req, res) => {
  try {
    const npc = await npcStore.getNpc(req.params.id);
    if (!npc) return res.status(404).json({ error: 'NPC not found' });
    const ids = npc.linkedEncounters || [];
    const results = await Promise.all(ids.map(async eid => {
      const encounter = await encounterStore.getEncounter(eid);
      return {
        id: eid,
        name: encounter?.name || eid,
        fiction: encounter?.fiction || '',
        exists: !!encounter,
      };
    }));
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const npc = await npcStore.getNpc(req.params.id);
    if (!npc) return res.status(404).json({ error: 'NPC not found' });
    res.json(npc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/export', async (req, res) => {
  try {
    const data = req.body || {};
    const markdown = markdownGenerator.generate(data);
    const html = pdfTemplate.render(data);
    const pdf = await pdfGenerator.generateFromHtml(html);
    const id = data.id || 'new';
    res.json({ filename: filename(id), markdown, pdf: pdf.toString('base64') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
    const campaignId = await campaignStore.getActiveCampaignId();
    res.json(await npcStore.saveNpc({ ...req.body, campaignId }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
    res.json(await npcStore.saveNpc({ ...req.body, id: req.params.id }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/tags', async (req, res) => {
  try {
    const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
    await npcStore.updateTags(req.params.id, tags);
    res.json({ success: true, tags });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await npcStore.deleteNpc(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

module.exports = router;
