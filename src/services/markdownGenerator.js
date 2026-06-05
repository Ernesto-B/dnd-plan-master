function pad(n) {
  return String(n).padStart(3, '0');
}

function safe(str) {
  return String(str == null ? '' : str).trim();
}

function generate(data) {
  const num = pad(data.sessionNumber || 0);
  const lines = [];

  lines.push(`# Session ${num} — ${safe(data.date) || 'Unknown Date'}`);
  lines.push('');
  lines.push(`**Party Level:** ${safe(data.partyLevel) || '?'}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Goal & Hook
  lines.push('## Session Goal & Opening Hook');
  lines.push('');
  if (data.sessionGoal) {
    lines.push(`**Goal:** ${safe(data.sessionGoal)}`);
    lines.push('');
  }
  if (data.endState) {
    lines.push(`**End State:** ${safe(data.endState)}`);
    lines.push('');
  }
  if (data.openingReadAloud) {
    lines.push('### Opening Read-Aloud');
    lines.push('');
    lines.push(`> ${safe(data.openingReadAloud).replace(/\n/g, '\n> ')}`);
    lines.push('');
  }
  if (data.threeOptionsPrompt) {
    lines.push(`**Three-Options Prompt:** ${safe(data.threeOptionsPrompt)}`);
    lines.push('');
  }

  // Session Beats
  lines.push('## Session Beats');
  lines.push('');
  lines.push('| Block | Time | Notes |');
  lines.push('|-------|------|-------|');
  lines.push(`| **Open** | 0–20 min | ${safe(data.beatOpen).replace(/\n/g, ' ')} |`);
  lines.push(`| **Middle** | 20–70 min | ${safe(data.beatMiddle).replace(/\n/g, ' ')} |`);
  lines.push(`| **Escalate** | 70–100 min | ${safe(data.beatEscalate).replace(/\n/g, ' ')} |`);
  lines.push(`| **Close** | 100–120 min | ${safe(data.beatClose).replace(/\n/g, ' ')} |`);
  lines.push('');

  // NPCs
  const npcs = (data.npcs || []).filter(n => n.name);
  if (npcs.length > 0) {
    lines.push('## NPCs');
    lines.push('');
    npcs.forEach(npc => {
      lines.push(`### ${npc.name}${npc.faction ? ` *(${npc.faction})*` : ''}`);
      lines.push('');
      if (npc.situation)    { lines.push(`**Situation:** ${safe(npc.situation)}`);           lines.push(''); }
      if (npc.wants)        { lines.push(`**Wants:** ${safe(npc.wants)}`);                   lines.push(''); }
      if (npc.phrases)      { lines.push(`**Signature Phrases:** ${safe(npc.phrases)}`);     lines.push(''); }
      if (npc.bodyLanguage) { lines.push(`**Body Language:** ${safe(npc.bodyLanguage)}`);    lines.push(''); }
      if (npc.neverDoes)    { lines.push(`**Never Does:** ${safe(npc.neverDoes)}`);          lines.push(''); }
      if (npc.corneredLine) { lines.push(`**If Cornered:** *"${safe(npc.corneredLine)}"*`);  lines.push(''); }
    });
  }

  // Locations (with districts + POIs)
  const locations = (data.locations || []).filter(l => l.name);
  if (locations.length > 0) {
    lines.push('## Locations');
    lines.push('');
    locations.forEach(loc => {
      lines.push(`### ${loc.name}`);
      lines.push('');
      if (loc.description)   lines.push(safe(loc.description));
      if (loc.sensoryDetail) lines.push(`**Sensory Detail:** ${safe(loc.sensoryDetail)}`);
      if (loc.hiddenDetail)  lines.push(`**Hidden/Secret:** ${safe(loc.hiddenDetail)}`);

      const districts = (loc.districts || []).filter(d => d.name || d.readAloud || (d.pointsOfInterest || []).length);
      if (districts.length > 0) {
        lines.push('');
        districts.forEach(district => {
          lines.push(`#### ${district.name || 'Unnamed District'}`);
          lines.push('');
          if (district.readAloud) {
            lines.push(`> ${safe(district.readAloud).replace(/\n/g, '\n> ')}`);
            lines.push('');
          }
          const pois = (district.pointsOfInterest || []).filter(p => p.name);
          if (pois.length > 0) {
            pois.forEach(poi => {
              lines.push(`- **${poi.name}**${poi.description ? `: ${safe(poi.description)}` : ''}`);
            });
            lines.push('');
          }
        });
      } else {
        lines.push('');
      }
    });
  }

  // Faction Clocks
  const clocks = (data.factionClocks || []).filter(c => c.factionName);
  if (clocks.length > 0) {
    lines.push('## Faction Clocks');
    lines.push('');
    clocks.forEach(clock => {
      const progress = parseInt(clock.progress) || 0;
      const max = parseInt(clock.max) || 8;
      const filled = '█'.repeat(progress);
      const empty  = '░'.repeat(Math.max(0, max - progress));
      lines.push(`### ${clock.factionName}`);
      lines.push('');
      if (clock.goal)       lines.push(`**Working Toward:** ${safe(clock.goal)}`);
      lines.push(`**Progress:** [${filled}${empty}] ${progress}/${max}`);
      if (clock.completion) lines.push(`**On Completion:** ${safe(clock.completion)}`);
      lines.push('');
    });
  }

  // Combat Encounters
  const encounters = (data.encounters || []).filter(e => e.name);
  if (encounters.length > 0) {
    lines.push('## Combat Encounters');
    lines.push('');
    encounters.forEach(enc => {
      lines.push(`### ${safe(enc.name)}`);
      lines.push('');
      if (enc.summary) {
        lines.push(safe(enc.summary));
        lines.push('');
      }
      if (enc.encounterPlanId) {
        lines.push(`*→ Full encounter plan: [${enc.encounterPlanId}](/encounter/view/${enc.encounterPlanId})*`);
        lines.push('');
      }
    });
  }

  // Session Notes
  if (data.sessionNotes && safe(data.sessionNotes)) {
    lines.push('## Session Notes');
    lines.push('');
    lines.push(safe(data.sessionNotes));
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`*Generated by D&D Session Master — ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*`);

  return lines.join('\n');
}

module.exports = { generate };
