const assert = require('node:assert/strict');
const test = require('node:test');

const { withIsolatedDataDir } = require('../test-support/service-test-context.js');

test('backup store creates a full backup listing and restores all persisted state', async () => {
  await withIsolatedDataDir(async ({ requireProject }) => {
    const sessionStore = requireProject('src/services/sessionStore.js');
    const encounterStore = requireProject('src/services/encounterStore.js');
    const npcStore = requireProject('src/services/npcStore.js');
    const locationStore = requireProject('src/services/locationStore.js');
    const factionStore = requireProject('src/services/factionStore.js');
    const settingsStore = requireProject('src/services/settingsStore.js');
    const mapStore = requireProject('src/services/mapStore.js');
    const mapBundle = requireProject('src/services/mapBundle.js');
    const backupStore = requireProject('src/services/backupStore.js');

    await settingsStore.saveSettings({
      theme: 'light',
      party: [{
        name: 'Aela',
        playerClass: 'Ranger',
        characterUrl: 'https://example.com/aela',
      }],
    });

    await sessionStore.replaceAllFull([{
      id: 's-1',
      campaignId: 'c-default',
      goal: 'Backup Session',
      createdAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      data: {
        id: 's-1',
        campaignId: 'c-default',
        sessionGoal: 'Backup Session',
        tags: [],
      },
    }]);

    await encounterStore.replaceAllFull([{
      id: 'e-1',
      campaignId: 'c-default',
      name: 'Backup Encounter',
      sessionId: 's-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      tags: [],
      data: {
        id: 'e-1',
        campaignId: 'c-default',
        name: 'Backup Encounter',
        sessionId: 's-1',
        tags: [],
      },
    }]);

    await npcStore.replaceAllFull([{
      id: 'n-1',
      campaignId: 'c-default',
      name: 'Scout',
      linkedSessions: ['s-1'],
      linkedEncounters: ['e-1'],
      createdAt: '2026-01-01T00:00:00.000Z',
      tags: [],
    }]);

    await locationStore.replaceAllFull([{
      id: 'l-1',
      campaignId: 'c-default',
      name: 'Harbor',
      linkedSessions: ['s-1'],
      createdAt: '2026-01-01T00:00:00.000Z',
      tags: [],
    }]);

    await factionStore.replaceAllFull([{
      id: 'f-1',
      campaignId: 'c-default',
      name: 'Guild',
      linkedSessions: ['s-1'],
      linkedEncounters: ['e-1'],
      linkedNpcs: ['n-1'],
      linkedLocations: ['l-1'],
      createdAt: '2026-01-01T00:00:00.000Z',
      tags: [],
    }]);

    const mapImageBase64 = Buffer.from('backup-map-image').toString('base64');
    await mapBundle.restoreCampaignMap({
      campaignId: 'c-default',
      imageFilename: 'realm.png',
      pins: [{ id: 'pin-1', label: 'Harbor', x: 10, y: 20 }],
      image: {
        filename: 'realm.png',
        mimeType: 'image/png',
        base64: mapImageBase64,
      },
    }, 'c-default');

    const backup = await backupStore.createBackup();
    const backups = await backupStore.listBackups();
    assert.equal(backups.length, 1);
    assert.equal(backups[0].name, backup.name);
    assert.equal(backups[0].sessionCount, 1);
    assert.equal(backups[0].encounterCount, 1);
    assert.equal(backups[0].mapCount, 1);

    await Promise.all([
      sessionStore.replaceAllFull([]),
      encounterStore.replaceAllFull([]),
      npcStore.replaceAllFull([]),
      locationStore.replaceAllFull([]),
      factionStore.replaceAllFull([]),
    ]);
    await settingsStore.saveSettings({ theme: 'dark', party: [] });
    await mapStore.deleteMap('c-default');

    const restoreReport = await backupStore.restoreBackup(backup.name);
    assert.equal(restoreReport.sessionCount, 1);
    assert.equal(restoreReport.encounterCount, 1);
    assert.equal(restoreReport.npcCount, 1);
    assert.equal(restoreReport.locationCount, 1);
    assert.equal(restoreReport.factionCount, 1);
    assert.equal(restoreReport.mapCount, 1);

    assert.equal((await settingsStore.getSettings()).theme, 'light');
    assert.equal((await sessionStore.getAllFull()).length, 1);
    assert.equal((await encounterStore.getAllFull())[0].sessionId, 's-1');
    assert.deepEqual((await npcStore.getAllFull())[0].linkedEncounters, ['e-1']);
    assert.equal((await mapBundle.serializeCampaignMap('c-default')).image.base64, mapImageBase64);
  });
});
