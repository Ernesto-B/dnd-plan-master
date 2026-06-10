function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function block(title, body) {
  if (!body) return '';
  return `
    <section class="section">
      <div class="section-title">${esc(title)}</div>
      <div class="section-body">${body}</div>
    </section>
  `;
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

function renderClock(clock, index) {
  const stepDescriptions = Array.isArray(clock.stepDescriptions) ? clock.stepDescriptions : [];
  return `
    <div class="clock-card">
      <div class="clock-head">
        <div class="clock-name">${esc(clock.name || `Clock ${index + 1}`)}</div>
        <div class="clock-steps">${esc(String(clock.steps || stepDescriptions.length || 0))} steps</div>
      </div>
      ${clock.advanceTrigger ? `<div class="clock-copy"><strong>Advances:</strong> ${esc(clock.advanceTrigger)}</div>` : ''}
      ${clock.setbackTrigger ? `<div class="clock-copy"><strong>Setbacks:</strong> ${esc(clock.setbackTrigger)}</div>` : ''}
      <div class="clock-steps-list">
        ${stepDescriptions.map((description, stepIndex) => `
          <div class="clock-step">
            <div class="clock-step-label">Step ${stepIndex + 1}</div>
            <div class="clock-step-copy">${esc(description || 'No change noted.')}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderLinks(title, items, prefix) {
  if (!Array.isArray(items) || !items.length) return '';
  return block(title, `<ul>${items.map(id => `<li>${esc(prefix)} ${esc(id)}</li>`).join('')}</ul>`);
}

function render(faction) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(faction.name || 'Faction')}</title>
  <style>
    body {
      font-family: Georgia, serif;
      color: #2b2114;
      margin: 30px 36px;
      line-height: 1.5;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      color: #7b5311;
      letter-spacing: 0.4px;
    }
    .meta {
      font-size: 12px;
      color: #5e513f;
      margin-bottom: 16px;
    }
    .snapshot {
      display: flex;
      gap: 18px;
      margin-bottom: 18px;
      font-size: 14px;
    }
    .snapshot strong {
      color: #7b5311;
    }
    .section {
      margin-bottom: 18px;
      break-inside: avoid;
    }
    .section-title {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #7b5311;
      margin-bottom: 6px;
    }
    .section-body {
      font-size: 14px;
      white-space: pre-wrap;
    }
    .clock-card {
      border: 1px solid rgba(123, 83, 17, 0.18);
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 12px;
      break-inside: avoid;
    }
    .clock-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
    }
    .clock-name {
      font-weight: bold;
      color: #7b5311;
    }
    .clock-steps {
      font-size: 12px;
      color: #6b5a46;
    }
    .clock-copy {
      margin-bottom: 6px;
      font-size: 13px;
    }
    .clock-steps-list {
      display: grid;
      gap: 8px;
    }
    .clock-step {
      background: #f7f1e5;
      border-left: 3px solid #c9962a;
      padding: 8px 10px;
    }
    .clock-step-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #7b5311;
      margin-bottom: 4px;
    }
    ul {
      margin: 0;
      padding-left: 20px;
    }
  </style>
</head>
<body>
  <h1>${esc(faction.name || 'Unnamed Faction')}</h1>
  <div class="meta">
    ${Array.isArray(faction.tags) && faction.tags.length ? `Tags: ${esc(faction.tags.join(', '))}` : ''}
    ${faction.origin ? `${Array.isArray(faction.tags) && faction.tags.length ? ' · ' : ''}Origin / Allegiance: ${esc(faction.origin)}` : ''}
  </div>
  <div class="snapshot">
    ${faction.size !== '' && faction.size != null ? `<div><strong>Size:</strong> ${esc(String(faction.size))} members</div>` : ''}
    ${faction.partyReputation !== '' && faction.partyReputation != null ? `<div><strong>Party Reputation:</strong> ${esc(String(faction.partyReputation))}${reputationLabel(faction.partyReputation) ? ` (${esc(reputationLabel(faction.partyReputation))})` : ''}</div>` : ''}
  </div>
  ${block('Goal', esc(faction.goal || ''))}
  ${renderLinks('Linked Sessions', faction.linkedSessions, 'Session')}
  ${renderLinks('Linked Encounters', faction.linkedEncounters, 'Encounter')}
  ${renderLinks('Linked NPCs', faction.linkedNpcs, 'NPC')}
  ${renderLinks('Linked Locations', faction.linkedLocations, 'Location')}
  ${Array.isArray(faction.factionClocks) && faction.factionClocks.length
    ? block('Faction Clocks', faction.factionClocks.map(renderClock).join(''))
    : ''}
</body>
</html>`;
}

module.exports = {
  render,
};
