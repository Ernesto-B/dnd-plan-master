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

async function detectBrokenLinks(campaignId) {
  const [sessions, encounters, npcs, locations, factions] = await Promise.all([
    sessionStore.getAllFull(),
    encounterStore.getAllFull(),
    npcStore.getAllFull(),
    locationStore.getAllFull(),
    factionStore.getAllFull(),
  ]);

  const filter = r => belongsToCampaign(r, campaignId) && isLive(r);
  const activeSessions  = sessions.filter(filter);
  const activeEncounters = encounters.filter(filter);
  const activeNpcs      = npcs.filter(filter);
  const activeLocations = locations.filter(filter);
  const activeFactions  = factions.filter(filter);

  const sessionIds  = new Set(activeSessions.map(r => r.id));
  const encounterIds = new Set(activeEncounters.map(r => r.id));
  const npcIds      = new Set(activeNpcs.map(r => r.id));
  const locationIds = new Set(activeLocations.map(r => r.id));

  const getLabel = {
    session:  r => r.data?.sessionGoal || r.goal || `Session ${r.id}`,
    encounter: r => r.name || r.id,
    npc:      r => r.name || r.id,
    location: r => r.name || r.id,
    faction:  r => r.name || r.id,
  };

  const broken = [];
  function addBroken(ownerType, owner, field, brokenId, targetType) {
    broken.push({ ownerType, ownerId: owner.id, ownerLabel: getLabel[ownerType](owner), field, brokenId, targetType });
  }

  for (const s of activeSessions) {
    for (const id of s.data?.linkedNpcs || []) if (!npcIds.has(id)) addBroken('session', s, 'linkedNpcs', id, 'npc');
    for (const id of s.data?.linkedLocations || []) if (!locationIds.has(id)) addBroken('session', s, 'linkedLocations', id, 'location');
    for (const enc of s.data?.encounters || []) {
      if (enc.encounterPlanId && !encounterIds.has(enc.encounterPlanId))
        addBroken('session', s, 'encounters[encounterPlanId]', enc.encounterPlanId, 'encounter');
    }
  }
  for (const e of activeEncounters) {
    if (e.sessionId && !sessionIds.has(e.sessionId)) addBroken('encounter', e, 'sessionId', e.sessionId, 'session');
  }
  for (const n of activeNpcs) {
    for (const id of n.linkedSessions || []) if (!sessionIds.has(id)) addBroken('npc', n, 'linkedSessions', id, 'session');
    for (const id of n.linkedEncounters || []) if (!encounterIds.has(id)) addBroken('npc', n, 'linkedEncounters', id, 'encounter');
  }
  for (const l of activeLocations) {
    for (const id of l.linkedSessions || []) if (!sessionIds.has(id)) addBroken('location', l, 'linkedSessions', id, 'session');
  }
  for (const f of activeFactions) {
    for (const id of f.linkedSessions || []) if (!sessionIds.has(id)) addBroken('faction', f, 'linkedSessions', id, 'session');
    for (const id of f.linkedEncounters || []) if (!encounterIds.has(id)) addBroken('faction', f, 'linkedEncounters', id, 'encounter');
    for (const id of f.linkedNpcs || []) if (!npcIds.has(id)) addBroken('faction', f, 'linkedNpcs', id, 'npc');
    for (const id of f.linkedLocations || []) if (!locationIds.has(id)) addBroken('faction', f, 'linkedLocations', id, 'location');
  }

  return broken;
}

