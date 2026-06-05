function pad(n) {
  return String(n).padStart(3, '0');
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escNl(str) {
  return esc(str).replace(/\n/g, '<br>');
}

function renderNPCs(npcs) {
  const valid = (npcs || []).filter(n => n.name);
  if (!valid.length) return '';
  return `
    <div class="section">
      <div class="section-head">NPCs</div>
      ${valid.map(npc => `
        <div class="npc-block">
          <div class="npc-name">${esc(npc.name)}${npc.faction ? `<span class="dim"> · ${esc(npc.faction)}</span>` : ''}</div>
          ${npc.situation    ? `<div><span class="lbl">Situation:</span> ${escNl(npc.situation)}</div>` : ''}
          ${npc.wants        ? `<div><span class="lbl">Wants:</span> ${escNl(npc.wants)}</div>` : ''}
          ${npc.phrases      ? `<div><span class="lbl">Says:</span> <em>${esc(npc.phrases)}</em></div>` : ''}
          ${npc.bodyLanguage ? `<div><span class="lbl">Body:</span> ${esc(npc.bodyLanguage)}</div>` : ''}
          ${npc.neverDoes    ? `<div><span class="lbl">Never:</span> ${esc(npc.neverDoes)}</div>` : ''}
          ${npc.corneredLine ? `<div class="cornered"><span class="lbl">Cornered:</span> &ldquo;${esc(npc.corneredLine)}&rdquo;</div>` : ''}
        </div>
      `).join('')}
    </div>`;
}

function renderPOIs(pois) {
  const valid = (pois || []).filter(p => p.name);
  if (!valid.length) return '';
  return `<ul class="poi-list">${valid.map(p =>
    `<li><strong>${esc(p.name)}</strong>${p.description ? `: ${esc(p.description)}` : ''}</li>`
  ).join('')}</ul>`;
}

function renderDistricts(districts) {
  const valid = (districts || []).filter(d => d.name || d.readAloud || (d.pointsOfInterest || []).length);
  if (!valid.length) return '';
  return `<div class="district-list">${valid.map(d => `
    <div class="district-item">
      ${d.name ? `<div class="district-item-name">${esc(d.name)}</div>` : ''}
      ${d.readAloud ? `<div class="district-read">${escNl(d.readAloud)}</div>` : ''}
      ${renderPOIs(d.pointsOfInterest)}
    </div>`).join('')}</div>`;
}

function renderLocations(locations) {
  const valid = (locations || []).filter(l => l.name);
  if (!valid.length) return '';
  return `
    <div class="section">
      <div class="section-head">Locations</div>
      ${valid.map(loc => `
        <div class="loc-block">
          <div class="npc-name">${esc(loc.name)}</div>
          ${loc.description   ? `<div>${escNl(loc.description)}</div>` : ''}
          ${loc.sensoryDetail ? `<div><span class="lbl">Sensory:</span> ${esc(loc.sensoryDetail)}</div>` : ''}
          ${loc.hiddenDetail  ? `<div class="secret"><span class="lbl">Secret:</span> ${esc(loc.hiddenDetail)}</div>` : ''}
          ${renderDistricts(loc.districts)}
        </div>
      `).join('')}
    </div>`;
}

function renderClocks(clocks) {
  const valid = (clocks || []).filter(c => c.factionName);
  if (!valid.length) return '';
  return `
    <div class="section">
      <div class="section-head">Faction Clocks</div>
      ${valid.map(clock => {
        const progress = Math.max(0, parseInt(clock.progress) || 0);
        const max      = Math.max(1, parseInt(clock.max) || 8);
        const pct      = Math.round((Math.min(progress, max) / max) * 100);
        return `
          <div class="clock-block">
            <div class="npc-name">${esc(clock.factionName)}</div>
            ${clock.goal ? `<div class="dim">${esc(clock.goal)}</div>` : ''}
            <div class="clock-track"><div class="clock-fill" style="width:${pct}%"></div></div>
            <div class="clock-label">${progress} / ${max} steps${clock.completion ? ` — <em>${esc(clock.completion)}</em>` : ''}</div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderEncounters(encounters) {
  const valid = (encounters || []).filter(e => e.name);
  if (!valid.length) return '';
  return `
    <div class="section">
      <div class="section-head">Combat Encounters</div>
      ${valid.map(enc => `
        <div class="enc-block">
          <div class="npc-name">${esc(enc.name)}</div>
          ${enc.summary ? `<div style="margin-top:3pt; color:#3a2a10;">${escNl(enc.summary)}</div>` : ''}
          ${enc.encounterPlanId ? `<div style="margin-top:4pt; font-size:7pt; color:#7a5c1a; font-style:italic;">Full encounter plan: ${esc(enc.encounterPlanId)}</div>` : ''}
        </div>
      `).join('')}
    </div>`;
}

function render(data) {
  const num = pad(data.sessionNumber || 0);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Arial', 'Helvetica Neue', sans-serif;
    font-size: 8.2pt;
    color: #1a1108;
    background: #fff;
    line-height: 1.28;
  }

  .page-header {
    background: #2b1400;
    color: #f0e8d8;
    padding: 5px 10px 4px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 7px;
  }
  .page-header h1 { font-size: 13pt; letter-spacing: 0.5px; }
  .page-header .meta { font-size: 8pt; opacity: 0.85; }

  .goal-bar {
    background: #fdf6e8;
    border-left: 3px solid #8b4513;
    padding: 4px 8px;
    margin-bottom: 7px;
    font-size: 8pt;
  }
  .goal-bar .goal-label { font-weight: bold; color: #5c2e00; }

  .opening-section { margin-bottom: 7px; }
  .section-head {
    font-size: 7pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #fff;
    background: #5c2e00;
    padding: 2px 6px;
    margin-bottom: 4px;
  }
  .hook-box {
    font-style: italic;
    font-family: 'Georgia', serif;
    background: #fdfaf3;
    border: 1px solid #d4b896;
    padding: 5px 8px;
    margin-bottom: 4px;
    font-size: 8.5pt;
    line-height: 1.4;
    color: #1a1108;
  }
  .three-opts {
    background: #f3ede0;
    border-left: 2px solid #8b4513;
    padding: 3px 7px;
    font-size: 7.8pt;
  }

  .two-col {
    display: flex;
    gap: 9px;
    align-items: flex-start;
  }
  .col-left  { flex: 0 0 54%; }
  .col-right { flex: 1; min-width: 0; }

  .section { margin-bottom: 7px; }
  .beats-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 7.8pt;
  }
  .beats-table th {
    background: #8b4513;
    color: #fff;
    padding: 2px 5px;
    text-align: left;
    font-size: 7pt;
    text-transform: uppercase;
  }
  .beats-table td {
    padding: 3px 5px;
    vertical-align: top;
    border-bottom: 1px solid #e5ddd0;
  }
  .beats-table tr:nth-child(even) td { background: #fdfaf3; }
  .beat-label {
    white-space: nowrap;
    font-weight: bold;
    color: #5c2e00;
    width: 68px;
    font-size: 7.5pt;
  }
  .beat-time { font-weight: normal; color: #888; font-size: 7pt; display: block; }

  .npc-block, .loc-block, .clock-block, .enc-block {
    padding: 3px 5px 3px 6px;
    border-left: 2px solid #c9a87c;
    margin-bottom: 4px;
    font-size: 7.8pt;
    line-height: 1.32;
  }
  .npc-block:last-child, .loc-block:last-child,
  .clock-block:last-child, .enc-block:last-child { margin-bottom: 0; }

  .npc-name { font-weight: bold; color: #2b1400; margin-bottom: 1px; }
  .lbl  { font-weight: bold; color: #6b3a0f; }
  .dim  { color: #777; font-size: 7.5pt; }
  .cornered { color: #7a0000; font-style: italic; font-size: 7.5pt; }
  .secret   { color: #4a006e; font-style: italic; }

  /* ── Districts ── */
  .district-list {
    margin-top: 3px;
    padding-left: 6px;
    border-left: 1px dashed #c9a87c;
  }
  .district-item { margin-top: 3px; }
  .district-item-name {
    font-weight: bold;
    color: #4a2200;
    font-size: 7.2pt;
  }
  .district-item-name::before { content: '▸ '; color: #8b4513; }
  .district-read {
    font-style: italic;
    font-size: 7pt;
    color: #3a3020;
    margin: 1px 0 1px 8px;
  }
  .poi-list {
    list-style: disc;
    padding-left: 14px;
    font-size: 7pt;
    color: #333;
    margin: 1px 0;
  }
  .poi-list li { margin-bottom: 1px; }

  /* ── Faction Clocks ── */
  .clock-track {
    height: 5px;
    background: #e5ddd0;
    border-radius: 3px;
    overflow: hidden;
    margin: 2px 0;
  }
  .clock-fill {
    height: 100%;
    background: linear-gradient(to right, #8b4513, #c97020);
    border-radius: 3px;
  }
  .clock-label { font-size: 7pt; color: #666; }

  .notes-section { margin-top: 7px; page-break-inside: avoid; }
  .notes-content {
    font-size: 8pt;
    padding: 5px 7px;
    background: #fdfaf3;
    border: 1px solid #d4b896;
    white-space: pre-wrap;
    line-height: 1.35;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<div class="page-header">
  <h1>Session ${num}</h1>
  <span class="meta">${esc(data.date || '')}${data.partyLevel ? `&ensp;|&ensp;Party Level ${esc(String(data.partyLevel))}` : ''}</span>
</div>

${(data.sessionGoal || data.endState) ? `
<div class="goal-bar">
  ${data.sessionGoal ? `<span class="goal-label">Goal:</span> ${esc(data.sessionGoal)}` : ''}
  ${data.endState    ? `${data.sessionGoal ? '<br>' : ''}<span class="goal-label">End State:</span> ${esc(data.endState)}` : ''}
</div>` : ''}

${(data.openingReadAloud || data.threeOptionsPrompt) ? `
<div class="opening-section">
  <div class="section-head">Opening</div>
  ${data.openingReadAloud   ? `<div class="hook-box">${escNl(data.openingReadAloud)}</div>` : ''}
  ${data.threeOptionsPrompt ? `<div class="three-opts"><strong>Prompt:</strong> ${esc(data.threeOptionsPrompt)}</div>` : ''}
</div>` : ''}

<div class="two-col">
  <div class="col-left">
    <div class="section">
      <div class="section-head">Session Beats</div>
      <table class="beats-table">
        <tr>
          <th style="width:70px">Block</th>
          <th>Notes</th>
        </tr>
        <tr>
          <td class="beat-label">Open<span class="beat-time">0–20 min</span></td>
          <td>${escNl(data.beatOpen || '')}</td>
        </tr>
        <tr>
          <td class="beat-label">Middle<span class="beat-time">20–70 min</span></td>
          <td>${escNl(data.beatMiddle || '')}</td>
        </tr>
        <tr>
          <td class="beat-label">Escalate<span class="beat-time">70–100 min</span></td>
          <td>${escNl(data.beatEscalate || '')}</td>
        </tr>
        <tr>
          <td class="beat-label">Close<span class="beat-time">100–120 min</span></td>
          <td>${escNl(data.beatClose || '')}</td>
        </tr>
      </table>
    </div>
    ${renderEncounters(data.encounters)}
  </div>
  <div class="col-right">
    ${renderNPCs(data.npcs)}
    ${renderLocations(data.locations)}
    ${renderClocks(data.factionClocks)}
  </div>
</div>

${data.sessionNotes && data.sessionNotes.trim() ? `
<div class="notes-section">
  <div class="section-head">Session Notes</div>
  <div class="notes-content">${esc(data.sessionNotes.trim())}</div>
</div>` : ''}

</body>
</html>`;
}

module.exports = { render };
