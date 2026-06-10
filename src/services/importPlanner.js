const sessionStore = require('./sessionStore');
const encounterStore = require('./encounterStore');
const npcStore = require('./npcStore');
const locationStore = require('./locationStore');
const factionStore = require('./factionStore');

const TYPE_CONFIG = {
  session: {
    collection: 'sessions',
    prefix: 's-',
    getLabel(record) {
      return record?.goal || record?.data?.sessionGoal || `Session ${record?.id || ''}`.trim();
    },
  },
  encounter: {
    collection: 'encounters',
    prefix: 'e-',
    getLabel(record) {
      return record?.name || `Encounter ${record?.id || ''}`.trim();
    },
  },
  npc: {
    collection: 'npcs',
    prefix: 'n-',
    getLabel(record) {
      return record?.name || `NPC ${record?.id || ''}`.trim();
    },
  },
  location: {
    collection: 'locations',
    prefix: 'l-',
    getLabel(record) {
      return record?.name || `Location ${record?.id || ''}`.trim();
    },
  },
  faction: {
    collection: 'factions',
    prefix: 'f-',
    getLabel(record) {
      return record?.name || `Faction ${record?.id || ''}`.trim();
    },
  },
};

const PREVIEW_ORDER = ['session', 'encounter', 'npc', 'location', 'faction'];
const ACTIONS_BY_STATUS = {
  new: ['import'],
  'missing-id': ['clone'],
  duplicate: ['skip', 'clone', 'replace'],
  conflict: ['clone', 'skip', 'replace'],
};

function randomId(prefix, usedIds) {
  let id = '';
  do {
    id = prefix + Math.random().toString(36).slice(2, 8);
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}

function deepNormalize(value) {
  if (Array.isArray(value)) return value.map(deepNormalize);
  if (!value || typeof value !== 'object') return value;

  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (['campaignId', 'createdAt', 'sortOrder', 'markdown'].includes(key)) continue;
    out[key] = deepNormalize(value[key]);
  }
  return out;
}

function isSameRecord(left, right) {
  return JSON.stringify(deepNormalize(left)) === JSON.stringify(deepNormalize(right));
}

function normalizeBundle(bundle) {
  return {
    sessions: Array.isArray(bundle?.sessions) ? bundle.sessions : [],
    encounters: Array.isArray(bundle?.encounters) ? bundle.encounters : [],
    npcs: Array.isArray(bundle?.npcs) ? bundle.npcs : [],
    locations: Array.isArray(bundle?.locations) ? bundle.locations : [],
    factions: Array.isArray(bundle?.factions) ? bundle.factions : [],
  };
}

async function loadCurrentRecords() {
  const [sessions, encounters, npcs, locations, factions] = await Promise.all([
    sessionStore.getAllFull(),
    encounterStore.getAllFull(),
    npcStore.getAllFull(),
    locationStore.getAllFull(),
    factionStore.getAllFull(),
  ]);

  return { sessions, encounters, npcs, locations, factions };
}

function buildPreviewFromRecords(bundle, currentRecords) {
  const normalizedBundle = normalizeBundle(bundle);
  const currentByType = {
    session: new Map((currentRecords.sessions || []).map(item => [item.id, item])),
    encounter: new Map((currentRecords.encounters || []).map(item => [item.id, item])),
    npc: new Map((currentRecords.npcs || []).map(item => [item.id, item])),
    location: new Map((currentRecords.locations || []).map(item => [item.id, item])),
    faction: new Map((currentRecords.factions || []).map(item => [item.id, item])),
  };

  const items = [];
  const counts = { total: 0, new: 0, duplicate: 0, conflict: 0, 'missing-id': 0 };
  const byType = {};

  for (const type of PREVIEW_ORDER) {
    const cfg = TYPE_CONFIG[type];
    const incomingItems = normalizedBundle[cfg.collection] || [];
    byType[type] = { total: 0, new: 0, duplicate: 0, conflict: 0, 'missing-id': 0 };

    for (let bundleIndex = 0; bundleIndex < incomingItems.length; bundleIndex++) {
      const incoming = incomingItems[bundleIndex];
      if (!incoming || typeof incoming !== 'object') continue;

      const sourceId = typeof incoming.id === 'string' && incoming.id.trim() ? incoming.id.trim() : null;
      const existing = sourceId ? currentByType[type].get(sourceId) || null : null;
      let status = 'new';

      if (!sourceId) {
        status = 'missing-id';
      } else if (existing) {
        status = isSameRecord(existing, incoming) ? 'duplicate' : 'conflict';
      }

      items.push({
        key: `${type}:${sourceId || 'missing'}:${bundleIndex}`,
        bundleIndex,
        type,
        sourceId,
        label: cfg.getLabel(incoming),
        status,
        availableActions: ACTIONS_BY_STATUS[status],
        recommendedAction: status === 'duplicate' ? 'skip' : (status === 'conflict' ? 'clone' : ACTIONS_BY_STATUS[status][0]),
        existingLabel: existing ? cfg.getLabel(existing) : '',
        existingCampaignId: existing?.campaignId || null,
      });

      counts.total++;
      counts[status]++;
      byType[type].total++;
      byType[type][status]++;
    }
  }

  return { bundle: normalizedBundle, items, counts, byType };
}

