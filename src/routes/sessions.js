const express = require('express');
const fs      = require('fs').promises;
const path    = require('path');
const router  = express.Router();

const sessionStore       = require('../services/sessionStore');
const encounterStore     = require('../services/encounterStore');
const markdownGenerator  = require('../services/markdownGenerator');
const pdfGenerator       = require('../services/pdfGenerator');
const folderPicker       = require('../services/folderPicker');
const planRelations      = require('../services/planRelations');
const npcStore           = require('../services/npcStore');
const locationStore      = require('../services/locationStore');
const campaignStore      = require('../services/campaignStore');
const { ACTIVE, TRASHED, normalizeStatus, isActive } = require('../services/recordLifecycle');

function sessionFilename(session) {
  return `session-${String(session.sessionNumber).padStart(3, '0')}`;
}

// Generate preview without saving to the store
router.post('/preview', async (req, res) => {
  try {
    const data     = req.body;
    const markdown = markdownGenerator.generate(data);
    const pdf      = await pdfGenerator.generate(data);
    const num      = String(data.sessionNumber || 0).padStart(3, '0');
    res.json({ filename: `session-${num}`, markdown, pdf: pdf.toString('base64') });
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Open native OS folder picker and write the files there
router.post('/save-files', async (req, res) => {
  try {
    const { markdown, pdf, filename } = req.body;

    const folder = await folderPicker.pick();
    if (!folder) return res.json({ cancelled: true });

    await fs.writeFile(path.join(folder, `${filename}.md`), markdown, 'utf8');
    await fs.writeFile(path.join(folder, `${filename}.pdf`), Buffer.from(pdf, 'base64'));

    res.json({ success: true, path: folder });
  } catch (err) {
    console.error('Save-files error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List all sessions (summary only)
router.get('/', async (_req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const [summaries, sessions, encounters] = await Promise.all([
      sessionStore.getAllSessions(campaignId),
      sessionStore.getAllFull(),
      encounterStore.getAllFull(),
    ]);
    const index = planRelations.buildRelationIndex(sessions.filter(isActive), encounters.filter(isActive));
    res.json(summaries.map(session => ({
      ...session,
      linkedEncounterCount: index.sessionToEncounters.get(session.id)?.size || 0,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/campaign', async (_req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const sessions = (await sessionStore.getAllFull()).filter(session =>
      (session.campaignId === campaignId || (!session.campaignId && campaignId === 'c-default')) && isActive(session)
    );
    const payload = sessions.map(session => {
      const data = session.data || {};
      const toList = (value) => String(value || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

      return {
        id: session.id,
        sessionNumber: session.sessionNumber,
        date: session.date,
        partyLevel: session.partyLevel,
        goal: session.goal,
        createdAt: session.createdAt,
        tags: session.tags || [],
        continuity: {
          sessionRecap: String(data.sessionRecap || '').trim(),
          worldStateChanges: toList(data.worldStateChanges),
          unresolvedThreads: toList(data.unresolvedThreads),
          npcStatusChanges: toList(data.npcStatusChanges),
          treasureRewardsLog: toList(data.treasureRewardsLog),
        },
      };
    }).filter(session => {
      const continuity = session.continuity;
      return continuity.sessionRecap
        || continuity.worldStateChanges.length
        || continuity.unresolvedThreads.length
        || continuity.npcStatusChanges.length
        || continuity.treasureRewardsLog.length;
    });

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/reorder', async (_req, res) => {
  try {
    const ids = Array.isArray(_req.body?.ids) ? _req.body.ids : [];
    const campaignId = await campaignStore.getActiveCampaignId();
    const ordered = await sessionStore.reorderSessions(ids, campaignId);
    res.json({ success: true, ids: ordered.map(session => session.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/links', async (req, res) => {
  try {
    res.json(await planRelations.getSessionLinks(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/linked-npcs', async (req, res) => {
  try {
    const session = await sessionStore.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const ids = session.data?.linkedNpcs || [];
    const results = await Promise.all(ids.map(async id => {
      const npc = await npcStore.getNpc(id);
      return { id, name: npc?.name || id, nickname: npc?.nickname || '', exists: !!npc };
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single session
router.get('/:id', async (req, res) => {
  try {
    const session = await sessionStore.getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save session to the store (called after user confirms preview)
router.post('/', async (req, res) => {
  try {
    const campaignId = await campaignStore.getActiveCampaignId();
    const data = { ...req.body, campaignId };

    // Diff old vs new linkedNpcs/linkedLocations to maintain bidirectional links
    let oldNpcIds = [];
    let oldLocationIds = [];
    if (data.id) {
      const old = await sessionStore.getSession(data.id);
      oldNpcIds = old?.data?.linkedNpcs || [];
      oldLocationIds = old?.data?.linkedLocations || [];
    }

    const markdown = markdownGenerator.generate(data);
    const pdf      = await pdfGenerator.generate(data);
    const saved    = await sessionStore.saveSession(data, markdown);

    await npcStore.syncSessionLinks(saved.id, data.linkedNpcs || [], oldNpcIds);
    await locationStore.syncSessionLinks(saved.id, data.linkedLocations || [], oldLocationIds);

    res.json({
      id:            saved.id,
      sessionNumber: saved.sessionNumber,
      markdown,
      pdf:           pdf.toString('base64'),
      filename:      sessionFilename(saved),
    });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update tags
router.patch('/:id/tags', async (req, res) => {
  try {
    const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
    await sessionStore.updateTags(req.params.id, tags);
    res.json({ success: true, tags });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

router.patch('/:id/state', async (req, res) => {
  try {
    const status = normalizeStatus(req.body?.status);
    const updated = await sessionStore.updateStatus(req.params.id, status);
    res.json({ success: true, status: updated.status });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

// Delete session
router.delete('/:id', async (req, res) => {
  try {
    const updated = await sessionStore.updateStatus(req.params.id, TRASHED);
    res.json({ success: true, status: updated.status });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

module.exports = router;
