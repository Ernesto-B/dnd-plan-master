const express = require('express');
const router  = express.Router();
const settingsStore  = require('../services/settingsStore');
const sessionStore   = require('../services/sessionStore');
const encounterStore = require('../services/encounterStore');
const npcStore       = require('../services/npcStore');
const locationStore  = require('../services/locationStore');
const factionStore   = require('../services/factionStore');
const campaignStore  = require('../services/campaignStore');
const backupStore    = require('../services/backupStore');
const backupScheduler = require('../services/backupScheduler');
const importPlanner = require('../services/importPlanner');
const mapStore = require('../services/mapStore');
const mapBundle = require('../services/mapBundle');
const { ACTIVE, DRAFT, ARCHIVED, TRASHED, isLive, normalizeStatus } = require('../services/recordLifecycle');
const {
  BUNDLE_SCHEMA_VERSION,
  SETTINGS_BUNDLE_TYPE,
  SchemaValidationError,
  normalizeSettingsImportBundle,
} = require('../services/schema');

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
  faction: {
    label: 'Faction',
    list: (...args) => factionStore.listByStatuses(...args),
    remove: id => factionStore.deleteFaction(id),
    setStatus: (id, status) => factionStore.updateStatus(id, status),
    title: record => record.name || record.id,
    subtitle: record => record.goal || record.origin || '',
  },
};

const MAP_ACTIONS_BY_STATUS = {
  new: ['import'],
  duplicate: ['skip', 'replace'],
  conflict: ['replace', 'skip'],
};

function emptyPreviewCounts() {
  return { total: 0, new: 0, duplicate: 0, conflict: 0, 'missing-id': 0 };
}

function emptyTypeReport() {
  return { imported: 0, cloned: 0, replaced: 0, skipped: 0 };
}

function summarizeExportMap(map, campaignId, includeAssets) {
  if (!map) return [];
  if (includeAssets) return [map];
  return [{
    id: campaignId,
    campaignId,
    name: 'Campaign Map',
    imageFilename: map.imageFilename || null,
    updatedAt: map.updatedAt || null,
    pins: Array.isArray(map.pins) ? map.pins : [],
    tags: [],
  }];
}

function mapComparableShape(value) {
  if (!value) return null;
  return {
    imageFilename: value.imageFilename || null,
    pins: Array.isArray(value.pins) ? value.pins : [],
    image: value.image
      ? {
          filename: value.image.filename || '',
          mimeType: value.image.mimeType || '',
          base64: value.image.base64 || '',
        }
      : null,
  };
}

function mapsMatch(existing, incoming) {
  return JSON.stringify(mapComparableShape(existing)) === JSON.stringify(mapComparableShape(incoming));
}

function mergePreviewCounts(left, right) {
  return {
    total: (left.total || 0) + (right.total || 0),
    new: (left.new || 0) + (right.new || 0),
    duplicate: (left.duplicate || 0) + (right.duplicate || 0),
    conflict: (left.conflict || 0) + (right.conflict || 0),
    'missing-id': (left['missing-id'] || 0) + (right['missing-id'] || 0),
  };
}

function mergeReportTotals(left, right) {
  return {
    imported: (left.imported || 0) + (right.imported || 0),
    cloned: (left.cloned || 0) + (right.cloned || 0),
    replaced: (left.replaced || 0) + (right.replaced || 0),
    skipped: (left.skipped || 0) + (right.skipped || 0),
    processed: (left.processed || 0) + (right.processed || 0),
  };
}

async function buildMapImportPreview(maps, campaignId) {
  const items = [];
  const counts = emptyPreviewCounts();
  const existing = await mapBundle.serializeCampaignMap(campaignId);

  for (let index = 0; index < (Array.isArray(maps) ? maps.length : 0); index++) {
    const incoming = maps[index];
    if (!incoming) continue;

    const sourceId = String(incoming.campaignId || `map-${index + 1}`);
    let status = 'new';
    if (existing) status = mapsMatch(existing, incoming) ? 'duplicate' : 'conflict';

    items.push({
      key: `map:${sourceId}:${index}`,
      bundleIndex: index,
      type: 'map',
      sourceId,
      label: 'Campaign Map',
      status,
      availableActions: MAP_ACTIONS_BY_STATUS[status],
      recommendedAction: status === 'duplicate' ? 'skip' : 'replace',
      existingLabel: existing ? 'Current campaign map' : '',
      existingCampaignId: existing?.campaignId || null,
    });

    counts.total++;
    counts[status]++;
  }

  return {
    items,
    counts,
    byType: { map: { ...counts } },
  };
}

function resolveMapAction(item, resolution = {}) {
  const defaults = resolution.defaults || {};
  const overrides = resolution.overrides || {};
  const desired = overrides[item.key] || defaults[item.status] || item.recommendedAction;
  return item.availableActions.includes(desired) ? desired : item.recommendedAction;
}

function mergeImportPreview(recordPreview, mapPreview, bundle) {
  return {
    bundle: {
      ...recordPreview.bundle,
      maps: bundle.maps || [],
    },
    items: [...recordPreview.items, ...mapPreview.items],
    counts: mergePreviewCounts(recordPreview.counts, mapPreview.counts),
    byType: {
      ...recordPreview.byType,
      map: mapPreview.byType.map,
    },
  };
}

