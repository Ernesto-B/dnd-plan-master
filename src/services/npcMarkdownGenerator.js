function bulletList(lines) {
  if (!Array.isArray(lines) || !lines.length) return '';
  return lines.map(line => `- ${line}`).join('\n');
}

function skillSection(skillDescriptions) {
  const entries = Object.entries(skillDescriptions || {}).filter(([, value]) => String(value || '').trim());
  if (!entries.length) return '';
  return [
    '## Skill Triggers',
    '',
    ...entries.map(([key, value]) => `### ${key}\n${String(value || '').trim()}`),
  ].join('\n\n');
}

function generate(npc) {
  const sections = [
    `# ${String(npc.name || 'Unnamed NPC').trim()}`,
  ];

  if (npc.nickname) sections.push(`*${String(npc.nickname).trim()}*`);
  if (Array.isArray(npc.tags) && npc.tags.length) sections.push(`**Tags:** ${npc.tags.join(', ')}`);
  if (npc.commonPhrase) sections.push(`> ${String(npc.commonPhrase).trim()}`);
  if (npc.appearance) sections.push(`## Appearance\n\n${String(npc.appearance).trim()}`);
  if (npc.situation) sections.push(`## Situation\n\n${String(npc.situation).trim()}`);
  if (npc.wantsNeeds) sections.push(`## Wants & Needs\n\n${String(npc.wantsNeeds).trim()}`);
  if (npc.secretObstacle) sections.push(`## Secret / Obstacle\n\n${String(npc.secretObstacle).trim()}`);

  const skills = skillSection(npc.skillDescriptions);
  if (skills) sections.push(skills);

  const carrying = bulletList(Array.isArray(npc.carrying) ? npc.carrying : []);
  if (carrying) sections.push(`## Carrying\n\n${carrying}`);

  return sections.filter(Boolean).join('\n\n').trim() + '\n';
}

module.exports = {
  generate,
};
