const express = require('express');
const fs      = require('fs').promises;
const router  = express.Router();
const settingsStore  = require('../services/settingsStore');
const sessionStore   = require('../services/sessionStore');
const encounterStore = require('../services/encounterStore');
const npcStore       = require('../services/npcStore');
const locationStore  = require('../services/locationStore');
const campaignStore  = require('../services/campaignStore');
const backupStore    = require('../services/backupStore');
const backupScheduler = require('../services/backupScheduler');
const { getDataFile } = require('../services/appPaths');

function belongsToCampaign(record, campaignId) {
  return (
    !campaignId ||
    record?.campaignId === campaignId ||
    (!record?.campaignId && campaignId === 'c-default')
  );
}

router.get('/', async (_req, res) => {
  try {
    const [globalSettings, campaign] = await Promise.all([
      settingsStore.getSettings(),
      campaignStore.getActiveCampaign(),
    ]);
    res.json({
      ...globalSettings,
      party: campaign?.partyRoster || globalSettings.party || [],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { party, ...globalFields } = req.body;

    const [saved, campaign] = await Promise.all([
      settingsStore.saveSettings(globalFields),
      party !== undefined
        ? campaignStore.getActiveCampaignId().then(id =>
            campaignStore.updateCampaignSettings(id, { partyRoster: party })
          )
        : campaignStore.getActiveCampaign(),
    ]);

    await backupScheduler.refreshSchedule();
    res.json({
      ...saved,
      party: campaign?.partyRoster || party || [],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/export-data', async (_req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const [sessions, encounters, npcs, locations] = await Promise.all([
      sessionStore.getAllFull(),
      encounterStore.getAllFull(),
      npcStore.getAllFull(),
      locationStore.getAllFull(),
    ]);
    res.json({
      sessions: sessions.filter(session => belongsToCampaign(session, campaignId)),
      encounters: encounters.filter(encounter => belongsToCampaign(encounter, campaignId)),
      npcs: npcs.filter(npc => belongsToCampaign(npc, campaignId)),
      locations: locations.filter(location => belongsToCampaign(location, campaignId)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const {
      sessions = [],
      encounters = [],
      npcs = [],
      locations = [],
    } = req.body;
    const attachCampaign = item => ({
      ...item,
      campaignId,
      data: item && typeof item.data === 'object'
        ? { ...item.data, campaignId }
        : item.data,
    });
    const [importedSessions, importedEncounters, importedNpcs, importedLocations] = await Promise.all([
      sessionStore.importSessions(sessions.map(attachCampaign)),
      encounterStore.importEncounters(encounters.map(attachCampaign)),
      npcStore.importNpcs(npcs.map(attachCampaign)),
      locationStore.importLocations(locations.map(attachCampaign)),
    ]);
    res.json({ importedSessions, importedEncounters, importedNpcs, importedLocations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/backups', async (_req, res) => {
  try {
    res.json(await backupStore.listBackups());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backup', async (_req, res) => {
  try {
    res.json(await backupStore.createBackup());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/restore', async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Backup name is required' });
    const restored = await backupStore.restoreBackup(name);
    await backupScheduler.refreshSchedule();
    res.json(restored);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/data', async (_req, res) => {
  try {
    await Promise.allSettled([
      fs.unlink(getDataFile('sessions.json')),
      fs.unlink(getDataFile('encounters.json')),
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
