const { normalizeStatus, normalizeTagsForStatus } = require('./recordLifecycle');

const STORE_SCHEMA_VERSION = 2;
const BUNDLE_SCHEMA_VERSION = 2;
const SETTINGS_BUNDLE_TYPE = 'settings-export';
const CAMPAIGN_BUNDLE_TYPE = 'campaign-export';

const DEFAULT_SETTINGS = {
  party: [],
  theme: 'dark',
  uiScale: 1,
  autosaveEnabled: true,
  scheduledBackupsEnabled: false,
  scheduledBackupIntervalHours: 24,
  shortcuts: {
    newSession: 'Alt+Shift+S',
    newEncounter: 'Alt+Shift+E',
    newNpc: 'Alt+Shift+N',
    historyBack: 'Mod+[',
    historyForward: 'Mod+]',
    goSessions: 'Alt+1',
    goEncounters: 'Alt+2',
    goNpcs: 'Alt+3',
    goCampaign: 'Alt+4',
    goSettings: 'Alt+5',
    focusSearch: '/',
    savePrimary: 'Mod+S',
  },
};

class SchemaValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaValidationError';
    this.statusCode = 400;
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asPlainObject(value) {
  return isPlainObject(value) ? value : {};
}

function asTrimmedString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asOptionalString(value) {
  return typeof value === 'string' ? value : undefined;
}

function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : undefined;
}

function asBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
}

function asLinkedIds(value) {
  return asStringArray(value);
}

function asPartyRoster(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPlainObject)
    .map(item => ({
      ...item,
      name: asTrimmedString(item.name),
      playerClass: asTrimmedString(item.playerClass),
      characterUrl: asTrimmedString(item.characterUrl),
    }))
    .filter(item => item.name || item.playerClass || item.characterUrl);
}

function sanitizeBaseRecord(record, { allowMissingId = false } = {}) {
  if (!isPlainObject(record)) return null;

  const id = asTrimmedString(record.id);
  if (!allowMissingId && !id) return null;

  const status = normalizeStatus(record.status);
  const normalized = {
    ...record,
    campaignId: asTrimmedString(record.campaignId, 'c-default') || 'c-default',
    status,
    tags: normalizeTagsForStatus(asStringArray(record.tags), status),
  };

  if (id) normalized.id = id;
  else delete normalized.id;

  const sortOrder = asFiniteNumber(record.sortOrder);
  if (sortOrder === undefined) delete normalized.sortOrder;
  else normalized.sortOrder = sortOrder;

  const createdAt = asOptionalString(record.createdAt);
  if (createdAt === undefined || !createdAt.trim()) delete normalized.createdAt;
  else normalized.createdAt = createdAt;

  const archivedAt = asOptionalString(record.archivedAt);
  if (archivedAt === undefined || !archivedAt.trim()) delete normalized.archivedAt;
  else normalized.archivedAt = archivedAt;

  const trashedAt = asOptionalString(record.trashedAt);
  if (trashedAt === undefined || !trashedAt.trim()) delete normalized.trashedAt;
  else normalized.trashedAt = trashedAt;

  const restorableStatus = asOptionalString(record.restorableStatus);
  if (!restorableStatus) delete normalized.restorableStatus;
  else normalized.restorableStatus = normalizeStatus(restorableStatus);

  if (record.isDemo !== undefined) normalized.isDemo = !!record.isDemo;

  const markdown = asOptionalString(record.markdown);
  if (markdown === undefined) delete normalized.markdown;
  else normalized.markdown = markdown;

  return normalized;
}

function sanitizeSessionRecord(record, options) {
  const normalized = sanitizeBaseRecord(record, options);
  if (!normalized) return null;

  const data = asPlainObject(normalized.data);
  const sessionGoal = asTrimmedString(data.sessionGoal || normalized.goal);
  normalized.goal = asTrimmedString(normalized.goal || sessionGoal);
  normalized.data = {
    ...data,
    ...(normalized.id ? { id: normalized.id } : {}),
    campaignId: normalized.campaignId,
    tags: normalized.tags,
  };
  if (sessionGoal) normalized.data.sessionGoal = sessionGoal;
  return normalized;
}

