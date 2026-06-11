const sessionStore = require('./sessionStore');
const encounterStore = require('./encounterStore');
const npcStore = require('./npcStore');
const locationStore = require('./locationStore');
const factionStore = require('./factionStore');
const planRelations = require('./planRelations');
const { isLive } = require('./recordLifecycle');

function nodeId(type, id) {
  return `${type}:${id}`;
}

function addEdge(edgeMap, fromType, fromId, toType, toId) {
  if (!fromId || !toId) return;
  const left = nodeId(fromType, fromId);
  const right = nodeId(toType, toId);
  if (left === right) return;
  const [a, b] = [left, right].sort();
  edgeMap.set(`${a}|${b}`, { id: `${a}|${b}`, source: a, target: b });
}

function belongsToCampaign(record, campaignId) {
  return record.campaignId === campaignId || (!record.campaignId && campaignId === 'c-default');
}

async function buildEntityConnections(campaignId = 'c-default') {
  const [sessions, encounters, npcs, locations, factions] = await Promise.all([
    sessionStore.getAllFull(),
    encounterStore.getAllFull(),
    npcStore.getAllFull(),
    locationStore.getAllFull(),
    factionStore.getAllFull(),
  ]);

  const campaignSessions = sessions.filter(session => belongsToCampaign(session, campaignId) && isLive(session));
  const campaignEncounters = encounters.filter(encounter => belongsToCampaign(encounter, campaignId) && isLive(encounter));
  const campaignNpcs = npcs.filter(npc => belongsToCampaign(npc, campaignId) && isLive(npc));
  const campaignLocations = locations.filter(location => belongsToCampaign(location, campaignId) && isLive(location));
  const campaignFactions = factions.filter(faction => belongsToCampaign(faction, campaignId) && isLive(faction));

  const relationIndex = planRelations.buildRelationIndex(campaignSessions, campaignEncounters);
  const sessionById = new Map(campaignSessions.map(session => [session.id, session]));
  const encounterById = new Map(campaignEncounters.map(encounter => [encounter.id, encounter]));
  const npcById = new Map(campaignNpcs.map(npc => [npc.id, npc]));
  const locationById = new Map(campaignLocations.map(location => [location.id, location]));
  const factionById = new Map(campaignFactions.map(faction => [faction.id, faction]));

  const edgeMap = new Map();

  for (const session of campaignSessions) {
    for (const encounterId of relationIndex.sessionToEncounters.get(session.id) || []) {
      if (encounterById.has(encounterId)) addEdge(edgeMap, 'session', session.id, 'encounter', encounterId);
    }

    for (const npcId of session.data?.linkedNpcs || []) {
      if (npcById.has(npcId)) addEdge(edgeMap, 'session', session.id, 'npc', npcId);
    }

    for (const locationId of session.data?.linkedLocations || []) {
      if (locationById.has(locationId)) addEdge(edgeMap, 'session', session.id, 'location', locationId);
    }
  }

  for (const npc of campaignNpcs) {
    for (const sessionId of npc.linkedSessions || []) {
      if (sessionById.has(sessionId)) addEdge(edgeMap, 'npc', npc.id, 'session', sessionId);
    }
    for (const encounterId of npc.linkedEncounters || []) {
      if (encounterById.has(encounterId)) addEdge(edgeMap, 'npc', npc.id, 'encounter', encounterId);
    }
  }

  for (const location of campaignLocations) {
    for (const sessionId of location.linkedSessions || []) {
      if (sessionById.has(sessionId)) addEdge(edgeMap, 'location', location.id, 'session', sessionId);
    }
  }

  for (const faction of campaignFactions) {
    for (const sessionId of faction.linkedSessions || []) {
      if (sessionById.has(sessionId)) addEdge(edgeMap, 'faction', faction.id, 'session', sessionId);
    }
    for (const encounterId of faction.linkedEncounters || []) {
      if (encounterById.has(encounterId)) addEdge(edgeMap, 'faction', faction.id, 'encounter', encounterId);
    }
    for (const npcId of faction.linkedNpcs || []) {
      if (npcById.has(npcId)) addEdge(edgeMap, 'faction', faction.id, 'npc', npcId);
    }
    for (const locationId of faction.linkedLocations || []) {
      if (locationById.has(locationId)) addEdge(edgeMap, 'faction', faction.id, 'location', locationId);
    }
  }

  const adjacency = new Map();
  function link(nodeA, nodeB) {
    if (!adjacency.has(nodeA)) adjacency.set(nodeA, new Set());
    adjacency.get(nodeA).add(nodeB);
  }
  for (const edge of edgeMap.values()) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  function toItems(val) {
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === 'string') return val.split('\n').map(s => s.trim()).filter(Boolean);
    return [];
  }

  const nodes = [
    ...campaignSessions.map(session => ({
      id: nodeId('session', session.id),
      entityType: 'session',
      rawId: session.id,
      label: `Session #${String(session.sessionNumber ?? '?').includes('.') ? session.sessionNumber : String(session.sessionNumber ?? '?').padStart(3, '0')}`,
      subtitle: session.goal || session.date || 'No session goal recorded.',
      meta: session.date || '',
      tags: session.tags || [],
      url: `/view/${session.id}`,
      searchText: [
        session.id,
        session.goal,
        session.date,
        session.partyLevel,
        ...(session.tags || []),
        session.data?.sessionRecap,
        session.data?.worldStateChanges,
        session.data?.unresolvedThreads,
        session.data?.npcStatusChanges,
        session.data?.treasureRewardsLog,
      ].join(' ').toLowerCase(),
      continuity: {
        recap: session.data?.sessionRecap || '',
        threads: toItems(session.data?.unresolvedThreads),
        worldChanges: toItems(session.data?.worldStateChanges),
        npcChanges: toItems(session.data?.npcStatusChanges),
        treasure: toItems(session.data?.treasureRewardsLog),
      },
    })),
    ...campaignEncounters.map(encounter => ({
      id: nodeId('encounter', encounter.id),
      entityType: 'encounter',
      rawId: encounter.id,
      label: encounter.name || encounter.id,
      subtitle: encounter.fiction || 'No encounter fiction recorded.',
      meta: encounter.sessionId ? `Linked to ${encounter.sessionId}` : '',
      tags: encounter.tags || [],
      url: `/encounter/view/${encounter.id}`,
      searchText: [
        encounter.id,
        encounter.name,
        encounter.fiction,
        encounter.sessionId,
        ...(encounter.tags || []),
      ].join(' ').toLowerCase(),
    })),
    ...campaignNpcs.map(npc => ({
      id: nodeId('npc', npc.id),
      entityType: 'npc',
      rawId: npc.id,
      label: npc.name,
      subtitle: npc.nickname ? `"${npc.nickname}"${npc.situation ? ` — ${npc.situation}` : ''}` : (npc.situation || 'No NPC situation recorded.'),
      meta: npc.nickname || '',
      tags: npc.tags || [],
      url: `/npc/view/${npc.id}`,
      searchText: [
        npc.id,
        npc.name,
        npc.nickname,
        npc.situation,
        ...(npc.tags || []),
      ].join(' ').toLowerCase(),
    })),
    ...campaignLocations.map(location => ({
      id: nodeId('location', location.id),
      entityType: 'location',
      rawId: location.id,
      label: location.name || location.id,
      subtitle: location.description || 'No location description recorded.',
      meta: location.government || '',
      tags: location.tags || [],
      url: `/location/view/${location.id}`,
      searchText: [
        location.id,
        location.name,
        location.description,
        location.government,
        ...(location.tags || []),
      ].join(' ').toLowerCase(),
    })),
    ...campaignFactions.map(faction => ({
      id: nodeId('faction', faction.id),
      entityType: 'faction',
      rawId: faction.id,
      label: faction.name || faction.id,
      subtitle: faction.goal || faction.origin || 'No faction goal recorded.',
      meta: faction.origin || '',
      tags: faction.tags || [],
      url: `/faction/view/${faction.id}`,
      searchText: [
        faction.id,
        faction.name,
        faction.origin,
        faction.goal,
        faction.size,
        faction.partyReputation,
        ...(faction.tags || []),
        ...(faction.factionClocks || []).flatMap(clock => [
          clock.name,
          clock.advanceTrigger,
          clock.setbackTrigger,
          ...(clock.stepDescriptions || []),
        ]),
      ].join(' ').toLowerCase(),
    })),
  ].map(node => ({
    ...node,
    connectionCount: (adjacency.get(node.id) || new Set()).size,
    links: [...(adjacency.get(node.id) || new Set())],
  }));

  return {
    nodes,
    edges: [...edgeMap.values()],
  };
}

module.exports = {
  buildEntityConnections,
};
