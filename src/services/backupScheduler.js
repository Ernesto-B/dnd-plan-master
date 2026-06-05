const backupStore = require('./backupStore');
const settingsStore = require('./settingsStore');

let timer = null;
let running = false;
let intervalHours = null;

function clearSchedule() {
  if (timer) clearInterval(timer);
  timer = null;
  intervalHours = null;
}

function normalizeHours(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 24;
  return Math.max(1, Math.min(168, Math.round(parsed)));
}

async function runScheduledBackup() {
  if (running) return;
  running = true;
  try {
    await backupStore.createBackup();
  } catch (err) {
    console.error('Scheduled backup failed:', err);
  } finally {
    running = false;
  }
}

async function maybeRunCatchup(hours) {
  const backups = await backupStore.listBackups();
  const latest = backups[0];
  if (!latest || !latest.createdAt) {
    await runScheduledBackup();
    return;
  }

  const latestTime = new Date(latest.createdAt).getTime();
  const cutoff = Date.now() - (hours * 60 * 60 * 1000);
  if (!Number.isFinite(latestTime) || latestTime < cutoff) {
    await runScheduledBackup();
  }
}

async function refreshSchedule() {
  clearSchedule();

  let settings;
  try {
    settings = await settingsStore.getSettings();
  } catch (err) {
    console.error('Could not load settings for backup scheduler:', err);
    return;
  }

  if (settings.scheduledBackupsEnabled !== true) return;

  intervalHours = normalizeHours(settings.scheduledBackupIntervalHours);
  await maybeRunCatchup(intervalHours);
  timer = setInterval(runScheduledBackup, intervalHours * 60 * 60 * 1000);
}

async function start() {
  await refreshSchedule();
}

function stop() {
  clearSchedule();
}

module.exports = {
  start,
  stop,
  refreshSchedule,
};
