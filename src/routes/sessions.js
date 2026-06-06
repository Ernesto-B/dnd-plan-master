const express = require('express');
const fs      = require('fs').promises;
const path    = require('path');
const router  = express.Router();

const sessionStore       = require('../services/sessionStore');
const encounterStore     = require('../services/encounterStore');
const markdownGenerator  = require('../services/markdownGenerator');
const encounterMdGen     = require('../services/encounterMarkdownGenerator');
const packetBuilder      = require('../services/sessionPacketBuilder');
const pdfGenerator       = require('../services/pdfGenerator');
const folderPicker       = require('../services/folderPicker');
const planRelations      = require('../services/planRelations');
const npcStore           = require('../services/npcStore');
const encounterPdfTemplate = require('../templates/encounterPdfTemplate');

function sessionFilename(session) {
  return `session-${String(session.sessionNumber).padStart(3, '0')}`;
}

function encounterFilename(id) {
  return `encounter-${String(id).replace(/^[eE]-?0*/i, '')}`;
}

async function loadPacketData(sessionId) {
  const session = await sessionStore.getSession(sessionId);
  if (!session) return null;

  const links = await planRelations.getSessionLinks(session.id);
  const linkedEncounters = [];
  let missingEncounterCount = 0;

  for (const link of links) {
    const encounter = await encounterStore.getEncounter(link.id);
    if (!encounter) {
      missingEncounterCount++;
      continue;
    }
    linkedEncounters.push({
      id: encounter.id,
      name: encounter.name,
      sessionId: encounter.sessionId || null,
      markdown: encounter.markdown || encounterMdGen.generate(encounter.data),
    });
  }

  const linkedNpcIds = Array.isArray(session.data?.linkedNpcs) ? session.data.linkedNpcs : [];
  const linkedNpcs = await Promise.all(linkedNpcIds.map(async id => {
    const npc = await npcStore.getNpc(id);
    return {
      id,
      name: npc?.name || id,
      nickname: npc?.nickname || '',
      exists: !!npc,
    };
  }));

  const markdown = packetBuilder.buildPacketMarkdown({
    session,
    linkedNpcs,
    linkedEncounters,
  });
  const html = packetBuilder.buildPacketHtml({
    session,
    linkedNpcs,
    linkedEncounters,
  });
  const pdf = await pdfGenerator.generateFromHtml(html);

  return {
    session,
    linkedEncounters,
    linkedNpcs,
    missingEncounterCount,
    markdown,
    html,
    pdf,
    packetBase: packetBuilder.packetFilename(session),
    sessionBase: sessionFilename(session),
  };
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

router.post('/:id/export-packet', async (req, res) => {
  try {
    const packet = await loadPacketData(req.params.id);
    if (!packet) return res.status(404).json({ error: 'Session not found' });

    const folder = await folderPicker.pick();
    if (!folder) return res.json({ cancelled: true });

    const sessionMarkdown = markdownGenerator.generate(packet.session.data);
    const sessionPdf = await pdfGenerator.generate(packet.session.data);
    const sessionBase = packet.sessionBase;
    const packetBase = packet.packetBase;

    await fs.writeFile(path.join(folder, `${sessionBase}.md`), sessionMarkdown, 'utf8');
    await fs.writeFile(path.join(folder, `${sessionBase}.pdf`), sessionPdf);
    await fs.writeFile(path.join(folder, `${packetBase}.md`), packet.markdown, 'utf8');
    await fs.writeFile(path.join(folder, `${packetBase}.pdf`), packet.pdf);

    let exportedEncounterCount = 0;
    for (const encounter of packet.linkedEncounters) {
      const encounterFull = await encounterStore.getEncounter(encounter.id);
      if (!encounterFull) continue;

      const encounterMarkdown = encounterMdGen.generate(encounterFull.data);
      const encounterPdf = await pdfGenerator.generateFromHtml(encounterPdfTemplate.render(encounterFull.data));
      const encounterBase = encounterFilename(encounter.id);

      await fs.writeFile(path.join(folder, `${encounterBase}.md`), encounterMarkdown, 'utf8');
      await fs.writeFile(path.join(folder, `${encounterBase}.pdf`), encounterPdf);
      exportedEncounterCount++;
    }

    res.json({
      success: true,
      path: folder,
      sessionBase,
      packetBase,
      exportedEncounterCount,
      missingEncounterCount: packet.missingEncounterCount,
    });
  } catch (err) {
    console.error('Export-packet error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/packet', async (req, res) => {
  try {
    const packet = await loadPacketData(req.params.id);
    if (!packet) return res.status(404).json({ error: 'Session not found' });
    res.json({
      filename: packet.packetBase,
      markdown: packet.markdown,
      pdf: packet.pdf.toString('base64'),
      missingEncounterCount: packet.missingEncounterCount,
      linkedEncounterCount: packet.linkedEncounters.length,
      linkedNpcCount: packet.linkedNpcs.length,
    });
  } catch (err) {
    console.error('Packet export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List all sessions (summary only)
router.get('/', async (_req, res) => {
  try {
    const [summaries, sessions, encounters] = await Promise.all([
      sessionStore.getAllSessions(),
      sessionStore.getAllFull(),
      encounterStore.getAllFull(),
    ]);
    const index = planRelations.buildRelationIndex(sessions, encounters);
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
    const sessions = await sessionStore.getAllFull();
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
    const data = req.body;

    // Diff old vs new linkedNpcs to maintain bidirectional links
    let oldNpcIds = [];
    if (data.id) {
      const old = await sessionStore.getSession(data.id);
      oldNpcIds = old?.data?.linkedNpcs || [];
    }

    const markdown = markdownGenerator.generate(data);
    const pdf      = await pdfGenerator.generate(data);
    const saved    = await sessionStore.saveSession(data, markdown);

    await npcStore.syncSessionLinks(saved.id, data.linkedNpcs || [], oldNpcIds);

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

// Delete session
router.delete('/:id', async (req, res) => {
  try {
    await sessionStore.deleteSession(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

module.exports = router;
