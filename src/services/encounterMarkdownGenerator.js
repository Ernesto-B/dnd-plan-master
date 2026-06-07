function safe(str) {
  return String(str == null ? '' : str).trim();
}

function generate(data) {
  const lines = [];

  lines.push(`# Encounter Plan: ${safe(data.name) || 'Unnamed Encounter'}`);
  lines.push('');
  if (data.sessionId) {
    lines.push(`**Linked Session:** ${safe(data.sessionId)}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');

  // Fiction & Outcome
  lines.push('## Fiction & Outcome');
  lines.push('');
  if (data.fiction) {
    lines.push(`> ${safe(data.fiction)}`);
    lines.push('');
  }
  if (data.winCondition) {
    lines.push(`**Win Condition:** ${safe(data.winCondition)}`);
    lines.push('');
  }
  if (data.interestingFailure) {
    lines.push(`**Interesting Failure:** ${safe(data.interestingFailure)}`);
    lines.push('');
  }

  // Secondary Objective
  const obj = data.secondaryObjective || {};
  if (obj.description || obj.consequence) {
    lines.push('## Secondary Objective');
    lines.push('');
    if (obj.description) { lines.push(safe(obj.description)); lines.push(''); }
    const round = safe(obj.round);
    const init  = safe(obj.initiative);
    if (round || init) {
      lines.push(`**Countdown:** Resolves on Round ${round || '?'}, Initiative Count ${init || '?'}`);
      lines.push('');
    }
    if (obj.consequence) {
      lines.push(`**Consequence if ignored:** ${safe(obj.consequence)}`);
      lines.push('');
    }
  }

  // Environment
  const env = data.environment || {};
  if (env.layer1 || env.layer2trigger || env.layer2ongoing || env.layer3) {
    lines.push('## Environment');
    lines.push('');
    if (env.layer1) {
      lines.push('### Layer 1 — Terrain Decisions');
      lines.push('');
      lines.push(safe(env.layer1));
      lines.push('');
    }
    if (env.layer2trigger || env.layer2ongoing) {
      lines.push('### Layer 2 — Environmental Threat');
      lines.push('');
      if (env.layer2trigger) {
        lines.push(`**Triggers:** End of round ${safe(env.layer2trigger)}`);
        lines.push('');
      }
      if (env.layer2ongoing) {
        lines.push(`**Ongoing:** ${safe(env.layer2ongoing)}`);
        lines.push('');
      }
    }
    if (env.layer3) {
      lines.push('### Layer 3 — For Non-Damage Dealers');
      lines.push('');
      lines.push(safe(env.layer3));
      lines.push('');
    }
  }

  // Enemies
  const enemies = (data.enemies || []).filter(e => e.name);
  if (enemies.length > 0) {
    lines.push('## Enemies');
    lines.push('');
    enemies.forEach(enemy => {
      const label = enemy.isPuzzle ? ' — Puzzle Enemy' : '';
      lines.push(`### ${safe(enemy.name)}${label}`);
      lines.push('');
      if (enemy.role) { lines.push(`**Role:** ${safe(enemy.role)}`); lines.push(''); }
      if (enemy.isPuzzle) {
        if (enemy.pressure) { lines.push(`**Mechanical Pressure:** ${safe(enemy.pressure)}`); lines.push(''); }
        if (enemy.key)      { lines.push(`**The Key:** ${safe(enemy.key)}`); lines.push(''); }
        const fl = enemy.frontload || {};
        const flItems = [];
        if (fl.lore && fl.lore.enabled)           flItems.push(`**Lore:** DC ${fl.lore.dc || '?'} ${fl.lore.skill || ''} — ${safe(fl.lore.info)}`);
        if (fl.visual && fl.visual.enabled && fl.visual.description) flItems.push(`**Visual Tell:** ${safe(fl.visual.description)}`);
        if (fl.behaviour && fl.behaviour.enabled && fl.behaviour.description) flItems.push(`**Behaviour Signal:** ${safe(fl.behaviour.description)}`);
        if (fl.initiative && fl.initiative.enabled && fl.initiative.description) flItems.push(`**Initiative Reward:** ${safe(fl.initiative.description)}`);
        if (flItems.length) {
          lines.push('**Front-Loading:**');
          lines.push('');
          flItems.forEach(i => lines.push(`- ${i}`));
          lines.push('');
        }
      }
    });
  }

  // Natural Tasks
  const tasks = (data.naturalTasks || []).filter(t => t.name || t.task);
  if (tasks.length > 0) {
    lines.push('## Natural Tasks Per Player');
    lines.push('');
    lines.push('| Player | Class | Natural Task | Ability / Feature |');
    lines.push('|--------|-------|-------------|-------------------|');
    tasks.forEach(t => {
      const url = safe(t.characterUrl);
      const nameCell = url ? `[${safe(t.name)}](${url})` : safe(t.name);
      lines.push(`| ${nameCell} | ${safe(t.playerClass)} | ${safe(t.task)} | ${safe(t.ability)} |`);
    });
    lines.push('');
  }

  // Design Checklist
  const chk = data.checklist || {};
  const checkItems = [
    [chk.situationComplexity, 'Difficulty from situation complexity, not capability degradation'],
    [chk.noProne,             'No prone from environmental effects (positional threat with warning instead)'],
    [chk.noHighAC,            'No enemy with AC 18+ as the sole difficulty mechanic'],
    [chk.everyoneHasTask,     'Every player has something meaningful to do on every turn'],
    [chk.discoverableRound1,  'Key mechanic is discoverable within round 1'],
    [chk.nonViolentPath,      'At least one non-violent solution path exists'],
  ];
  if (Object.values(chk).some(v => v !== undefined)) {
    lines.push('## Design Checklist');
    lines.push('');
    checkItems.forEach(([val, label]) => lines.push(`- [${val ? 'x' : ' '}] ${label}`));
    lines.push('');
  }

  // Combat Notes
  if (data.notes && safe(data.notes)) {
    lines.push('## Combat Notes');
    lines.push('');
    lines.push(safe(data.notes));
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`*Generated by D&D Session Master — ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*`);

  return lines.join('\n');
}

module.exports = { generate };