function sanitizeEncounterRecord(record, options) {
  const normalized = sanitizeBaseRecord(record, options);
  if (!normalized) return null;

  const data = asPlainObject(normalized.data);
  normalized.name = asTrimmedString(normalized.name || data.name);
  if (normalized.sessionId != null) normalized.sessionId = asTrimmedString(normalized.sessionId) || null;
  else if (data.sessionId != null) normalized.sessionId = asTrimmedString(data.sessionId) || null;

  normalized.data = {
    ...data,
    ...(normalized.id ? { id: normalized.id } : {}),
    campaignId: normalized.campaignId,
    tags: normalized.tags,
  };
  if (normalized.name) normalized.data.name = normalized.name;
  if (normalized.sessionId !== undefined) normalized.data.sessionId = normalized.sessionId;
  return normalized;
}

function sanitizeNpcRecord(record, options) {
  const normalized = sanitizeBaseRecord(record, options);
  if (!normalized) return null;

  const carrying = Array.isArray(normalized.carrying)
    ? normalized.carrying.map(item => String(item || '').trim()).filter(Boolean)
    : asTrimmedString(normalized.carrying)
      ? String(normalized.carrying).split('\n').map(item => item.trim()).filter(Boolean)
      : [];

  normalized.name = asTrimmedString(normalized.name);
  normalized.nickname = asTrimmedString(normalized.nickname);
  normalized.commonPhrase = asTrimmedString(normalized.commonPhrase);
  normalized.appearance = asTrimmedString(normalized.appearance);
  normalized.situation = asTrimmedString(normalized.situation);
  normalized.wantsNeeds = asTrimmedString(normalized.wantsNeeds);
  normalized.secretObstacle = asTrimmedString(normalized.secretObstacle);
  normalized.linkedSessions = asLinkedIds(normalized.linkedSessions);
  normalized.linkedEncounters = asLinkedIds(normalized.linkedEncounters);
  normalized.carrying = carrying;
  normalized.skillDescriptions = asPlainObject(normalized.skillDescriptions);
  return normalized;
}

function sanitizeLocationDistricts(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPlainObject)
    .map(district => ({
      ...district,
      name: asTrimmedString(district.name),
      readAloud: asTrimmedString(district.readAloud),
      pointsOfInterest: Array.isArray(district.pointsOfInterest)
        ? district.pointsOfInterest
            .filter(isPlainObject)
            .map(point => ({
              ...point,
              name: asTrimmedString(point.name),
              description: asTrimmedString(point.description),
            }))
            .filter(point => point.name || point.description)
        : [],
    }))
    .filter(district => district.name || district.readAloud || district.pointsOfInterest.length);
}

function sanitizeLocationRecord(record, options) {
  const normalized = sanitizeBaseRecord(record, options);
  if (!normalized) return null;

  normalized.name = asTrimmedString(normalized.name);
  normalized.description = asTrimmedString(normalized.description);
  normalized.government = asTrimmedString(normalized.government);
  normalized.populationSize = asTrimmedString(normalized.populationSize);
  normalized.populationDiversity = asTrimmedString(normalized.populationDiversity);
  normalized.languages = asTrimmedString(normalized.languages);
  normalized.resources = asTrimmedString(normalized.resources);
  normalized.funFact = asTrimmedString(normalized.funFact);
  normalized.sensoryDetail = asTrimmedString(normalized.sensoryDetail);
  normalized.hiddenDetail = asTrimmedString(normalized.hiddenDetail);
  normalized.onTheHorizon = asTrimmedString(normalized.onTheHorizon);
  normalized.linkedSessions = asLinkedIds(normalized.linkedSessions);
  normalized.districts = sanitizeLocationDistricts(normalized.districts);
  return normalized;
}

