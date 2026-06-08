const express = require('express');
const router  = express.Router();
const settingsStore  = require('../services/settingsStore');
const sessionStore   = require('../services/sessionStore');
const encounterStore = require('../services/encounterStore');
const npcStore       = require('../services/npcStore');
const locationStore  = require('../services/locationStore');
const campaignStore  = require('../services/campaignStore');
const backupStore    = require('../services/backupStore');
const backupScheduler = require('../services/backupScheduler');
const importPlanner = require('../services/importPlanner');
const { ACTIVE, ARCHIVED, TRASHED, isActive, normalizeStatus } = require('../services/recordLifecycle');

function belongsToCampaign(record, campaignId) {
  return (
    !campaignId ||
    record?.campaignId === campaignId ||
    (!record?.campaignId && campaignId === 'c-default')
  );
}

const STORE_BY_TYPE = {
  session: {
    label: 'Session',
    list: (...args) => sessionStore.listByStatuses(...args),
    remove: id => sessionStore.deleteSession(id),
    setStatus: (id, status) => sessionStore.updateStatus(id, status),
    title: record => record.goal || record.data?.sessionGoal || `Session #${record.sessionNumber ?? '?'}`,
    subtitle: record => record.date || '',
  },
  encounter: {
    label: 'Encounter',
    list: (...args) => encounterStore.listByStatuses(...args),
    remove: id => encounterStore.deleteEncounter(id),
    setStatus: (id, status) => encounterStore.updateStatus(id, status),
    title: record => record.name || record.id,
    subtitle: record => record.fiction || '',
  },
  npc: {
    label: 'NPC',
    list: (...args) => npcStore.listByStatuses(...args),
    remove: id => npcStore.deleteNpc(id),
    setStatus: (id, status) => npcStore.updateStatus(id, status),
    title: record => record.name || record.id,
    subtitle: record => record.nickname || record.situation || '',
  },
  location: {
    label: 'Location',
    list: (...args) => locationStore.listByStatuses(...args),
    remove: id => locationStore.deleteLocation(id),
    setStatus: (id, status) => locationStore.updateStatus(id, status),
    title: record => record.name || record.id,
    subtitle: record => record.description || '',
  },
};

function summarizeLifecycleRecord(type, record) {
  const cfg = STORE_BY_TYPE[type];
  return {
    type,
    id: record.id,
    status: record.status || ACTIVE,
    title: cfg.title(record),
    subtitle: cfg.subtitle(record),
    campaignId: record.campaignId || 'c-default',
    archivedAt: record.archivedAt || null,
    trashedAt: record.trashedAt || null,
    createdAt: record.createdAt || null,
    changedAt: record.trashedAt || record.archivedAt || record.createdAt || null,
  };
}

async function updateItemsStatus(items, status) {
  let count = 0;
  for (const item of Array.isArray(items) ? items : []) {
    const cfg = STORE_BY_TYPE[item?.type];
    if (!cfg || !item?.id) continue;
    await cfg.setStatus(item.id, status);
    count++;
  }
  return count;
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
      sessions: sessions.filter(session => belongsToCampaign(session, campaignId) && isActive(session)),
      encounters: encounters.filter(encounter => belongsToCampaign(encounter, campaignId) && isActive(encounter)),
      npcs: npcs.filter(npc => belongsToCampaign(npc, campaignId) && isActive(npc)),
      locations: locations.filter(location => belongsToCampaign(location, campaignId) && isActive(location)),
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
      resolution = {},
    } = req.body;
    const report = await importPlanner.executeImport({
      sessions,
      encounters,
      npcs,
      locations,
    }, resolution, campaignId);
    res.json({ report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import-preview', async (req, res) => {
  try {
    const preview = await importPlanner.buildImportPreview(req.body || {});
    res.json(preview);
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

router.get('/records/lifecycle', async (_req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const [sessions, encounters, npcs, locations] = await Promise.all([
      sessionStore.listByStatuses(campaignId, [ARCHIVED, TRASHED]),
      encounterStore.listByStatuses(campaignId, [ARCHIVED, TRASHED]),
      npcStore.listByStatuses(campaignId, [ARCHIVED, TRASHED]),
      locationStore.listByStatuses(campaignId, [ARCHIVED, TRASHED]),
    ]);
    const items = [
      ...sessions.map(record => summarizeLifecycleRecord('session', record)),
      ...encounters.map(record => summarizeLifecycleRecord('encounter', record)),
      ...npcs.map(record => summarizeLifecycleRecord('npc', record)),
      ...locations.map(record => summarizeLifecycleRecord('location', record)),
    ].sort((a, b) => String(b.changedAt || '').localeCompare(String(a.changedAt || '')));
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/records/state', async (req, res) => {
  try {
    const status = normalizeStatus(req.body?.status);
    const count = await updateItemsStatus(req.body?.items, status);
    res.json({ success: true, count, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/records/permanent', async (req, res) => {
  try {
    let count = 0;
    for (const item of Array.isArray(req.body?.items) ? req.body.items : []) {
      const cfg = STORE_BY_TYPE[item?.type];
      if (!cfg || !item?.id) continue;
      await cfg.remove(item.id);
      count++;
    }
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/data', async (_req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const [sessions, encounters, npcs, locations] = await Promise.all([
      sessionStore.listByStatuses(campaignId, [ACTIVE]),
      encounterStore.listByStatuses(campaignId, [ACTIVE]),
      npcStore.listByStatuses(campaignId, [ACTIVE]),
      locationStore.listByStatuses(campaignId, [ACTIVE]),
    ]);
    const items = [
      ...sessions.map(record => ({ type: 'session', id: record.id })),
      ...encounters.map(record => ({ type: 'encounter', id: record.id })),
      ...npcs.map(record => ({ type: 'npc', id: record.id })),
      ...locations.map(record => ({ type: 'location', id: record.id })),
    ];
    const count = await updateItemsStatus(items, TRASHED);
    res.json({ success: true, count, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
