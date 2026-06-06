const { marked } = require('marked');

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escNl(str) {
  return esc(str).replace(/\n/g, '<br>');
}

function renderLinkedNpcs(linkedNpcs) {
  if (!linkedNpcs.length) return '';
  return `
    <section class="packet-section">
      <div class="packet-section-head">Linked NPCs</div>
      <div class="packet-list">
        ${linkedNpcs.map(npc => `
          <div class="packet-list-item">
            <div class="packet-list-title">${esc(npc.name)}${npc.nickname ? ` <span class="packet-list-sub">"${esc(npc.nickname)}"</span>` : ''}</div>
            <div class="packet-list-meta">${esc(npc.id)}${npc.exists ? '' : ' · missing NPC'}</div>
          </div>
        `).join('')}
      </div>
    </section>`;
}

function renderEncounterSection(encounter, index) {
  const html = marked.parse(encounter.markdown || '');
  return `
    <section class="packet-section packet-break">
      <div class="packet-section-head">Linked Encounter: ${esc(encounter.name || encounter.id)}</div>
      <div class="packet-section-meta">${esc(encounter.id)}${encounter.sessionId ? ` · session ${esc(encounter.sessionId)}` : ''}</div>
      <div class="markdown-body packet-markdown">${html}</div>
    </section>`;
}

function render({ session, linkedNpcs = [], linkedEncounters = [] }) {
  const sessionData = session.data || {};
  const title = `Session Packet — Session ${String(session.sessionNumber || sessionData.sessionNumber || 0).padStart(3, '0')}`;
  const sessionHtml = marked.parse(session.markdown || '');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #fff;
    color: #1a1108;
    font-family: 'Georgia', serif;
    line-height: 1.45;
  }
  .packet {
    padding: 18px 20px 28px;
  }
  .packet-cover {
    margin-bottom: 16px;
    padding: 16px 18px;
    background: #f7efe0;
    border: 1px solid #d4b896;
    border-left: 4px solid #8b4513;
  }
  .packet-kicker {
    font-family: Arial, sans-serif;
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #7a5c1a;
    margin-bottom: 4px;
  }
  .packet-title {
    font-family: Arial, sans-serif;
    font-size: 18pt;
    font-weight: 700;
    color: #2b1400;
    margin-bottom: 4px;
  }
  .packet-meta {
    font-family: Arial, sans-serif;
    font-size: 9.5pt;
    color: #5c4a31;
  }
  .packet-meta span { margin-right: 10px; }
  .packet-section {
    margin-top: 16px;
    page-break-inside: avoid;
  }
  .packet-break { page-break-before: always; }
  .packet-section-head {
    font-family: Arial, sans-serif;
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #7a3a10;
    border-bottom: 1px solid #c9962a;
    padding-bottom: 4px;
    margin-bottom: 8px;
  }
  .packet-section-meta {
    font-family: Arial, sans-serif;
    font-size: 8.5pt;
    color: #6f5a3b;
    margin-bottom: 8px;
  }
  .packet-list {
    display: grid;
    gap: 8px;
  }
  .packet-list-item {
    border: 1px solid #ddd0a8;
    background: #faf6ee;
    border-radius: 3px;
    padding: 8px 10px;
  }
  .packet-list-title {
    font-family: Arial, sans-serif;
    font-size: 10pt;
    font-weight: 700;
    color: #2b1400;
    margin-bottom: 2px;
  }
  .packet-list-sub {
    font-weight: 400;
    color: #7a5c1a;
  }
  .packet-list-meta {
    font-family: Arial, sans-serif;
    font-size: 8.5pt;
    color: #6f5a3b;
  }
  .packet-markdown {
    font-size: 9pt;
  }
  .packet-markdown h1,
  .packet-markdown h2,
  .packet-markdown h3 {
    page-break-after: avoid;
  }
  .packet-markdown h1 { font-size: 18pt; margin: 0 0 10px; }
  .packet-markdown h2 { font-size: 13pt; margin: 14px 0 8px; }
  .packet-markdown h3 { font-size: 11pt; margin: 10px 0 6px; }
  .packet-markdown p,
  .packet-markdown li { font-size: 9pt; }
  .packet-markdown table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 8px 0; }
  .packet-markdown th,
  .packet-markdown td {
    border: 1px solid #ddd0a8;
    padding: 4px 6px;
    vertical-align: top;
    text-align: left;
  }
  .packet-markdown th { background: #faf6ee; }
  .packet-markdown blockquote {
    margin: 8px 0;
    padding: 8px 10px;
    border-left: 3px solid #c9962a;
    background: #faf6ee;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="packet">
    <div class="packet-cover">
      <div class="packet-kicker">D&amp;D Session Master</div>
      <div class="packet-title">${esc(title)}</div>
      <div class="packet-meta">
        <span>Session ID: ${esc(session.id)}</span>
        ${sessionData.date ? `<span>Date: ${esc(sessionData.date)}</span>` : ''}
        ${sessionData.partyLevel ? `<span>Party Level: ${esc(sessionData.partyLevel)}</span>` : ''}
        ${linkedNpcs.length ? `<span>Linked NPCs: ${linkedNpcs.length}</span>` : ''}
        ${linkedEncounters.length ? `<span>Linked Encounters: ${linkedEncounters.length}</span>` : ''}
      </div>
    </div>

    <section class="packet-section">
      <div class="packet-section-head">Session Plan</div>
      <div class="markdown-body packet-markdown">${sessionHtml}</div>
    </section>

    ${renderLinkedNpcs(linkedNpcs)}

    ${linkedEncounters.map((encounter, index) => renderEncounterSection(encounter, index)).join('')}
  </div>
</body>
</html>`;
}

module.exports = { render };