function sanitizeFactionClocks(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map(clock => ({
    ...clock,
    name: asTrimmedString(clock.name),
    steps: clock.steps,
    advanceTrigger: asTrimmedString(clock.advanceTrigger),
    setbackTrigger: asTrimmedString(clock.setbackTrigger),
    stepDescriptions: Array.isArray(clock.stepDescriptions)
      ? clock.stepDescriptions.map(item => String(item || '').trim())
      : [],
  }));
}

function sanitizeFactionRecord(record, options) {
  const normalized = sanitizeBaseRecord(record, options);
  if (!normalized) return null;

  normalized.name = asTrimmedString(normalized.name);
  normalized.origin = asTrimmedString(normalized.origin);
  normalized.goal = asTrimmedString(normalized.goal);
  normalized.linkedSessions = asLinkedIds(normalized.linkedSessions);
  normalized.linkedEncounters = asLinkedIds(normalized.linkedEncounters);
  normalized.linkedNpcs = asLinkedIds(normalized.linkedNpcs);
  normalized.linkedLocations = asLinkedIds(normalized.linkedLocations);
  normalized.factionClocks = sanitizeFactionClocks(normalized.factionClocks);
  return normalized;
}

function sanitizeCampaign(value) {
  if (!isPlainObject(value)) return null;
  const id = asTrimmedString(value.id);
  if (!id) return null;
  return {
    ...value,
    id,
    name: asTrimmedString(value.name, 'New Campaign') || 'New Campaign',
    description: asTrimmedString(value.description),
    createdAt: asOptionalString(value.createdAt) || value.createdAt,
    partyRoster: asPartyRoster(value.partyRoster),
    ...(value.isDemo ? { isDemo: true } : {}),
  };
}

function sanitizeMapPins(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map(pin => {
    const entityType = asTrimmedString(pin.entityType);
    const normalizedType = ['location', 'faction', 'session'].includes(entityType)
      ? entityType
      : (asTrimmedString(pin.locationId) ? 'location' : '');
    const linkedId = asTrimmedString(pin.entityId) || (normalizedType === 'location' ? asTrimmedString(pin.locationId) : '');
    const x = asFiniteNumber(pin.x);
    const y = asFiniteNumber(pin.y);
    return {
      ...pin,
      ...(asTrimmedString(pin.id) ? { id: asTrimmedString(pin.id) } : {}),
      ...(x !== undefined ? { x } : {}),
      ...(y !== undefined ? { y } : {}),
      label: asTrimmedString(pin.label),
      entityType: normalizedType || null,
      entityId: linkedId || null,
      locationId: normalizedType === 'location' && linkedId ? linkedId : null,
    };
  });
}

function sanitizeMapRecord(value) {
  if (!isPlainObject(value)) return null;
  const campaignId = asTrimmedString(value.campaignId);
  if (!campaignId) return null;
  return {
    ...value,
    campaignId,
    imageFilename: asTrimmedString(value.imageFilename) || null,
    pins: sanitizeMapPins(value.pins),
    updatedAt: asOptionalString(value.updatedAt) || value.updatedAt,
  };
}

function sanitizeMapBundle(value, { requireCampaignId = true } = {}) {
  if (!isPlainObject(value)) return null;
  const campaignId = asTrimmedString(value.campaignId);
  if (requireCampaignId && !campaignId) return null;

  let image = null;
  if (value.image != null) {
    if (!isPlainObject(value.image)) return null;
    image = {
      filename: asTrimmedString(value.image.filename),
      mimeType: asTrimmedString(value.image.mimeType),
      base64: asTrimmedString(value.image.base64),
    };
  }

  return {
    ...value,
    ...(campaignId ? { campaignId } : {}),
    imageFilename: asTrimmedString(value.imageFilename) || null,
    pins: sanitizeMapPins(value.pins),
    updatedAt: asOptionalString(value.updatedAt) || value.updatedAt || null,
    image,
  };
}

function sanitizeShortcuts(value) {
  const input = asPlainObject(value);
  const out = {};
  for (const [key, shortcut] of Object.entries(input)) {
    const normalized = asTrimmedString(shortcut);
    if (normalized) out[key] = normalized;
  }
  return out;
}

