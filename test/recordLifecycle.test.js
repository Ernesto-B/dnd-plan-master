const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ACTIVE,
  DRAFT,
  ARCHIVED,
  TRASHED,
  normalizeTagsForStatus,
  setStatus,
  matchesStatus,
} = require('../src/services/recordLifecycle.js');

test('normalizeTagsForStatus keeps draft state explicit and removes duplicates', () => {
  assert.deepEqual(
    normalizeTagsForStatus([' clue ', 'Draft', 'clue', '', 'Draft'], DRAFT),
    ['Draft', 'clue'],
  );

  assert.deepEqual(
    normalizeTagsForStatus(['Draft', 'clue', 'clue'], ACTIVE),
    ['clue'],
  );
});

test('setStatus preserves restorable draft records through archive and restore', () => {
  const archived = setStatus(
    { status: DRAFT, tags: ['Draft', 'urgent'] },
    ARCHIVED,
  );

  assert.equal(archived.status, ARCHIVED);
  assert.equal(archived.restorableStatus, DRAFT);
  assert.ok(archived.archivedAt);
  assert.deepEqual(archived.tags, ['urgent']);

  const restored = setStatus(archived, ACTIVE);
  assert.equal(restored.status, DRAFT);
  assert.ok(!('archivedAt' in restored));
  assert.ok(!('restorableStatus' in restored));
  assert.deepEqual(restored.tags, ['Draft', 'urgent']);
});

test('setStatus restores trashed active records to active and matches status filters', () => {
  const trashed = setStatus(
    { status: ACTIVE, tags: ['urgent'] },
    TRASHED,
  );

  assert.equal(trashed.status, TRASHED);
  assert.equal(trashed.restorableStatus, ACTIVE);
  assert.ok(matchesStatus(trashed, [TRASHED]));
  assert.ok(!matchesStatus(trashed, [ACTIVE, DRAFT]));

  const restored = setStatus(trashed, ACTIVE);
  assert.equal(restored.status, ACTIVE);
  assert.ok(!('trashedAt' in restored));
  assert.deepEqual(restored.tags, ['urgent']);
});
