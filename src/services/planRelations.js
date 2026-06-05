const sessionStore = require('./sessionStore');
const encounterStore = require('./encounterStore');

function buildRelationIndex(sessions, encounters) {
  const sessionToEncounters = new Map();
  const encounterToSessions = new Map();

  function addLink(sessionId, encounterId) {
    if (!sessionId || !encounterId) return;

    if (!sessionToEncounters.has(sessionId)) sessionToEncounters.set(sessionId, new Set());
    if (!encounterToSessions.has(encounterId)) encounterToSessions.set(encounterId, new Set());

    sessionToEncounters.get(sessionId).add(encounterId);
    encounterToSessions.get(encounterId).add(sessionId);
  }

  for (const encounter of encounters) {
    addLink(encounter.sessionId, encounter.id);
  }

  for (const session of sessions) {
    for (const card of session.data?.encounters || []) {
      addLink(session.id, card.encounterPlanId);
    }
  }

  return { sessionToEncounters, encounterToSessions };
}

async function loadAll() {
  const [sessions, encounters] = await Promise.all([
    sessionStore.getAllFull(),
    encounterStore.getAllFull(),
  ]);

  return {
    sessions,
    encounters,
    index: buildRelationIndex(sessions, encounters),
  };
}

async function getSessionLinks(sessionId) {
  const { encounters, index } = await loadAll();
  const encounterById = new Map(encounters.map(encounter => [encounter.id, encounter]));
  const linkedIds = index.sessionToEncounters.get(sessionId) || new Set();

  return [...linkedIds].map((encounterId) => {
    const encounter = encounterById.get(encounterId);
    return {
      id: encounterId,
      name: encounter?.name || encounterId,
      sessionId: encounter?.sessionId || null,
      exists: !!encounter,
    };
  });
}

async function getEncounterLinks(encounterId) {
  const { sessions, index } = await loadAll();
  const sessionById = new Map(sessions.map(session => [session.id, session]));
  const linkedIds = index.encounterToSessions.get(encounterId) || new Set();

  return [...linkedIds].map((sessionId) => {
    const session = sessionById.get(sessionId);
    return {
      id: sessionId,
      sessionNumber: session?.sessionNumber || null,
      goal: session?.goal || sessionId,
      exists: !!session,
    };
  });
}

module.exports = {
  buildRelationIndex,
  getSessionLinks,
  getEncounterLinks,
};