async function applyMapImports(maps, resolution, campaignId) {
  const preview = await buildMapImportPreview(maps, campaignId);
  const report = {
    totals: { imported: 0, cloned: 0, replaced: 0, skipped: 0, processed: preview.items.length },
    byType: { map: emptyTypeReport() },
    items: [],
    remappedIds: [],
  };

  for (const item of preview.items) {
    const action = resolveMapAction(item, resolution);
    const incoming = maps[item.bundleIndex];
    const row = {
      type: 'map',
      status: item.status,
      action,
      sourceId: item.sourceId,
      finalId: campaignId,
      label: item.label,
    };

    if (action === 'skip') {
      report.totals.skipped++;
      report.byType.map.skipped++;
      report.items.push(row);
      continue;
    }

    await mapBundle.restoreCampaignMap(incoming, campaignId);
    if (item.status === 'new') {
      report.totals.imported++;
      report.byType.map.imported++;
    } else {
      report.totals.replaced++;
      report.byType.map.replaced++;
    }

    if (item.sourceId && item.sourceId !== campaignId) {
      report.remappedIds.push({
        type: 'map',
        fromId: item.sourceId,
        toId: campaignId,
        label: item.label,
      });
    }

    report.items.push(row);
  }

  return report;
}

function mergeImportReport(recordReport, mapReport) {
  return {
    totals: mergeReportTotals(recordReport.totals, mapReport.totals),
    byType: {
      ...recordReport.byType,
      map: mapReport.byType.map,
    },
    items: [...recordReport.items, ...mapReport.items],
    remappedIds: [...recordReport.remappedIds, ...mapReport.remappedIds],
  };
}

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
    const includeMapAssets = _req.query.includeMapAssets === '1';
    const [sessions, encounters, npcs, locations, factions, map] = await Promise.all([
      sessionStore.getAllFull(),
      encounterStore.getAllFull(),
      npcStore.getAllFull(),
      locationStore.getAllFull(),
      factionStore.getAllFull(),
      includeMapAssets ? mapBundle.serializeCampaignMap(campaignId) : mapStore.getMap(campaignId),
    ]);
    res.json({
      schemaVersion: BUNDLE_SCHEMA_VERSION,
      bundleType: SETTINGS_BUNDLE_TYPE,
      exportedAt: new Date().toISOString(),
      sessions: sessions.filter(session => belongsToCampaign(session, campaignId) && isLive(session)),
      encounters: encounters.filter(encounter => belongsToCampaign(encounter, campaignId) && isLive(encounter)),
      npcs: npcs.filter(npc => belongsToCampaign(npc, campaignId) && isLive(npc)),
      locations: locations.filter(location => belongsToCampaign(location, campaignId) && isLive(location)),
      factions: factions.filter(faction => belongsToCampaign(faction, campaignId) && isLive(faction)),
      maps: summarizeExportMap(map, campaignId, includeMapAssets),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const {
      resolution = {},
      ...bundleBody
    } = req.body || {};
    const bundle = normalizeSettingsImportBundle(bundleBody);
    const recordReport = await importPlanner.executeImport({
      sessions: bundle.sessions,
      encounters: bundle.encounters,
      npcs: bundle.npcs,
      locations: bundle.locations,
      factions: bundle.factions,
    }, resolution, campaignId);
    const mapReport = await applyMapImports(bundle.maps, resolution, campaignId);
    res.json({ report: mergeImportReport(recordReport, mapReport) });
  } catch (err) {
    res.status(err instanceof SchemaValidationError ? err.statusCode : 500).json({ error: err.message });
  }
});

router.post('/import-preview', async (req, res) => {
  try {
    const bundle = normalizeSettingsImportBundle(req.body || {});
    const campaignId = await campaignStore.getActiveCampaignId();
    const recordPreview = await importPlanner.buildImportPreview({
      sessions: bundle.sessions,
      encounters: bundle.encounters,
      npcs: bundle.npcs,
      locations: bundle.locations,
      factions: bundle.factions,
    });
    const mapPreview = await buildMapImportPreview(bundle.maps, campaignId);
    res.json(mergeImportPreview(recordPreview, mapPreview, bundle));
  } catch (err) {
    res.status(err instanceof SchemaValidationError ? err.statusCode : 500).json({ error: err.message });
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
    const [sessions, encounters, npcs, locations, factions] = await Promise.all([
      sessionStore.listByStatuses(campaignId, [ARCHIVED, TRASHED]),
      encounterStore.listByStatuses(campaignId, [ARCHIVED, TRASHED]),
      npcStore.listByStatuses(campaignId, [ARCHIVED, TRASHED]),
      locationStore.listByStatuses(campaignId, [ARCHIVED, TRASHED]),
      factionStore.listByStatuses(campaignId, [ARCHIVED, TRASHED]),
    ]);
    const items = [
      ...sessions.map(record => summarizeLifecycleRecord('session', record)),
      ...encounters.map(record => summarizeLifecycleRecord('encounter', record)),
      ...npcs.map(record => summarizeLifecycleRecord('npc', record)),
      ...locations.map(record => summarizeLifecycleRecord('location', record)),
      ...factions.map(record => summarizeLifecycleRecord('faction', record)),
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
    const [sessions, encounters, npcs, locations, factions] = await Promise.all([
      sessionStore.listByStatuses(campaignId, [ACTIVE, DRAFT]),
      encounterStore.listByStatuses(campaignId, [ACTIVE, DRAFT]),
      npcStore.listByStatuses(campaignId, [ACTIVE, DRAFT]),
      locationStore.listByStatuses(campaignId, [ACTIVE, DRAFT]),
      factionStore.listByStatuses(campaignId, [ACTIVE, DRAFT]),
    ]);
    const items = [
      ...sessions.map(record => ({ type: 'session', id: record.id })),
      ...encounters.map(record => ({ type: 'encounter', id: record.id })),
      ...npcs.map(record => ({ type: 'npc', id: record.id })),
      ...locations.map(record => ({ type: 'location', id: record.id })),
      ...factions.map(record => ({ type: 'faction', id: record.id })),
    ];
    const count = await updateItemsStatus(items, TRASHED);
    res.json({ success: true, count, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
