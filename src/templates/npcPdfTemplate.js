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

function renderSkills(skillDescriptions) {
  const entries = Object.entries(skillDescriptions || {}).filter(([, value]) => String(value || '').trim());
  if (!entries.length) return '';
  return block('Skill Triggers', entries.map(([key, value]) => `
    <div class="skill-row">
      <div class="skill-name">${esc(key)}</div>
      <div class="skill-copy">${esc(value)}</div>
    </div>
  `).join(''));
}

function renderCarrying(carrying) {
  if (!Array.isArray(carrying) || !carrying.length) return '';
  return block('Carrying', `<ul>${carrying.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`);
}

function render(npc) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(npc.name || 'NPC')}</title>
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
    .nickname {
      font-style: italic;
      color: #6b5a46;
      margin-bottom: 10px;
    }
    .tags {
      font-size: 12px;
      margin-bottom: 16px;
      color: #5e513f;
    }
    blockquote {
      margin: 0 0 20px;
      padding: 10px 14px;
      border-left: 3px solid #c9962a;
      background: #f7f1e5;
      font-style: italic;
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
    .skill-row {
      margin-bottom: 10px;
    }
    .skill-name {
      font-weight: bold;
      margin-bottom: 2px;
      text-transform: capitalize;
    }
    ul {
      margin: 0;
      padding-left: 20px;
    }
  </style>
</head>
<body>
  <h1>${esc(npc.name || 'Unnamed NPC')}</h1>
  ${npc.nickname ? `<div class="nickname">"${esc(npc.nickname)}"</div>` : ''}
  ${Array.isArray(npc.tags) && npc.tags.length ? `<div class="tags">Tags: ${esc(npc.tags.join(', '))}</div>` : ''}
  ${npc.commonPhrase ? `<blockquote>${esc(npc.commonPhrase)}</blockquote>` : ''}
  ${block('Appearance', esc(npc.appearance || ''))}
  ${block('Situation', esc(npc.situation || ''))}
  ${block('Wants & Needs', esc(npc.wantsNeeds || ''))}
  ${block('Secret / Obstacle', esc(npc.secretObstacle || ''))}
  ${renderSkills(npc.skillDescriptions)}
  ${renderCarrying(npc.carrying)}
</body>
</html>`;
}

module.exports = {
  render,
};