async function buildImportPreview(bundle) {
  const currentRecords = await loadCurrentRecords();
  return buildPreviewFromRecords(bundle, currentRecords);
}

function resolveAction(item, resolution = {}) {
  const defaults = resolution.defaults || {};
  const overrides = resolution.overrides || {};
  const desired = overrides[item.key] || defaults[item.status] || item.recommendedAction;
  return item.availableActions.includes(desired) ? desired : item.recommendedAction;
}

function remapId(id, remap) {
  if (!id) return id;
  return remap.get(id) || id;
}

function remapList(list, remap) {
  if (!Array.isArray(list)) return [];
  return list.map(id => remapId(id, remap)).filter(Boolean);
}

function cloneSession(record, finalId, campaignId, sessionRemap, encounterRemap, npcRemap, locationRemap) {
  const cloned = {
    ...record,
    id: finalId,
    campaignId,
    data: record?.data && typeof record.data === 'object'
      ? {
          ...record.data,
          id: finalId,
          campaignId,
          linkedNpcs: remapList(record.data.linkedNpcs, npcRemap),
          linkedLocations: remapList(record.data.linkedLocations, locationRemap),
          encounters: Array.isArray(record.data.encounters)
            ? record.data.encounters.map(encounter => ({
                ...encounter,
                encounterPlanId: remapId(encounter?.encounterPlanId, encounterRemap),
              }))
            : [],
        }
      : record?.data,
  };
  return cloned;
}

function cloneEncounter(record, finalId, campaignId, sessionRemap) {
  return {
    ...record,
    id: finalId,
    campaignId,
    sessionId: remapId(record?.sessionId, sessionRemap) || null,
    data: record?.data && typeof record.data === 'object'
      ? {
          ...record.data,
          id: finalId,
          campaignId,
          sessionId: remapId(record.data.sessionId, sessionRemap) || null,
        }
      : record?.data,
  };
}

function cloneNpc(record, finalId, campaignId, sessionRemap, encounterRemap) {
  return {
    ...record,
    id: finalId,
    campaignId,
    linkedSessions: remapList(record?.linkedSessions, sessionRemap),
    linkedEncounters: remapList(record?.linkedEncounters, encounterRemap),
  };
}

function cloneLocation(record, finalId, campaignId, sessionRemap) {
  return {
    ...record,
    id: finalId,
    campaignId,
    linkedSessions: remapList(record?.linkedSessions, sessionRemap),
  };
}

function cloneFaction(record, finalId, campaignId, sessionRemap, encounterRemap, npcRemap, locationRemap) {
  return {
    ...record,
    id: finalId,
    campaignId,
    linkedSessions: remapList(record?.linkedSessions, sessionRemap),
    linkedEncounters: remapList(record?.linkedEncounters, encounterRemap),
    linkedNpcs: remapList(record?.linkedNpcs, npcRemap),
    linkedLocations: remapList(record?.linkedLocations, locationRemap),
  };
}

function nextSortOrder(items) {
  return (items || []).reduce((max, item, index) => {
    const value = Number.isFinite(item?.sortOrder) ? item.sortOrder : index;
    return Math.max(max, value);
  }, -1) + 1;
}

function buildTypeReport() {
  return { imported: 0, cloned: 0, replaced: 0, skipped: 0 };
}

