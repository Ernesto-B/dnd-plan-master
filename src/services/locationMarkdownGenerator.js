function generalSection(loc) {
  const rows = [
    ['Government', loc.government],
    ['Population Size', loc.populationSize],
    ['Population Diversity', loc.populationDiversity],
    ['Languages', loc.languages],
    ['Resources', loc.resources],
    ['Fun Fact', loc.funFact],
  ].filter(([, value]) => String(value || '').trim());
  if (!rows.length) return '';
  return ['## General', '', ...rows.map(([label, value]) => `**${label}:** ${String(value).trim()}`)].join('\n');
}

function districtSection(districts) {
  if (!Array.isArray(districts) || !districts.length) return '';
  const blocks = districts
    .filter(d => d.name || d.readAloud || (d.pointsOfInterest && d.pointsOfInterest.length))
    .map(d => {
      const lines = [`### ${String(d.name || 'Unnamed District').trim()}`];
      if (d.readAloud) lines.push(`\n${String(d.readAloud).trim()}`);
      const pois = (d.pointsOfInterest || []).filter(p => p.name || p.description);
      if (pois.length) {
        lines.push('', ...pois.map(p => `- **${String(p.name || 'Unnamed').trim()}** — ${String(p.description || '').trim()}`));
      }
      return lines.join('\n');
    });
  if (!blocks.length) return '';
  return ['## Districts', '', ...blocks].join('\n\n');
}

function generate(location) {
  const sections = [
    `# ${String(location.name || 'Unnamed Location').trim()}`,
  ];

  if (Array.isArray(location.tags) && location.tags.length) sections.push(`**Tags:** ${location.tags.join(', ')}`);

  const general = generalSection(location);
  if (general) sections.push(general);

  if (location.description) sections.push(`## Description\n\n${String(location.description).trim()}`);
  if (location.sensoryDetail) sections.push(`## Sensory Detail\n\n${String(location.sensoryDetail).trim()}`);
  if (location.hiddenDetail) sections.push(`## Hidden Detail\n\n${String(location.hiddenDetail).trim()}`);

  const districts = districtSection(location.districts);
  if (districts) sections.push(districts);

  if (location.onTheHorizon) sections.push(`## On the Horizon\n\n${String(location.onTheHorizon).trim()}`);

  return sections.filter(Boolean).join('\n\n').trim() + '\n';
}

module.exports = {
  generate,
};