function migrateRecordStore(raw, collectionKey, sanitizeRecord) {
  const input = asPlainObject(raw);
  const items = Array.isArray(input[collectionKey]) ? input[collectionKey] : [];
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    [collectionKey]: items.map(item => sanitizeRecord(item, { allowMissingId: false })).filter(Boolean),
  };
}

function migrateSessionStore(raw) {
  return migrateRecordStore(raw, 'sessions', sanitizeSessionRecord);
}

function migrateEncounterStore(raw) {
  return migrateRecordStore(raw, 'encounters', sanitizeEncounterRecord);
}

function migrateNpcStore(raw) {
  return migrateRecordStore(raw, 'npcs', sanitizeNpcRecord);
}

function migrateLocationStore(raw) {
  return migrateRecordStore(raw, 'locations', sanitizeLocationRecord);
}

function migrateFactionStore(raw) {
  return migrateRecordStore(raw, 'factions', sanitizeFactionRecord);
}

function migrateSettingsStore(raw) {
  const input = asPlainObject(raw);
  const shortcuts = sanitizeShortcuts(input.shortcuts);
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    ...DEFAULT_SETTINGS,
    ...input,
    party: asPartyRoster(input.party),
    theme: ['dark', 'light'].includes(input.theme) ? input.theme : DEFAULT_SETTINGS.theme,
    uiScale: Number.isFinite(input.uiScale) ? input.uiScale : DEFAULT_SETTINGS.uiScale,
    autosaveEnabled: asBoolean(input.autosaveEnabled, DEFAULT_SETTINGS.autosaveEnabled),
    scheduledBackupsEnabled: asBoolean(input.scheduledBackupsEnabled, DEFAULT_SETTINGS.scheduledBackupsEnabled),
    scheduledBackupIntervalHours: Number.isFinite(input.scheduledBackupIntervalHours)
      ? input.scheduledBackupIntervalHours
      : DEFAULT_SETTINGS.scheduledBackupIntervalHours,
    shortcuts: {
      ...DEFAULT_SETTINGS.shortcuts,
      ...shortcuts,
    },
  };
}

function migrateCampaignStore(raw) {
  const input = asPlainObject(raw);
  const campaigns = Array.isArray(input.campaigns)
    ? input.campaigns.map(sanitizeCampaign).filter(Boolean)
    : [];
  let activeCampaignId = asTrimmedString(input.activeCampaignId) || null;
  if (campaigns.length && !campaigns.some(campaign => campaign.id === activeCampaignId)) {
    activeCampaignId = campaigns[0].id;
  }
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    campaigns,
    activeCampaignId,
  };
}

function migrateMapStore(raw) {
  const input = asPlainObject(raw);
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    maps: Array.isArray(input.maps) ? input.maps.map(sanitizeMapRecord).filter(Boolean) : [],
  };
}

function ensureSupportedBundleVersion(bundle, label) {
  if (!isPlainObject(bundle)) {
    throw new SchemaValidationError(`${label} must be a JSON object.`);
  }
  if (bundle.schemaVersion == null) return;
  if (!Number.isInteger(bundle.schemaVersion) || bundle.schemaVersion < 1 || bundle.schemaVersion > BUNDLE_SCHEMA_VERSION) {
    throw new SchemaValidationError(`${label} schemaVersion ${bundle.schemaVersion} is not supported.`);
  }
}

function assertArrayField(bundle, fieldName, label) {
  if (bundle[fieldName] == null) return [];
  if (!Array.isArray(bundle[fieldName])) {
    throw new SchemaValidationError(`${label}.${fieldName} must be an array.`);
  }
  return bundle[fieldName];
}

function sanitizeBundleCollection(bundle, fieldName, label, sanitizeRecord, options) {
  return assertArrayField(bundle, fieldName, label).map((item, index) => {
    if (!isPlainObject(item)) {
      throw new SchemaValidationError(`${label}.${fieldName}[${index}] must be an object.`);
    }
    const normalized = sanitizeRecord(item, options);
    if (!normalized) {
      throw new SchemaValidationError(`${label}.${fieldName}[${index}] is missing required fields.`);
    }
    return normalized;
  });
}

