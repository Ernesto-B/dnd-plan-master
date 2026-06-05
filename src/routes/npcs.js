const express = require('express');
const router  = express.Router();
const npcStore = require('../services/npcStore');

router.get('/', async (_req, res) => {
  try { res.json(await npcStore.getAllNpcs()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const npc = await npcStore.getNpc(req.params.id);
    if (!npc) return res.status(404).json({ error: 'NPC not found' });
    res.json(npc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
    res.json(await npcStore.saveNpc(req.body));
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
