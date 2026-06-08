const ACTIVE = 'active';
const ARCHIVED = 'archived';
const TRASHED = 'trashed';

const VALID_STATUSES = new Set([ACTIVE, ARCHIVED, TRASHED]);

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

function matchesStatus(record, statuses = [ACTIVE]) {
  const allowed = new Set((Array.isArray(statuses) ? statuses : [statuses]).map(normalizeStatus));
  return allowed.has(normalizeStatus(record?.status));
}

function setStatus(record, status) {
  const nextStatus = normalizeStatus(status);
  const next = normalizeRecord(record);
  const stamp = new Date().toISOString();

  if (nextStatus === ACTIVE) {
    delete next.archivedAt;
    delete next.trashedAt;
  } else if (nextStatus === ARCHIVED) {
    next.archivedAt = next.archivedAt || stamp;
    delete next.trashedAt;
  } else if (nextStatus === TRASHED) {
    next.trashedAt = next.trashedAt || stamp;
  }

  next.status = nextStatus;
  return next;
}

module.exports = {
  ACTIVE,
  ARCHIVED,
  TRASHED,
  normalizeStatus,
  normalizeRecord,
  isActive,
  matchesStatus,
  setStatus,
};