function normalizeSettingsImportBundle(bundle) {
  ensureSupportedBundleVersion(bundle, 'Import bundle');

  if (bundle.bundleType === CAMPAIGN_BUNDLE_TYPE) {
    throw new SchemaValidationError('This file is a full campaign export. Import it from Campaigns instead of Settings.');
  }

  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    bundleType: SETTINGS_BUNDLE_TYPE,
    exportedAt: asOptionalString(bundle.exportedAt) || new Date().toISOString(),
    sessions: sanitizeBundleCollection(bundle, 'sessions', 'Import bundle', sanitizeSessionRecord, { allowMissingId: true }),
    encounters: sanitizeBundleCollection(bundle, 'encounters', 'Import bundle', sanitizeEncounterRecord, { allowMissingId: true }),
    npcs: sanitizeBundleCollection(bundle, 'npcs', 'Import bundle', sanitizeNpcRecord, { allowMissingId: true }),
    locations: sanitizeBundleCollection(bundle, 'locations', 'Import bundle', sanitizeLocationRecord, { allowMissingId: true }),
    factions: sanitizeBundleCollection(bundle, 'factions', 'Import bundle', sanitizeFactionRecord, { allowMissingId: true }),
    maps: sanitizeBundleCollection(bundle, 'maps', 'Import bundle', item => sanitizeMapBundle(item, { requireCampaignId: false })),
  };
}

function normalizeCampaignImportBundle(bundle) {
  ensureSupportedBundleVersion(bundle, 'Campaign import bundle');

  if (!isPlainObject(bundle.campaign)) {
    throw new SchemaValidationError('Campaign import bundle.campaign must be an object.');
  }

  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    bundleType: CAMPAIGN_BUNDLE_TYPE,
    exportedAt: asOptionalString(bundle.exportedAt) || new Date().toISOString(),
    campaign: {
      name: asTrimmedString(bundle.campaign.name, 'Imported Campaign') || 'Imported Campaign',
      description: asTrimmedString(bundle.campaign.description),
      partyRoster: asPartyRoster(bundle.campaign.partyRoster),
    },
    sessions: sanitizeBundleCollection(bundle, 'sessions', 'Campaign import bundle', sanitizeSessionRecord, { allowMissingId: false }),
    encounters: sanitizeBundleCollection(bundle, 'encounters', 'Campaign import bundle', sanitizeEncounterRecord, { allowMissingId: false }),
    npcs: sanitizeBundleCollection(bundle, 'npcs', 'Campaign import bundle', sanitizeNpcRecord, { allowMissingId: false }),
    locations: sanitizeBundleCollection(bundle, 'locations', 'Campaign import bundle', sanitizeLocationRecord, { allowMissingId: false }),
    factions: sanitizeBundleCollection(bundle, 'factions', 'Campaign import bundle', sanitizeFactionRecord, { allowMissingId: false }),
    map: bundle.map == null
      ? null
      : (() => {
          if (!isPlainObject(bundle.map)) {
            throw new SchemaValidationError('Campaign import bundle.map must be an object.');
          }
          const normalized = sanitizeMapBundle(bundle.map, { requireCampaignId: false });
          if (!normalized) throw new SchemaValidationError('Campaign import bundle.map is invalid.');
          return normalized;
        })(),
  };
}

module.exports = {
  STORE_SCHEMA_VERSION,
  BUNDLE_SCHEMA_VERSION,
  SETTINGS_BUNDLE_TYPE,
  CAMPAIGN_BUNDLE_TYPE,
  DEFAULT_SETTINGS,
  SchemaValidationError,
  migrateSessionStore,
  migrateEncounterStore,
  migrateNpcStore,
  migrateLocationStore,
  migrateFactionStore,
  migrateSettingsStore,
  migrateCampaignStore,
  migrateMapStore,
  normalizeSettingsImportBundle,
  normalizeCampaignImportBundle,
};
