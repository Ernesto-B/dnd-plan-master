function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escNl(str) { return esc(str).replace(/\n/g, '<br>'); }
function safe(str) { return String(str == null ? '' : str).trim(); }

function renderChecklist(chk) {
  if (!chk) return '';
  const items = [
    [chk.situationComplexity, 'Difficulty from situation complexity, not capability degradation'],
    [chk.noProne,             'No prone from environmental effects'],
    [chk.noHighAC,            'No enemy with AC 18+ as sole difficulty'],
    [chk.everyoneHasTask,     'Every player has something meaningful to do each turn'],
    [chk.discoverableRound1,  'Key mechanic discoverable within round 1'],
    [chk.nonViolentPath,      'At least one non-violent solution path exists'],
  ];
  return `
    <div class="section">
      <div class="section-head">Design Checklist</div>
      <div class="checklist">
        ${items.map(([v, l]) => `<div class="check-item"><span class="check-box">${v ? '✓' : '○'}</span>${esc(l)}</div>`).join('')}
      </div>
    </div>`;
}

function renderNaturalTasks(tasks) {
  const valid = (tasks || []).filter(t => t.name || t.task);
  if (!valid.length) return '';
  return `
    <div class="section">
      <div class="section-head">Natural Tasks Per Player</div>
      <table class="tasks-table">
        <thead><tr><th>Player</th><th>Class</th><th>Natural Task</th><th>Ability / Feature</th></tr></thead>
        <tbody>
          ${valid.map(t => `<tr>
            <td><strong>${esc(t.name)}</strong></td>
            <td class="dim">${esc(t.playerClass)}</td>
            <td>${escNl(t.task)}</td>
            <td class="dim">${esc(t.ability)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderEnemies(enemies) {
  const valid = (enemies || []).filter(e => e.name);
  if (!valid.length) return '';
  return `
    <div class="section">
      <div class="section-head">Enemies</div>
      ${valid.map(enemy => {
        const fl = enemy.frontload || {};
        const flItems = [];
        if (fl.lore?.enabled)           flItems.push(`<span class="lbl">Lore:</span> DC ${esc(fl.lore.dc)} ${esc(fl.lore.skill)} — ${esc(fl.lore.info)}`);
        if (fl.visual?.enabled && fl.visual.description)    flItems.push(`<span class="lbl">Visual:</span> ${esc(fl.visual.description)}`);
        if (fl.behaviour?.enabled && fl.behaviour.description) flItems.push(`<span class="lbl">Behaviour:</span> ${esc(fl.behaviour.description)}`);
        if (fl.initiative?.enabled && fl.initiative.description) flItems.push(`<span class="lbl">Initiative:</span> ${esc(fl.initiative.description)}`);
        return `
          <div class="enemy-block">
            <div class="enemy-name">${esc(enemy.name)}${enemy.isPuzzle ? '<span class="puzzle-tag"> ◈ PUZZLE</span>' : ''}</div>
            ${enemy.role ? `<div><span class="lbl">Role:</span> ${escNl(enemy.role)}</div>` : ''}
            ${enemy.isPuzzle && enemy.pressure ? `<div><span class="lbl">Pressure:</span> ${escNl(enemy.pressure)}</div>` : ''}
            ${enemy.isPuzzle && enemy.key ? `<div><span class="lbl">The Key:</span> ${escNl(enemy.key)}</div>` : ''}
            ${flItems.length ? `<div class="front-load"><span class="lbl">Front-Loading:</span><ul>${flItems.map(i => `<li>${i}</li>`).join('')}</ul></div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

function render(data) {
  const obj = data.secondaryObjective || {};
  const env = data.environment || {};
  const chk = data.checklist || {};

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 8.5pt; color: #1a1208; background: #fff; line-height: 1.45; }
  .page { padding: 0; }

  .header { background: #1a0f04; color: #c9962a; padding: 10px 14px 8px; margin-bottom: 10px; }
  .header-label { font-size: 7pt; letter-spacing: 3px; text-transform: uppercase; color: #7a5c1a; margin-bottom: 2px; }
  .header-name { font-size: 16pt; font-weight: bold; letter-spacing: 1px; }
  .header-meta { font-size: 7pt; color: #7a5c1a; margin-top: 4px; }

  .body { padding: 0 14px; }

  .section { margin-bottom: 10px; }
  .section-head { font-size: 7pt; font-weight: bold; letter-spacing: 2.5px; text-transform: uppercase;
    color: #7a3a10; border-bottom: 1pt solid #c9962a; padding-bottom: 2px; margin-bottom: 6px; }

  .lbl { font-weight: bold; color: #7a3a10; }
  .dim { color: #5a4830; }

  .fiction-box { background: #faf6ee; border-left: 3pt solid #c9962a; padding: 6px 8px; margin-bottom: 8px;
    font-style: italic; font-size: 8pt; color: #3a2808; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .box { background: #faf6ee; border: 1pt solid #ddd0a8; padding: 6px 8px; border-radius: 2px; }
  .box-head { font-size: 7pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px;
    color: #7a3a10; margin-bottom: 4px; }

  .obj-box { background: #fff8e8; border: 1.5pt solid #c9962a; padding: 7px 9px; margin-bottom: 10px; border-radius: 2px; }
  .obj-countdown { font-size: 7pt; font-weight: bold; color: #7a1515; margin-top: 4px; letter-spacing: 0.5px; }

  .env-layer { margin-bottom: 6px; padding: 5px 7px; background: #f8f5ee; border-left: 2pt solid #c9962a; }
  .env-layer-head { font-size: 7pt; font-weight: bold; color: #7a3a10; margin-bottom: 2px; }

  .enemy-block { border: 1pt solid #ddd0a8; padding: 6px 8px; margin-bottom: 6px; border-radius: 2px; }
  .enemy-name { font-weight: bold; font-size: 9pt; color: #1a0f04; margin-bottom: 3px; }
  .enemy-name .puzzle-tag { font-size: 6.5pt; font-weight: bold; color: #7a1515; letter-spacing: 1px;
    background: #ffe8e8; padding: 0 3px; border-radius: 1px; margin-left: 4px; vertical-align: middle; }
  .front-load { margin-top: 4px; }
  .front-load ul { padding-left: 12px; margin-top: 2px; }
  .front-load li { margin-bottom: 1px; }

  .tasks-table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  .tasks-table th { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 1px; color: #7a3a10;
    background: #faf6ee; border-bottom: 1pt solid #c9962a; padding: 3px 6px; text-align: left; }
  .tasks-table td { padding: 3px 6px; border-bottom: 0.5pt solid #e8e0cc; vertical-align: top; }
  .tasks-table tr:nth-child(even) td { background: #faf8f2; }

  .checklist { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 10px; }
  .check-item { font-size: 7.5pt; display: flex; align-items: flex-start; gap: 4px; padding: 1px 0; }
  .check-box { font-weight: bold; color: #2d6a2d; flex-shrink: 0; width: 12px; }

  .notes-box { background: #faf6ee; border: 1pt dashed #c9962a; padding: 7px 9px; white-space: pre-wrap;
    font-size: 8pt; color: #3a2808; }

  .footer { text-align: center; font-size: 6.5pt; color: #9a8060; border-top: 1pt solid #ddd0a8;
    margin-top: 12px; padding-top: 4px; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-label">⚔ Combat Encounter Plan</div>
    <div class="header-name">${esc(data.name) || 'Unnamed Encounter'}</div>
    ${data.sessionId ? `<div class="header-meta">Session: ${esc(data.sessionId)}</div>` : ''}
  </div>

  <div class="body">

    ${data.fiction ? `
    <div class="section">
      <div class="section-head">Fiction</div>
      <div class="fiction-box">${escNl(data.fiction)}</div>
    </div>` : ''}

    ${(data.winCondition || data.interestingFailure) ? `
    <div class="two-col">
      ${data.winCondition ? `<div class="box"><div class="box-head">✓ Win Condition</div>${escNl(data.winCondition)}</div>` : '<div></div>'}
      ${data.interestingFailure ? `<div class="box"><div class="box-head">↻ Interesting Failure</div>${escNl(data.interestingFailure)}</div>` : '<div></div>'}
    </div>` : ''}

    ${(obj.description || obj.consequence) ? `
    <div class="section">
      <div class="section-head">Secondary Objective</div>
      <div class="obj-box">
        ${obj.description ? `<div>${escNl(obj.description)}</div>` : ''}
        ${(obj.round || obj.initiative) ? `<div class="obj-countdown">⏱ Resolves Round ${esc(obj.round) || '?'}, Initiative ${esc(obj.initiative) || '?'}</div>` : ''}
        ${obj.consequence ? `<div style="margin-top:3px"><span class="lbl">If ignored:</span> ${escNl(obj.consequence)}</div>` : ''}
      </div>
    </div>` : ''}

    ${(env.layer1 || env.layer2trigger || env.layer2ongoing || env.layer3) ? `
    <div class="section">
      <div class="section-head">Environment</div>
      ${env.layer1 ? `<div class="env-layer"><div class="env-layer-head">Layer 1 — Terrain Decisions</div>${escNl(env.layer1)}</div>` : ''}
      ${(env.layer2trigger || env.layer2ongoing) ? `
      <div class="env-layer">
        <div class="env-layer-head">Layer 2 — Environmental Threat${env.layer2trigger ? ` · Triggers end of round ${esc(env.layer2trigger)}` : ''}</div>
        ${env.layer2ongoing ? escNl(env.layer2ongoing) : ''}
      </div>` : ''}
      ${env.layer3 ? `<div class="env-layer"><div class="env-layer-head">Layer 3 — For Non-Damage Dealers</div>${escNl(env.layer3)}</div>` : ''}
    </div>` : ''}

    ${renderEnemies(data.enemies)}

    ${renderNaturalTasks(data.naturalTasks)}

    ${renderChecklist(data.checklist)}

    ${data.notes ? `
    <div class="section">
      <div class="section-head">Combat Notes</div>
      <div class="notes-box">${esc(data.notes)}</div>
    </div>` : ''}

    <div class="footer">D&amp;D Session Master · Encounter Plan · ${esc(data.name) || ''}</div>
  </div>
</div>
</body>
</html>`;
}

module.exports = { render };
