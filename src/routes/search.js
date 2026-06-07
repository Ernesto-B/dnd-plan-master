const express       = require('express');
const router        = express.Router();
const sessionStore  = require('../services/sessionStore');
const encounterStore = require('../services/encounterStore');
const npcStore      = require('../services/npcStore');
const locationStore = require('../services/locationStore');
const entityConnections = require('../services/entityConnections');
const campaignStore = require('../services/campaignStore');

// Simple scoring: 3=exact, 2=starts-with, 1=includes, 0=no match
function matchScore(field, q) {
  if (!field || !q) return 0;
  const t = String(field).toLowerCase();
  const s = q.toLowerCase();
  if (t === s)            return 3;
  if (t.startsWith(s))   return 2;
  if (t.includes(s))     return 1;
  return 0;
}

function best(fields, q) {
  return fields.reduce((max, f) => Math.max(max, matchScore(f, q)), 0);
}

// Parse sigil prefix: "npc: foo" → { type: 'npc', q: 'foo' }
function parseQuery(raw) {
  const m = raw.match(/^(npc|session|sessions|sess|enc|encounter|encounters|loc|location|locations|tag):\s*(.*)/i);
  if (m) {
    const prefix = m[1].toLowerCase();
    const type = prefix.startsWith('enc')
      ? 'enc'
      : prefix.startsWith('loc')
        ? 'location'
        : prefix.startsWith('sess')
          ? 'session'
          : prefix;
    return { type, q: m[2].trim() };
  }
  return { type: null, q: raw.trim() };
}

router.get('/', async (req, res) => {
  try {
    const raw = (req.query.q || '').trim();
    if (!raw) return res.json([]);

    const { type, q } = parseQuery(raw);
    const results = [];

    if (!type || type === 'session') {
      const sessions = await sessionStore.getAllFull();
      for (const s of sessions) {
        const d = s.data || {};
        const sc = q
          ? best([String(s.sessionNumber), s.date, s.goal, (s.tags || []).join(' '),
                  d.sessionRecap, d.worldStateChanges, d.unresolvedThreads, d.npcStatusChanges], q)
          : 1;
        if (sc > 0) results.push({
          type: 'session',
          id:       s.id,
          title:    `Session #${s.sessionNumber}`,
          subtitle: s.goal || s.date || '',
          url:      `/view/${s.id}`,
          score:    sc,
        });
      }
    }

    if (!type || type === 'enc') {
      const encounters = await encounterStore.getAllEncounters();
      for (const e of encounters) {
        const sc = q
          ? best([e.name, (e.tags || []).join(' '), e.fiction], q)
          : 1;
        if (sc > 0) results.push({
          type: 'encounter',
          id:       e.id,
          title:    e.name || e.id,
          subtitle: e.fiction ? e.fiction.slice(0, 90) : '',
          url:      `/encounter/view/${e.id}`,
          score:    sc,
        });
      }
    }

    if (!type || type === 'npc') {
      const npcs = await npcStore.getAllNpcs();
      for (const n of npcs) {
        const sc = q
          ? best([n.name, n.nickname, n.situation, (n.tags || []).join(' ')], q)
          : 1;
        if (sc > 0) results.push({
          type: 'npc',
          id:       n.id,
          title:    n.name,
          subtitle: n.nickname ? `"${n.nickname}"${n.situation ? ' — ' + n.situation : ''}` : (n.situation || ''),
          url:      `/npc/view/${n.id}`,
          score:    sc,
        });
      }
    }

    if (!type || type === 'location') {
      const campaignId = await campaignStore.getActiveCampaignId();
      const locations = await locationStore.getAllLocations(campaignId);
      for (const l of locations) {
        const sc = q
          ? best([l.name, l.description, l.government, (l.tags || []).join(' ')], q)
          : 1;
        if (sc > 0) results.push({
          type: 'location',
          id:       l.id,
          title:    l.name || l.id,
          subtitle: l.description || l.government || '',
          url:      `/location/view/${l.id}`,
          score:    sc,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    res.json(results.slice(0, 24));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/entity-graph', async (_req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    res.json(await entityConnections.buildEntityConnections(campaignId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
