const assert = require('node:assert/strict');
const test = require('node:test');

const { withIsolatedDataDir } = require('../test-support/service-test-context.js');

function getRouteHandler(router, method, path) {
  const layer = router.stack.find(entry => entry.route
    && entry.route.path === path
    && entry.route.methods[method.toLowerCase()]);

  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

async function invokeRoute(router, method, path, { params = {}, body = {}, query = {} } = {}) {
  const handler = getRouteHandler(router, method, path);
  const req = { method: method.toUpperCase(), params, body, query, headers: {} };
  const response = { statusCode: 200, body: undefined };

  const res = {
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(payload) {
      response.body = payload;
      return this;
    },
  };

  await handler(req, res, (err) => {
    if (err) throw err;
  });

  return response;
}

test('graph view routes support create, update, list, and delete', async () => {
  await withIsolatedDataDir(async ({ requireProject }) => {
    const campaignStore = requireProject('src/services/campaignStore.js');
    const campaignsRouter = requireProject('src/routes/campaigns.js');

    await campaignStore.init();
    const campaignId = 'c-default';

    const create = await invokeRoute(campaignsRouter, 'post', '/:id/graph-views', {
      params: { id: campaignId },
      body: {
        name: 'Main Story Threads',
        filters: ['session', 'npc'],
        positions: { 'session:s-1': { x: 100, y: 220 } },
        viewport: { scale: 0.9, ox: 120, oy: 80 },
      },
    });

    assert.equal(create.statusCode, 201);
    assert.match(create.body.id, /^gv-[a-z0-9]{6}$/);
    assert.equal(create.body.name, 'Main Story Threads');
    assert.deepEqual(create.body.filters, ['session', 'npc']);
    assert.deepEqual(create.body.positions, { 'session:s-1': { x: 100, y: 220 } });
    assert.deepEqual(create.body.viewport, { scale: 0.9, ox: 120, oy: 80 });
    assert.deepEqual(create.body.groups, []);

    const listAfterCreate = await invokeRoute(campaignsRouter, 'get', '/:id/graph-views', {
      params: { id: campaignId },
    });
    assert.equal(listAfterCreate.statusCode, 200);
    assert.equal(listAfterCreate.body.length, 1);
    assert.equal(listAfterCreate.body[0].id, create.body.id);

    const update = await invokeRoute(campaignsRouter, 'put', '/:id/graph-views/:viewId', {
      params: { id: campaignId, viewId: create.body.id },
      body: {
        name: 'Act 1 Focus',
        filters: ['session', 'faction'],
        positions: { 'faction:f-1': { x: 420, y: 180 } },
        viewport: { scale: 1.25, ox: 40, oy: 32 },
        groups: [{ id: 'grp-1', label: 'Act 1', x: 10, y: 20, w: 400, h: 240, colorIdx: 1 }],
      },
    });

    assert.equal(update.statusCode, 200);
    assert.equal(update.body.name, 'Act 1 Focus');
    assert.deepEqual(update.body.filters, ['session', 'faction']);
    assert.deepEqual(update.body.positions, { 'faction:f-1': { x: 420, y: 180 } });
    assert.deepEqual(update.body.viewport, { scale: 1.25, ox: 40, oy: 32 });
    assert.equal(update.body.groups.length, 1);
    assert.ok(update.body.updatedAt);

    const destroy = await invokeRoute(campaignsRouter, 'delete', '/:id/graph-views/:viewId', {
      params: { id: campaignId, viewId: create.body.id },
    });
    assert.equal(destroy.statusCode, 200);
    assert.deepEqual(destroy.body, { success: true });

    const listAfterDelete = await invokeRoute(campaignsRouter, 'get', '/:id/graph-views', {
      params: { id: campaignId },
    });
    assert.equal(listAfterDelete.statusCode, 200);
    assert.deepEqual(listAfterDelete.body, []);
  });
});

test('deleting a campaign cascades owned records, map data, and graph views', async () => {
  await withIsolatedDataDir(async ({ requireProject }) => {
    const campaignStore = requireProject('src/services/campaignStore.js');
    const sessionStore = requireProject('src/services/sessionStore.js');
    const encounterStore = requireProject('src/services/encounterStore.js');
    const npcStore = requireProject('src/services/npcStore.js');
    const locationStore = requireProject('src/services/locationStore.js');
    const factionStore = requireProject('src/services/factionStore.js');
    const mapStore = requireProject('src/services/mapStore.js');
    const graphViewStore = requireProject('src/services/graphViewStore.js');
    const campaignsRouter = requireProject('src/routes/campaigns.js');

    await campaignStore.init();
    const target = await campaignStore.createCampaign({ name: 'Shadow War' });
    await campaignStore.setActiveCampaignId(target.id);

    await sessionStore.replaceAllFull([
      {
        id: 's-default',
        campaignId: 'c-default',
        sessionNumber: 1,
        goal: 'Default campaign session',
        createdAt: '2026-01-01T00:00:00.000Z',
        tags: [],
        data: { id: 's-default', campaignId: 'c-default', sessionGoal: 'Default campaign session', tags: [] },
      },
      {
        id: 's-target',
        campaignId: target.id,
        sessionNumber: 2,
        goal: 'Target campaign session',
        createdAt: '2026-01-02T00:00:00.000Z',
        tags: [],
        data: { id: 's-target', campaignId: target.id, sessionGoal: 'Target campaign session', tags: [] },
      },
    ]);

    await encounterStore.replaceAllFull([
      {
        id: 'e-target',
        campaignId: target.id,
        name: 'Bridge Ambush',
        sessionId: 's-target',
        createdAt: '2026-01-02T00:00:00.000Z',
        tags: [],
        data: { id: 'e-target', campaignId: target.id, name: 'Bridge Ambush', sessionId: 's-target', tags: [] },
      },
    ]);

    await npcStore.replaceAllFull([
      {
        id: 'n-target',
        campaignId: target.id,
        name: 'Scout',
        linkedSessions: ['s-target'],
        linkedEncounters: ['e-target'],
        createdAt: '2026-01-02T00:00:00.000Z',
        tags: [],
      },
    ]);

    await locationStore.replaceAllFull([
      {
        id: 'l-target',
        campaignId: target.id,
        name: 'Harbor',
        linkedSessions: ['s-target'],
        createdAt: '2026-01-02T00:00:00.000Z',
        tags: [],
      },
    ]);

    await factionStore.replaceAllFull([
      {
        id: 'f-target',
        campaignId: target.id,
        name: 'Guild',
        linkedSessions: ['s-target'],
        linkedEncounters: ['e-target'],
        linkedNpcs: ['n-target'],
        linkedLocations: ['l-target'],
        createdAt: '2026-01-02T00:00:00.000Z',
        tags: [],
      },
    ]);

    await mapStore.saveMap(target.id, {
      imageFilename: 'map-shadow-war.png',
      pins: [{ id: 'pin-1', label: 'Harbor', x: 10, y: 20 }],
    });

    await graphViewStore.createView(target.id, {
      name: 'Target View',
      filters: ['session'],
      positions: { 'session:s-target': { x: 100, y: 100 } },
      viewport: { scale: 1, ox: 0, oy: 0 },
      groups: [],
    });

    const destroy = await invokeRoute(campaignsRouter, 'delete', '/:id', {
      params: { id: target.id },
    });
    assert.equal(destroy.statusCode, 200);
    assert.deepEqual(destroy.body, { success: true });

    assert.equal(await campaignStore.getCampaign(target.id), null);
    assert.equal(await campaignStore.getActiveCampaignId(), 'c-default');
    assert.deepEqual((await sessionStore.getAllFull()).map(record => record.id), ['s-default']);
    assert.deepEqual(await encounterStore.getAllFull(), []);
    assert.deepEqual(await npcStore.getAllFull(), []);
    assert.deepEqual(await locationStore.getAllFull(), []);
    assert.deepEqual(await factionStore.getAllFull(), []);
    assert.equal(await mapStore.getMap(target.id), null);
    assert.deepEqual(await graphViewStore.getViewsForCampaign(target.id), []);
  });
});

test('patching session links keeps NPC and location back-links in sync', async () => {
  await withIsolatedDataDir(async ({ requireProject }) => {
    const campaignStore = requireProject('src/services/campaignStore.js');
    const sessionStore = requireProject('src/services/sessionStore.js');
    const npcStore = requireProject('src/services/npcStore.js');
    const locationStore = requireProject('src/services/locationStore.js');
    const sessionsRouter = requireProject('src/routes/sessions.js');

    await campaignStore.init();

    await sessionStore.replaceAllFull([
      {
        id: 's-1',
        campaignId: 'c-default',
        sessionNumber: 1,
        goal: 'Relink session',
        createdAt: '2026-01-01T00:00:00.000Z',
        tags: [],
        data: {
          id: 's-1',
          campaignId: 'c-default',
          sessionGoal: 'Relink session',
          linkedNpcs: ['n-old'],
          linkedLocations: ['l-old'],
          tags: [],
        },
      },
    ]);

    await npcStore.replaceAllFull([
      {
        id: 'n-old',
        campaignId: 'c-default',
        name: 'Former Ally',
        linkedSessions: ['s-1'],
        linkedEncounters: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        tags: [],
      },
      {
        id: 'n-new',
        campaignId: 'c-default',
        name: 'New Ally',
        linkedSessions: [],
        linkedEncounters: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        tags: [],
      },
    ]);

    await locationStore.replaceAllFull([
      {
        id: 'l-old',
        campaignId: 'c-default',
        name: 'Old Hideout',
        linkedSessions: ['s-1'],
        createdAt: '2026-01-01T00:00:00.000Z',
        tags: [],
      },
      {
        id: 'l-new',
        campaignId: 'c-default',
        name: 'New Hideout',
        linkedSessions: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        tags: [],
      },
    ]);

    const patch = await invokeRoute(sessionsRouter, 'patch', '/:id/links', {
      params: { id: 's-1' },
      body: {
        linkedNpcs: ['n-new'],
        linkedLocations: ['l-new'],
      },
    });

    assert.equal(patch.statusCode, 200);
    assert.deepEqual(patch.body, { success: true });

    const session = await sessionStore.getSession('s-1');
    assert.deepEqual(session.data.linkedNpcs, ['n-new']);
    assert.deepEqual(session.data.linkedLocations, ['l-new']);

    const oldNpc = await npcStore.getNpc('n-old');
    const newNpc = await npcStore.getNpc('n-new');
    assert.deepEqual(oldNpc.linkedSessions, []);
    assert.deepEqual(newNpc.linkedSessions, ['s-1']);

    const oldLocation = await locationStore.getLocation('l-old');
    const newLocation = await locationStore.getLocation('l-new');
    assert.deepEqual(oldLocation.linkedSessions, []);
    assert.deepEqual(newLocation.linkedSessions, ['s-1']);
  });
});
