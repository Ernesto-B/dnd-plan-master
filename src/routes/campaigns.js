const express = require('express');
const router  = express.Router();

const campaignStore  = require('../services/campaignStore');
const sessionStore   = require('../services/sessionStore');
const encounterStore = require('../services/encounterStore');
const npcStore       = require('../services/npcStore');
const locationStore  = require('../services/locationStore');

// GET /api/campaigns — list all + active flag
router.get('/', async (_req, res) => {
  try {
    const [campaigns, activeCampaignId] = await Promise.all([
      campaignStore.getAllCampaigns(),
      campaignStore.getActiveCampaignId(),
    ]);
    res.json({ campaigns, activeCampaignId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/active — active campaign + settings
router.get('/active', async (_req, res) => {
  try {
    res.json(await campaignStore.getActiveCampaign());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns — create new campaign
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
    res.json(await campaignStore.createCampaign({ name, description }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/import — import a full campaign bundle as a new campaign
router.post('/import', async (req, res) => {
  try {
    const { campaign = {}, sessions = [], encounters = [], npcs = [], locations = [] } = req.body || {};

    const created = await campaignStore.createCampaign({
      name:        campaign.name || 'Imported Campaign',
      description: campaign.description || '',
    });
    await campaignStore.updateCampaignSettings(created.id, {
      partyRoster: campaign.partyRoster || [],
    });

    const remap = r => ({ ...r, campaignId: created.id });
    const [importedSessions, importedEncounters, importedNpcs, importedLocations] = await Promise.all([
      sessionStore.importSessions(sessions.map(remap)),
      encounterStore.importEncounters(encounters.map(remap)),
      npcStore.importNpcs(npcs.map(remap)),
      locationStore.importLocations(locations.map(remap)),
    ]);

    const totalIncoming = sessions.length + encounters.length + npcs.length + locations.length;
    const totalImported = importedSessions + importedEncounters + importedNpcs + importedLocations;

    // All records already exist by ID (e.g. re-importing the same campaign on the
    // same install) — the new campaign would be an empty shell. Clean it up.
    if (totalIncoming > 0 && totalImported === 0) {
      await campaignStore.deleteCampaign(created.id);
      return res.status(409).json({
        error: 'Every session, encounter, NPC, and location in this bundle already exists in this installation (matching IDs), so nothing could be imported. This usually happens when re-importing a campaign on the install it was exported from — try importing on a different installation instead.',
      });
    }

    res.json({ campaign: created, importedSessions, importedEncounters, importedNpcs, importedLocations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/campaigns/:id — rename / update description
router.put('/:id', async (req, res) => {
  try {
    const { name, description } = req.body || {};
    res.json(await campaignStore.updateCampaign(req.params.id, { name, description }));
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/switch — set as active campaign
router.post('/:id/switch', async (req, res) => {
  try {
    await campaignStore.setActiveCampaignId(req.params.id);
    res.json({ activeCampaignId: req.params.id });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

// DELETE /api/campaigns/:id — delete campaign and all its records
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Delete all records belonging to this campaign
    const [sessions, encounters, npcs, locations] = await Promise.all([
      sessionStore.getAllFull(),
      encounterStore.getAllFull(),
      npcStore.getAllFull(),
      locationStore.getAllFull(),
    ]);
    const belongsHere = r => r.campaignId === id || (!r.campaignId && id === 'c-default');
    await Promise.all([
      ...sessions.filter(belongsHere).map(s => sessionStore.deleteSession(s.id)),
      ...encounters.filter(belongsHere).map(e => encounterStore.deleteEncounter(e.id)),
      ...npcs.filter(belongsHere).map(n => npcStore.deleteNpc(n.id)),
      ...locations.filter(belongsHere).map(l => locationStore.deleteLocation(l.id)),
    ]);
    await campaignStore.deleteCampaign(id);
    res.json({ success: true });
  } catch (err) {
    res.status(err.message.includes('last campaign') ? 400 : err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

// GET /api/campaigns/:id/export — full campaign bundle (metadata + all owned records)
router.get('/:id/export', async (req, res) => {
  try {
    const id = req.params.id;
    const campaign = await campaignStore.getCampaign(id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const belongsHere = r => r.campaignId === id || (!r.campaignId && id === 'c-default');
    const [sessions, encounters, npcs, locations] = await Promise.all([
      sessionStore.getAllFull(),
      encounterStore.getAllFull(),
      npcStore.getAllFull(),
      locationStore.getAllFull(),
    ]);

    res.json({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      campaign: {
        name:        campaign.name,
        description: campaign.description,
        partyRoster: campaign.partyRoster || [],
      },
      sessions:   sessions.filter(belongsHere),
      encounters: encounters.filter(belongsHere),
      npcs:       npcs.filter(belongsHere),
      locations:  locations.filter(belongsHere),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/:id/counts — how many records belong to this campaign
router.get('/:id/counts', async (req, res) => {
  try {
    const id = req.params.id;
    const belongsHere = r => r.campaignId === id || (!r.campaignId && id === 'c-default');
    const [sessions, encounters, npcs, locations] = await Promise.all([
      sessionStore.getAllFull(),
      encounterStore.getAllFull(),
      npcStore.getAllFull(),
      locationStore.getAllFull(),
    ]);
    res.json({
      sessions:   sessions.filter(belongsHere).length,
      encounters: encounters.filter(belongsHere).length,
      npcs:       npcs.filter(belongsHere).length,
      locations:  locations.filter(belongsHere).length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
