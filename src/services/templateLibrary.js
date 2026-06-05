const settingsStore = require('./settingsStore');

const TEMPLATE_TYPES = {
  npcs: true,
  locations: true,
  factionClocks: true,
  encounterPlans: true,
};

function ensureType(type) {
  if (!TEMPLATE_TYPES[type]) {
    throw new Error(`Unsupported template type: ${type}`);
  }
}

function templateId() {
  return `tpl-${Math.random().toString(36).slice(2, 10)}`;
}

async function getTemplates() {
  const settings = await settingsStore.getSettings();
  return settings.templates;
}

async function saveTemplate(type, name, data) {
  ensureType(type);
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    throw new Error('Template name is required');
  }
  const settings = await settingsStore.getSettings();
  const templates = { ...settings.templates };
  const list = [...(templates[type] || [])];
  const now = new Date().toISOString();
  const template = {
    id: templateId(),
    name: trimmedName,
    data,
    createdAt: now,
    updatedAt: now,
  };
  list.push(template);
  templates[type] = list;
  await settingsStore.saveSettings({ templates });
  return template;
}

async function deleteTemplate(type, id) {
  ensureType(type);
  const settings = await settingsStore.getSettings();
  const templates = { ...settings.templates };
  const before = (templates[type] || []).length;
  templates[type] = (templates[type] || []).filter(template => template.id !== id);
  if (templates[type].length === before) {
    throw new Error(`Template ${id} not found`);
  }
  await settingsStore.saveSettings({ templates });
}

module.exports = {
  getTemplates,
  saveTemplate,
  deleteTemplate,
};