async function executeImport(bundle, resolution, campaignId) {
  const currentRecords = await loadCurrentRecords();
  const preview = buildPreviewFromRecords(bundle, currentRecords);
  const plans = preview.items.map(item => ({
    ...item,
    action: resolveAction(item, resolution),
  }));

  const usedIds = {
    session: new Set((currentRecords.sessions || []).map(item => item.id).filter(Boolean)),
    encounter: new Set((currentRecords.encounters || []).map(item => item.id).filter(Boolean)),
    npc: new Set((currentRecords.npcs || []).map(item => item.id).filter(Boolean)),
    location: new Set((currentRecords.locations || []).map(item => item.id).filter(Boolean)),
  };
  const currentByType = {
    session: new Map((currentRecords.sessions || []).map(item => [item.id, item])),
    encounter: new Map((currentRecords.encounters || []).map(item => [item.id, item])),
    npc: new Map((currentRecords.npcs || []).map(item => [item.id, item])),
    location: new Map((currentRecords.locations || []).map(item => [item.id, item])),
  };
  const incomingByType = {
    session: preview.bundle.sessions,
    encounter: preview.bundle.encounters,
    npc: preview.bundle.npcs,
    location: preview.bundle.locations,
    faction: preview.bundle.factions,
  };
  const remaps = {
    session: new Map(),
    encounter: new Map(),
    npc: new Map(),
    location: new Map(),
    faction: new Map(),
  };
  const finalIdsByKey = new Map();

  for (const plan of plans) {
    const cfg = TYPE_CONFIG[plan.type];
    let finalId = plan.sourceId;

    if (!finalId || plan.action === 'clone') {
      finalId = randomId(cfg.prefix, usedIds[plan.type]);
    }

    if (plan.sourceId) remaps[plan.type].set(plan.sourceId, finalId);
    finalIdsByKey.set(plan.key, finalId);
  }

  const finalRecords = {
    sessions: [...currentRecords.sessions],
    encounters: [...currentRecords.encounters],
    npcs: [...currentRecords.npcs],
    locations: [...currentRecords.locations],
    factions: [...currentRecords.factions],
  };
  const report = {
    totals: { imported: 0, cloned: 0, replaced: 0, skipped: 0, processed: plans.length },
    byType: {
      session: buildTypeReport(),
      encounter: buildTypeReport(),
      npc: buildTypeReport(),
      location: buildTypeReport(),
      faction: buildTypeReport(),
    },
    items: [],
    remappedIds: [],
  };

  let sessionSortOrder = nextSortOrder(finalRecords.sessions);
  let encounterSortOrder = nextSortOrder(finalRecords.encounters);
  let npcSortOrder = nextSortOrder(finalRecords.npcs);
  let factionSortOrder = nextSortOrder(finalRecords.factions);

  for (const type of PREVIEW_ORDER) {
    const cfg = TYPE_CONFIG[type];
    const plansForType = plans.filter(plan => plan.type === type);
    const incomingItems = incomingByType[type];

    for (let index = 0; index < plansForType.length; index++) {
      const plan = plansForType[index];
      const incoming = incomingItems[plan.bundleIndex];
      if (!incoming) continue;

      const existing = plan.sourceId ? currentByType[type].get(plan.sourceId) || null : null;
      const finalId = finalIdsByKey.get(plan.key);
      const itemReport = {
        type,
        status: plan.status,
        action: plan.action,
        sourceId: plan.sourceId,
        finalId: plan.action === 'skip' ? plan.sourceId : finalId,
        label: plan.label,
      };

      if (plan.action === 'skip') {
        report.totals.skipped++;
        report.byType[type].skipped++;
        report.items.push(itemReport);
        continue;
      }

      let transformed;
      if (type === 'session') {
        transformed = cloneSession(incoming, finalId, campaignId, remaps.session, remaps.encounter, remaps.npc, remaps.location);
        transformed.sortOrder = plan.action === 'replace' && existing && Number.isFinite(existing.sortOrder)
          ? existing.sortOrder
          : sessionSortOrder++;
      } else if (type === 'encounter') {
        transformed = cloneEncounter(incoming, finalId, campaignId, remaps.session);
        transformed.sortOrder = plan.action === 'replace' && existing && Number.isFinite(existing.sortOrder)
          ? existing.sortOrder
          : encounterSortOrder++;
      } else if (type === 'npc') {
        transformed = cloneNpc(incoming, finalId, campaignId, remaps.session, remaps.encounter);
        transformed.sortOrder = plan.action === 'replace' && existing && Number.isFinite(existing.sortOrder)
          ? existing.sortOrder
          : npcSortOrder++;
      } else if (type === 'faction') {
        transformed = cloneFaction(incoming, finalId, campaignId, remaps.session, remaps.encounter, remaps.npc, remaps.location);
        transformed.sortOrder = plan.action === 'replace' && existing && Number.isFinite(existing.sortOrder)
          ? existing.sortOrder
          : factionSortOrder++;
      } else {
        transformed = cloneLocation(incoming, finalId, campaignId, remaps.session);
      }

      if (!transformed.createdAt) transformed.createdAt = new Date().toISOString();

      const targetCollection = finalRecords[cfg.collection];
      if (plan.action === 'replace' && existing) {
        const replaceIndex = targetCollection.findIndex(item => item.id === plan.sourceId);
        if (replaceIndex >= 0) targetCollection[replaceIndex] = transformed;
        report.totals.replaced++;
        report.byType[type].replaced++;
      } else {
        targetCollection.push(transformed);
        if (plan.action === 'clone') {
          report.totals.cloned++;
          report.byType[type].cloned++;
        } else {
          report.totals.imported++;
          report.byType[type].imported++;
        }
      }

      if (plan.sourceId && finalId && plan.sourceId !== finalId) {
        report.remappedIds.push({
          type,
          fromId: plan.sourceId,
          toId: finalId,
          label: plan.label,
        });
      }

      itemReport.finalId = finalId;
      report.items.push(itemReport);
    }
  }

  finalRecords.locations.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  await Promise.all([
    sessionStore.replaceAllFull(finalRecords.sessions),
    encounterStore.replaceAllFull(finalRecords.encounters),
    npcStore.replaceAllFull(finalRecords.npcs),
    locationStore.replaceAllFull(finalRecords.locations),
    factionStore.replaceAllFull(finalRecords.factions),
  ]);

  return report;
}

module.exports = {
  buildImportPreview,
  executeImport,
};
