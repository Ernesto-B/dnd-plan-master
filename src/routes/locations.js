const express = require('express');
const router  = express.Router();
const locationStore = require('../services/locationStore');
const sessionStore = require('../services/sessionStore');
const markdownGenerator = require('../services/locationMarkdownGenerator');
const pdfGenerator = require('../services/pdfGenerator');
const pdfTemplate = require('../templates/locationPdfTemplate');
const campaignStore = require('../services/campaignStore');

function filename(id) {
  return `location-${String(id).replace(/^l-?/i, '')}`;
}

router.get('/', async (_req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    res.json(await locationStore.getAllLocations(campaignId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id/linked-sessions', async (req, res) => {
  try {
    const location = await locationStore.getLocation(req.params.id);
    if (!location) return res.status(404).json({ error: 'Location not found' });
    const ids = location.linkedSessions || [];
    const results = await Promise.all(ids.map(async sid => {
      const s = await sessionStore.getSession(sid);
      return { id: sid, sessionNumber: s?.sessionNumber, goal: s?.goal, date: s?.date, exists: !!s };
    }));
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const location = await locationStore.getLocation(req.params.id);
    if (!location) return res.status(404).json({ error: 'Location not found' });
    res.json(location);
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
    res.json(await locationStore.saveLocation({ ...req.body, campaignId }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
    res.json(await locationStore.saveLocation({ ...req.body, id: req.params.id }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id/tags', async (req, res) => {
  try {
    const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
    await locationStore.updateTags(req.params.id, tags);
    res.json({ success: true, tags });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await locationStore.deleteLocation(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

module.exports = router;
