const ACTIVE = 'active';
const DRAFT = 'draft';
const ARCHIVED = 'archived';
const TRASHED = 'trashed';
const DRAFT_TAG = 'Draft';

const VALID_STATUSES = new Set([ACTIVE, DRAFT, ARCHIVED, TRASHED]);

function normalizeStatus(status) {
  return VALID_STATUSES.has(status) ? status : ACTIVE;
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return record;
  return {
    ...record,
    status: normalizeStatus(record.status),
  };
}

function isActive(record) {
  return normalizeStatus(record?.status) === ACTIVE;
}

function isDraft(record) {
  return normalizeStatus(record?.status) === DRAFT;
}

function isLive(record) {
  const status = normalizeStatus(record?.status);
  return status === ACTIVE || status === DRAFT;
}

function matchesStatus(record, statuses = [ACTIVE]) {
  const allowed = new Set((Array.isArray(statuses) ? statuses : [statuses]).map(normalizeStatus));
  return allowed.has(normalizeStatus(record?.status));
}

function normalizeTagsForStatus(tags, status) {
  const cleaned = [...new Set((Array.isArray(tags) ? tags : [])
    .map(tag => String(tag || '').trim())
    .filter(Boolean))];
  const withoutDraft = cleaned.filter(tag => tag.toLowerCase() !== DRAFT_TAG.toLowerCase());
  return normalizeStatus(status) === DRAFT
    ? [DRAFT_TAG, ...withoutDraft]
    : withoutDraft;
}

function setStatus(record, status) {
  const nextStatus = normalizeStatus(status);
  const next = normalizeRecord(record);
  const stamp = new Date().toISOString();
  const currentStatus = normalizeStatus(next.status);
  let resolvedStatus = nextStatus;

  if (nextStatus === ACTIVE || nextStatus === DRAFT) {
    delete next.archivedAt;
    delete next.trashedAt;
    if (currentStatus === ARCHIVED || currentStatus === TRASHED) {
      resolvedStatus = normalizeStatus(next.restorableStatus) === DRAFT ? DRAFT : nextStatus;
    }
    delete next.restorableStatus;
  } else if (nextStatus === ARCHIVED) {
    if (currentStatus === ACTIVE || currentStatus === DRAFT) next.restorableStatus = currentStatus;
    next.archivedAt = next.archivedAt || stamp;
    delete next.trashedAt;
  } else if (nextStatus === TRASHED) {
    if (currentStatus === ACTIVE || currentStatus === DRAFT) next.restorableStatus = currentStatus;
    next.trashedAt = next.trashedAt || stamp;
  }

  next.status = resolvedStatus;
  next.tags = normalizeTagsForStatus(next.tags, next.status);
  return next;
}

module.exports = {
  ACTIVE,
  DRAFT,
  ARCHIVED,
  TRASHED,
  DRAFT_TAG,
  normalizeStatus,
  normalizeRecord,
  isActive,
  isDraft,
  isLive,
  matchesStatus,
  normalizeTagsForStatus,
  setStatus,
};
