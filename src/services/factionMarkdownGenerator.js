function bulletList(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map(item => `- ${item}`).join('\n');
}

function reputationLabel(value) {
  const labels = {
    '-3': 'Nemesis',
    '-2': 'Hostile',
    '-1': 'Cold',
    '0': 'Neutral',
    '1': 'Warm',
    '2': 'Trusted',
    '3': 'Allied',
  };
  return labels[String(value)] || '';
}

function clocksSection(clocks) {
  if (!Array.isArray(clocks) || !clocks.length) return '';
  const blocks = clocks.map((clock, index) => {
    const name = String(clock.name || `Clock ${index + 1}`).trim();
    const rows = [
      `### ${name}`,
      '',
      `**Steps:** ${clock.steps || 0}`,
      clock.advanceTrigger ? `**Advances When:** ${String(clock.advanceTrigger).trim()}` : '',
      clock.setbackTrigger ? `**Setbacks When:** ${String(clock.setbackTrigger).trim()}` : '',
      '',
      ...(clock.stepDescriptions || []).map((description, stepIndex) =>
        `#### Step ${stepIndex + 1}\n${String(description || '').trim() || '_No change noted._'}`
      ),
    ].filter(Boolean);
    return rows.join('\n');
  });
  return ['## Faction Clocks', '', ...blocks].join('\n\n');
}

function generate(faction) {
  const sections = [
    `# ${String(faction.name || 'Unnamed Faction').trim()}`,
  ];

  if (Array.isArray(faction.tags) && faction.tags.length) sections.push(`**Tags:** ${faction.tags.join(', ')}`);
  if (faction.origin) sections.push(`**Origin / Allegiance:** ${String(faction.origin).trim()}`);
  if (faction.goal) sections.push(`## Goal\n\n${String(faction.goal).trim()}`);

  const details = [
    faction.size !== '' && faction.size != null ? `**Size:** ${String(faction.size).trim()} members` : '',
    faction.partyReputation !== '' && faction.partyReputation != null
      ? `**Party Reputation:** ${String(faction.partyReputation).trim()}${reputationLabel(faction.partyReputation) ? ` (${reputationLabel(faction.partyReputation)})` : ''}`
      : '',
  ].filter(Boolean);
  if (details.length) sections.push(['## Snapshot', '', ...details].join('\n'));

  const sessionLinks = bulletList((faction.linkedSessions || []).map(id => `Session ${id}`));
  if (sessionLinks) sections.push(`## Linked Sessions\n\n${sessionLinks}`);

  const encounterLinks = bulletList((faction.linkedEncounters || []).map(id => `Encounter ${id}`));
  if (encounterLinks) sections.push(`## Linked Encounters\n\n${encounterLinks}`);

  const npcLinks = bulletList((faction.linkedNpcs || []).map(id => `NPC ${id}`));
  if (npcLinks) sections.push(`## Linked NPCs\n\n${npcLinks}`);

  const locationLinks = bulletList((faction.linkedLocations || []).map(id => `Location ${id}`));
  if (locationLinks) sections.push(`## Linked Locations\n\n${locationLinks}`);

  const clocks = clocksSection(faction.factionClocks);
  if (clocks) sections.push(clocks);

  return sections.filter(Boolean).join('\n\n').trim() + '\n';
}

module.exports = {
  generate,
};
