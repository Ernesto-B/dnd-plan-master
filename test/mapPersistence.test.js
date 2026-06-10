const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const test = require('node:test');

const { withIsolatedDataDir } = require('../test-support/service-test-context.js');

test('map store persists pins and image assets inside the writable data dir', async () => {
  await withIsolatedDataDir(async ({ requireProject }) => {
    const mapStore = requireProject('src/services/mapStore.js');

    const filename = await mapStore.saveMapImage('c-map', Buffer.from('map-bytes'), '.png');
    await mapStore.saveMap('c-map', {
      imageFilename: filename,
      pins: [{ id: 'pin-1', label: 'Harbor', x: 12.5, y: 42 }],
    });

    const stored = await mapStore.getMap('c-map');
    assert.equal(stored.imageFilename, 'map-c-map.png');
    assert.deepEqual(stored.pins, [{
      id: 'pin-1',
      label: 'Harbor',
      x: 12.5,
      y: 42,
      entityType: null,
      entityId: null,
      locationId: null,
    }]);
    assert.equal(await fs.readFile(mapStore.getMapImagePath(filename), 'utf8'), 'map-bytes');
  });
});

test('map bundles round-trip image data and remove superseded assets', async () => {
  await withIsolatedDataDir(async ({ requireProject }) => {
    const mapBundle = requireProject('src/services/mapBundle.js');
    const mapStore = requireProject('src/services/mapStore.js');

    const firstImageBase64 = Buffer.from('first-map-image').toString('base64');
    await mapBundle.restoreCampaignMap({
      campaignId: 'c-map',
      imageFilename: 'world.png',
      pins: [{ id: 'pin-1', label: 'Watchtower', x: 10, y: 20 }],
      image: {
        filename: 'world.png',
        mimeType: 'image/png',
        base64: firstImageBase64,
      },
    }, 'c-map');

    const firstBundle = await mapBundle.serializeCampaignMap('c-map');
    const firstImagePath = mapStore.getMapImagePath(firstBundle.imageFilename);
    assert.equal(firstBundle.image.mimeType, 'image/png');
    assert.equal(firstBundle.image.base64, firstImageBase64);
    assert.equal(firstBundle.pins[0].label, 'Watchtower');

    const secondImageBase64 = Buffer.from('second-map-image').toString('base64');
    await mapBundle.restoreCampaignMap({
      campaignId: 'c-map',
      imageFilename: 'world.jpg',
      pins: [],
      image: {
        filename: 'world.jpg',
        mimeType: 'image/jpeg',
        base64: secondImageBase64,
      },
    }, 'c-map');

    await assert.rejects(fs.access(firstImagePath));

    const secondBundle = await mapBundle.serializeCampaignMap('c-map');
    assert.equal(secondBundle.imageFilename, 'map-c-map.jpg');
    assert.equal(secondBundle.image.mimeType, 'image/jpeg');
    assert.equal(secondBundle.image.base64, secondImageBase64);
    assert.deepEqual(secondBundle.pins, []);
  });
});
