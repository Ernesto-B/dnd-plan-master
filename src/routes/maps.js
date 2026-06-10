const express        = require('express');
const router         = express.Router();
const mapStore       = require('../services/mapStore');
const campaignStore  = require('../services/campaignStore');

// GET /api/map — current campaign's map data
router.get('/', async (_req, res) => {
  try {
    const id   = await campaignStore.getActiveCampaignId();
    const data = await mapStore.getMap(id);
    res.json(data || { campaignId: id, imageFilename: null, pins: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/map — save pins (image unchanged)
router.post('/', async (req, res) => {
  try {
    const id       = await campaignStore.getActiveCampaignId();
    const existing = await mapStore.getMap(id);
    const record   = await mapStore.saveMap(id, {
      imageFilename: existing?.imageFilename ?? null,
      pins:          Array.isArray(req.body?.pins) ? req.body.pins : [],
    });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/map/image — upload a new map image (base64 data URL body)
router.post('/image', express.json({ limit: '30mb' }), async (req, res) => {
  try {
    const { dataUrl } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'dataUrl is required' });
    }
    const match = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i);
    if (!match) return res.status(400).json({ error: 'Invalid image data URL' });

    const ext      = '.' + (match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase());
    const buffer   = Buffer.from(match[2], 'base64');
    const id       = await campaignStore.getActiveCampaignId();
    const filename = await mapStore.saveMapImage(id, buffer, ext);

    const existing = await mapStore.getMap(id);
    await mapStore.saveMap(id, {
      imageFilename: filename,
      pins:          existing?.pins ?? [],
    });

    res.json({ filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/map — remove the current campaign's map image and all its pins
router.delete('/', async (_req, res) => {
  try {
    const id = await campaignStore.getActiveCampaignId();
    await mapStore.deleteMap(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/map/image — serve the current campaign's map image
router.get('/image', async (_req, res) => {
  try {
    const id   = await campaignStore.getActiveCampaignId();
    const data = await mapStore.getMap(id);
    if (!data?.imageFilename) return res.status(404).json({ error: 'No map image uploaded' });
    res.sendFile(mapStore.getMapImagePath(data.imageFilename));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
