const express = require('express');
const router = express.Router();
const factionStore = require('../services/factionStore');
const sessionStore = require('../services/sessionStore');
const encounterStore = require('../services/encounterStore');
const npcStore = require('../services/npcStore');
const locationStore = require('../services/locationStore');
const markdownGenerator = require('../services/factionMarkdownGenerator');
const pdfGenerator = require('../services/pdfGenerator');
const pdfTemplate = require('../templates/factionPdfTemplate');
const campaignStore = require('../services/campaignStore');
const { TRASHED, normalizeStatus, isLive } = require('../services/recordLifecycle');

function filename(id) {
  return `faction-${String(id).replace(/^f-?/i, '')}`;
}

router.get('/', async (_req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const [factions, sessions, encounters, npcs, locations] = await Promise.all([
      factionStore.getAllFactions(campaignId),
      sessionStore.getAllFull(),
      encounterStore.getAllFull(),
      npcStore.getAllFull(),
      locationStore.getAllFull(),
    ]);
    const liveSessionIds = new Set(sessions.filter(isLive).map(item => item.id));
    const liveEncounterIds = new Set(encounters.filter(isLive).map(item => item.id));
    const liveNpcIds = new Set(npcs.filter(isLive).map(item => item.id));
    const liveLocationIds = new Set(locations.filter(isLive).map(item => item.id));
    res.json(factions.map(faction => ({
      ...faction,
      linkedSessions: (faction.linkedSessions || []).filter(id => liveSessionIds.has(id)),
      linkedEncounters: (faction.linkedEncounters || []).filter(id => liveEncounterIds.has(id)),
      linkedNpcs: (faction.linkedNpcs || []).filter(id => liveNpcIds.has(id)),
      linkedLocations: (faction.linkedLocations || []).filter(id => liveLocationIds.has(id)),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/reorder', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const campaignId = await campaignStore.getActiveCampaignId();
    const ordered = await factionStore.reorderFactions(ids, campaignId);
    res.json({ success: true, ids: ordered.map(faction => faction.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/linked-sessions', async (req, res) => {
  try {
    const faction = await factionStore.getFaction(req.params.id);
    if (!faction) return res.status(404).json({ error: 'Faction not found' });
    const ids = faction.linkedSessions || [];
    const results = await Promise.all(ids.map(async sid => {
      const session = await sessionStore.getSession(sid);
      return { id: sid, sessionNumber: session?.sessionNumber, goal: session?.goal, date: session?.date, exists: !!session };
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/linked-encounters', async (req, res) => {
  try {
    const faction = await factionStore.getFaction(req.params.id);
    if (!faction) return res.status(404).json({ error: 'Faction not found' });
    const ids = faction.linkedEncounters || [];
    const results = await Promise.all(ids.map(async encounterId => {
      const encounter = await encounterStore.getEncounter(encounterId);
      return { id: encounterId, name: encounter?.name || encounterId, fiction: encounter?.fiction || '', exists: !!encounter };
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/linked-npcs', async (req, res) => {
  try {
    const faction = await factionStore.getFaction(req.params.id);
    if (!faction) return res.status(404).json({ error: 'Faction not found' });
    const ids = faction.linkedNpcs || [];
    const results = await Promise.all(ids.map(async npcId => {
      const npc = await npcStore.getNpc(npcId);
      return { id: npcId, name: npc?.name || npcId, nickname: npc?.nickname || '', exists: !!npc };
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/linked-locations', async (req, res) => {
  try {
    const faction = await factionStore.getFaction(req.params.id);
    if (!faction) return res.status(404).json({ error: 'Faction not found' });
    const ids = faction.linkedLocations || [];
    const results = await Promise.all(ids.map(async locationId => {
      const location = await locationStore.getLocation(locationId);
      return { id: locationId, name: location?.name || locationId, description: location?.description || '', exists: !!location };
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const faction = await factionStore.getFaction(req.params.id);
    if (!faction) return res.status(404).json({ error: 'Faction not found' });
    res.json(faction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    res.json(await factionStore.saveFaction({ ...req.body, campaignId }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
    res.json(await factionStore.saveFaction({ ...req.body, id: req.params.id }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/tags', async (req, res) => {
  try {
    const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
    const updatedTags = await factionStore.updateTags(req.params.id, tags);
    res.json({ success: true, tags: updatedTags });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

router.patch('/:id/state', async (req, res) => {
  try {
    const status = normalizeStatus(req.body?.status);
    const updated = await factionStore.updateStatus(req.params.id, status);
    res.json({ success: true, status: updated.status, tags: updated.tags || [] });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const updated = await factionStore.updateStatus(req.params.id, TRASHED);
    res.json({ success: true, status: updated.status });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

module.exports = router;
