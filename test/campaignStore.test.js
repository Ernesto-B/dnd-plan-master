const assert = require('node:assert/strict');
const test = require('node:test');

const { withIsolatedDataDir } = require('../test-support/service-test-context.js');

test('campaign store seeds a default campaign and keeps active campaign state consistent', async () => {
  await withIsolatedDataDir(async ({ requireProject }) => {
    const campaignStore = requireProject('src/services/campaignStore.js');

    assert.deepEqual(await campaignStore.init(), { firstLaunch: true });

    const initialCampaigns = await campaignStore.getAllCampaigns();
    assert.equal(initialCampaigns.length, 1);
    assert.equal(initialCampaigns[0].id, 'c-default');
    assert.equal(initialCampaigns[0].name, 'My Campaign');
    assert.equal(await campaignStore.getActiveCampaignId(), 'c-default');

    const created = await campaignStore.createCampaign({
      name: '  Shadow War  ',
      description: '  Across the Vale  ',
    });

    assert.match(created.id, /^c-[a-z0-9]{6}$/);
    assert.equal(created.name, 'Shadow War');
    assert.equal(created.description, 'Across the Vale');

    await campaignStore.setActiveCampaignId(created.id);
    assert.equal(await campaignStore.getActiveCampaignId(), created.id);

    await campaignStore.deleteCampaign(created.id);
    assert.equal(await campaignStore.getActiveCampaignId(), 'c-default');
    assert.equal((await campaignStore.getAllCampaigns()).length, 1);

    assert.deepEqual(await campaignStore.init(), { firstLaunch: false });
  });
});

test('campaign store rejects deleting the last remaining campaign', async () => {
  await withIsolatedDataDir(async ({ requireProject }) => {
    const campaignStore = requireProject('src/services/campaignStore.js');

    await campaignStore.init();

    await assert.rejects(
      campaignStore.deleteCampaign('c-default'),
      /Cannot delete the last campaign/,
    );
  });
});