async function repairBrokenLinks(broken, campaignId) {
  if (!broken.length) return { repaired: 0 };

  const byOwner = new Map();
  for (const link of broken) {
    const key = `${link.ownerType}:${link.ownerId}`;
    if (!byOwner.has(key)) byOwner.set(key, { type: link.ownerType, id: link.ownerId, links: [] });
    byOwner.get(key).links.push(link);
  }

  const [sessions, encounters, npcs, locations, factions] = await Promise.all([
    sessionStore.getAllFull(),
    encounterStore.getAllFull(),
    npcStore.getAllFull(),
    locationStore.getAllFull(),
    factionStore.getAllFull(),
  ]);

  const brokenByOwner = [...byOwner.values()];
  const affectedTypes = new Set(brokenByOwner.map(o => o.type));

  function removeIds(arr, idsToRemove) {
    const set = new Set(idsToRemove);
    return (arr || []).filter(id => !set.has(id));
  }

  if (affectedTypes.has('session')) {
    const brokenSessions = new Map(brokenByOwner.filter(o => o.type === 'session').map(o => [o.id, o.links]));
    const updated = sessions.map(s => {
      const links = brokenSessions.get(s.id);
      if (!links) return s;
      const npcIds = links.filter(l => l.field === 'linkedNpcs').map(l => l.brokenId);
      const locIds = links.filter(l => l.field === 'linkedLocations').map(l => l.brokenId);
      const encIds = links.filter(l => l.field === 'encounters[encounterPlanId]').map(l => l.brokenId);
      const encIdSet = new Set(encIds);
      return {
        ...s,
        data: {
          ...s.data,
          linkedNpcs: removeIds(s.data?.linkedNpcs, npcIds),
          linkedLocations: removeIds(s.data?.linkedLocations, locIds),
          encounters: (s.data?.encounters || []).map(enc =>
            encIdSet.has(enc.encounterPlanId) ? { ...enc, encounterPlanId: null } : enc
          ),
        },
      };
    });
    await sessionStore.replaceAllFull(updated);
  }

  if (affectedTypes.has('encounter')) {
    const brokenEnc = new Set(brokenByOwner.filter(o => o.type === 'encounter').map(o => o.id));
    const updated = encounters.map(e => brokenEnc.has(e.id) ? { ...e, sessionId: null, data: { ...e.data, sessionId: null } } : e);
    await encounterStore.replaceAllFull(updated);
  }

  if (affectedTypes.has('npc')) {
    const brokenNpcs = new Map(brokenByOwner.filter(o => o.type === 'npc').map(o => [o.id, o.links]));
    const updated = npcs.map(n => {
      const links = brokenNpcs.get(n.id);
      if (!links) return n;
      return {
        ...n,
        linkedSessions: removeIds(n.linkedSessions, links.filter(l => l.field === 'linkedSessions').map(l => l.brokenId)),
        linkedEncounters: removeIds(n.linkedEncounters, links.filter(l => l.field === 'linkedEncounters').map(l => l.brokenId)),
      };
    });
    await npcStore.replaceAllFull(updated);
  }

  if (affectedTypes.has('location')) {
    const brokenLocs = new Map(brokenByOwner.filter(o => o.type === 'location').map(o => [o.id, o.links]));
    const updated = locations.map(l => {
      const links = brokenLocs.get(l.id);
      if (!links) return l;
      return { ...l, linkedSessions: removeIds(l.linkedSessions, links.filter(lk => lk.field === 'linkedSessions').map(lk => lk.brokenId)) };
    });
    await locationStore.replaceAllFull(updated);
  }

  if (affectedTypes.has('faction')) {
    const brokenFacts = new Map(brokenByOwner.filter(o => o.type === 'faction').map(o => [o.id, o.links]));
    const updated = factions.map(f => {
      const links = brokenFacts.get(f.id);
      if (!links) return f;
      return {
        ...f,
        linkedSessions: removeIds(f.linkedSessions, links.filter(l => l.field === 'linkedSessions').map(l => l.brokenId)),
        linkedEncounters: removeIds(f.linkedEncounters, links.filter(l => l.field === 'linkedEncounters').map(l => l.brokenId)),
        linkedNpcs: removeIds(f.linkedNpcs, links.filter(l => l.field === 'linkedNpcs').map(l => l.brokenId)),
        linkedLocations: removeIds(f.linkedLocations, links.filter(l => l.field === 'linkedLocations').map(l => l.brokenId)),
      };
    });
    await factionStore.replaceAllFull(updated);
  }

  return { repaired: broken.length };
}

router.get('/broken-links', async (_req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const broken = await detectBrokenLinks(campaignId);
    res.json({ broken, total: broken.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/repair-links', async (req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const { broken } = req.body || {};
    if (!Array.isArray(broken)) return res.status(400).json({ error: 'broken must be an array' });
    const result = await repairBrokenLinks(broken, campaignId);
    res.json(result);
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
