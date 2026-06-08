const fs = require('fs').promises;

const { getSeedFile }     = require('./appPaths');
const campaignStore       = require('./campaignStore');
const sessionStore        = require('./sessionStore');
const encounterStore      = require('./encounterStore');
const npcStore            = require('./npcStore');
const locationStore       = require('./locationStore');
const { generate: generateSessionMarkdown } = require('./markdownGenerator');
const { generate: generateEncounterMarkdown } = require('./encounterMarkdownGenerator');

const DEMO_CAMPAIGN_NAME = 'Demo Campaign';
const DEMO_CAMPAIGN_DESCRIPTION =
  'Sample sessions, NPCs, locations, and encounters that show what D&D Session Master can do. ' +
  'Delete it whenever you like — you can always bring it back from Manage Campaigns.';

async function readSeedRecords(filename, key, decorate) {
  try {
    const raw = await fs.readFile(getSeedFile(filename), 'utf8');
    const records = JSON.parse(raw)[key];
    return Array.isArray(records) ? records.map(decorate) : [];
  } catch {
    return [];
  }
}

// Creates the bundled "Demo Campaign" — a populated example campaign — and
// imports the seed sessions/encounters/NPCs/locations into it, tagged with
// its campaignId and isDemo. No-ops if a demo campaign already exists, so
// this is safe to call both at first launch and from "Generate Demo".
async function generateDemoCampaign({ activate = false } = {}) {
  const campaigns = await campaignStore.getAllCampaigns();
  if (campaigns.some(c => c.isDemo)) return { created: false };

  const campaign = await campaignStore.createCampaign({
    name: DEMO_CAMPAIGN_NAME,
    description: DEMO_CAMPAIGN_DESCRIPTION,
    isDemo: true,
  });

  const remap = r => ({ ...r, campaignId: campaign.id, isDemo: true });

  const [sessions, encounters, npcs, locations] = await Promise.all([
    readSeedRecords('seed.json', 'sessions', r => ({ ...remap(r), markdown: r.markdown || generateSessionMarkdown(r.data) })),
    readSeedRecords('encounters.seed.json', 'encounters', r => ({ ...remap(r), markdown: r.markdown || generateEncounterMarkdown(r.data) })),
    readSeedRecords('npcs.seed.json', 'npcs', remap),
    readSeedRecords('locations.seed.json', 'locations', remap),
  ]);

  const [importedSessions, importedEncounters, importedNpcs, importedLocations] = await Promise.all([
    sessionStore.importSessions(sessions),
    encounterStore.importEncounters(encounters),
    npcStore.importNpcs(npcs),
    locationStore.importLocations(locations),
  ]);

  if (activate) await campaignStore.setActiveCampaignId(campaign.id);

  return { created: true, campaign, importedSessions, importedEncounters, importedNpcs, importedLocations };
}

module.exports = { generateDemoCampaign };
