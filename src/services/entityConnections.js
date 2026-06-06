const sessionStore = require('./sessionStore');
const encounterStore = require('./encounterStore');
const npcStore = require('./npcStore');
const planRelations = require('./planRelations');

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

async function buildEntityConnections() {
  const [sessions, encounters, npcs] = await Promise.all([
    sessionStore.getAllFull(),
    encounterStore.getAllFull(),
    npcStore.getAllFull(),
  ]);

  const relationIndex = planRelations.buildRelationIndex(sessions, encounters);
  const sessionById = new Map(sessions.map(session => [session.id, session]));
  const encounterById = new Map(encounters.map(encounter => [encounter.id, encounter]));
  const npcById = new Map(npcs.map(npc => [npc.id, npc]));

  const edgeMap = new Map();

  for (const session of sessions) {
    for (const encounterId of relationIndex.sessionToEncounters.get(session.id) || []) {
      if (encounterById.has(encounterId)) addEdge(edgeMap, 'session', session.id, 'encounter', encounterId);
    }

    for (const npcId of session.data?.linkedNpcs || []) {
      if (npcById.has(npcId)) addEdge(edgeMap, 'session', session.id, 'npc', npcId);
    }
  }

  for (const npc of npcs) {
    for (const sessionId of npc.linkedSessions || []) {
      if (sessionById.has(sessionId)) addEdge(edgeMap, 'npc', npc.id, 'session', sessionId);
    }
    for (const encounterId of npc.linkedEncounters || []) {
      if (encounterById.has(encounterId)) addEdge(edgeMap, 'npc', npc.id, 'encounter', encounterId);
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

  const nodes = [
    ...sessions.map(session => ({
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
    })),
    ...encounters.map(encounter => ({
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
    ...npcs.map(npc => ({
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
