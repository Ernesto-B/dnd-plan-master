const assert = require('node:assert/strict');
const test = require('node:test');

const { withIsolatedDataDir } = require('../test-support/service-test-context.js');

test('import preview classifies duplicates, conflicts, and missing ids', async () => {
  await withIsolatedDataDir(async ({ requireProject }) => {
    const sessionStore = requireProject('src/services/sessionStore.js');
    const encounterStore = requireProject('src/services/encounterStore.js');
    const importPlanner = requireProject('src/services/importPlanner.js');

    await sessionStore.replaceAllFull([{
      id: 's-dup',
      campaignId: 'c-default',
      goal: 'Keep Watch',
      createdAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      data: {
        id: 's-dup',
        campaignId: 'c-default',
        sessionGoal: 'Keep Watch',
        tags: [],
      },
    }]);

    await encounterStore.replaceAllFull([{
      id: 'e-conflict',
      campaignId: 'c-default',
      name: 'Bridge Ambush',
      createdAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      data: {
        id: 'e-conflict',
        campaignId: 'c-default',
        name: 'Bridge Ambush',
        tags: [],
      },
    }]);

    const preview = await importPlanner.buildImportPreview({
      sessions: [{
        id: 's-dup',
        status: 'active',
        goal: 'Keep Watch',
        tags: [],
        data: {
          id: 's-dup',
          sessionGoal: 'Keep Watch',
          tags: [],
        },
      }],
      encounters: [{
        id: 'e-conflict',
        status: 'active',
        name: 'Changed Ambush',
        tags: [],
        data: {
          id: 'e-conflict',
          name: 'Changed Ambush',
          tags: [],
        },
      }],
      npcs: [{
        name: 'No ID Scout',
      }],
    });

    assert.deepEqual(preview.counts, {
      total: 3,
      new: 0,
      duplicate: 1,
      conflict: 1,
      'missing-id': 1,
    });

    assert.equal(preview.items.find(item => item.sourceId === 's-dup').status, 'duplicate');
    assert.equal(preview.items.find(item => item.sourceId === 's-dup').recommendedAction, 'skip');
    assert.equal(preview.items.find(item => item.sourceId === 'e-conflict').status, 'conflict');
    assert.equal(preview.items.find(item => item.sourceId === 'e-conflict').recommendedAction, 'clone');
    assert.equal(preview.items.find(item => item.type === 'npc').status, 'missing-id');
    assert.deepEqual(preview.items.find(item => item.type === 'npc').availableActions, ['clone']);
  });
});

test('executeImport clones conflicting records and remaps linked ids', async () => {
  await withIsolatedDataDir(async ({ requireProject }) => {
    const sessionStore = requireProject('src/services/sessionStore.js');
    const encounterStore = requireProject('src/services/encounterStore.js');
    const npcStore = requireProject('src/services/npcStore.js');
    const importPlanner = requireProject('src/services/importPlanner.js');

    await sessionStore.replaceAllFull([{
      id: 's-conflict',
      campaignId: 'c-default',
      goal: 'Current Session',
      createdAt: '2026-01-01T00:00:00.000Z',
      sortOrder: 0,
      tags: [],
      data: {
        id: 's-conflict',
        campaignId: 'c-default',
        sessionGoal: 'Current Session',
        encounters: [],
        tags: [],
      },
    }]);

    await encounterStore.replaceAllFull([{
      id: 'e-conflict',
      campaignId: 'c-default',
      name: 'Current Encounter',
      sessionId: 's-conflict',
      createdAt: '2026-01-01T00:00:00.000Z',
      sortOrder: 0,
      tags: [],
      data: {
        id: 'e-conflict',
        campaignId: 'c-default',
        name: 'Current Encounter',
        sessionId: 's-conflict',
        tags: [],
      },
    }]);

    const report = await importPlanner.executeImport({
      sessions: [{
        id: 's-conflict',
        goal: 'Imported Session',
        tags: [],
        data: {
          id: 's-conflict',
          sessionGoal: 'Imported Session',
          encounters: [{ encounterPlanId: 'e-conflict' }],
          tags: [],
        },
      }],
      encounters: [{
        id: 'e-conflict',
        name: 'Imported Encounter',
        sessionId: 's-conflict',
        tags: [],
        data: {
          id: 'e-conflict',
          name: 'Imported Encounter',
          sessionId: 's-conflict',
          tags: [],
        },
      }],
      npcs: [{
        id: 'n-import',
        name: 'Guide',
        linkedSessions: ['s-conflict'],
        linkedEncounters: ['e-conflict'],
        tags: [],
      }],
    }, {}, 'c-target');

    assert.equal(report.totals.cloned, 2);
    assert.equal(report.totals.imported, 1);
    assert.equal(report.totals.skipped, 0);

    const sessions = await sessionStore.getAllFull();
    const encounters = await encounterStore.getAllFull();
    const npcs = await npcStore.getAllFull();

    const clonedSession = sessions.find(record => record.id !== 's-conflict');
    const clonedEncounter = encounters.find(record => record.id !== 'e-conflict');
    const importedNpc = npcs.find(record => record.id === 'n-import');

    assert.ok(clonedSession);
    assert.ok(clonedEncounter);
    assert.ok(importedNpc);
    assert.match(clonedSession.id, /^s-[a-z0-9]{6}$/);
    assert.match(clonedEncounter.id, /^e-[a-z0-9]{6}$/);
    assert.equal(clonedSession.campaignId, 'c-target');
    assert.equal(clonedEncounter.campaignId, 'c-target');
    assert.equal(importedNpc.campaignId, 'c-target');
    assert.equal(clonedSession.data.encounters[0].encounterPlanId, clonedEncounter.id);
    assert.equal(clonedEncounter.sessionId, clonedSession.id);
    assert.deepEqual(importedNpc.linkedSessions, [clonedSession.id]);
    assert.deepEqual(importedNpc.linkedEncounters, [clonedEncounter.id]);
  });
});
