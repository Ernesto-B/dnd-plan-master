// Ported from view.js renderDmTablePanel — builds the print-ready DM Table HTML
// string for a session. Uses the shared WikiLinks renderer for prose.
const wiki = raw => (window.WikiLinks ? window.WikiLinks.render(raw || '') : String(raw ?? ''));

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
function formatSessionNumber(value) {
  const raw = String(value ?? '?');
  return raw.includes('.') ? raw : raw.padStart(3, '0');
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function tagChipsHtml(tags, max = 3) {
  if (!tags || !tags.length) return '';
  const visible = tags.slice(0, max).map(t => `<span class="tag-chip${String(t || '').trim().toLowerCase() === 'draft' ? ' is-draft' : ''}">${escHtml(t)}</span>`);
  if (tags.length > max) visible.push(`<span class="tag-chip overflow">+${tags.length - max}</span>`);
  return visible.join(' ');
}
function renderBeatRow(label, time, text) {
  const cell = text ? `<td>${wiki(text)}</td>` : `<td class="dm-empty">No notes recorded.</td>`;
  return `<tr><td class="dm-beat-label">${escHtml(label)}<span class="dm-beat-time">${escHtml(time)}</span></td>${cell}</tr>`;
}
function renderBulletList(label, rawValue) {
  const items = String(rawValue || '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!items.length) return '';
  return `<div class="dm-sublist"><div class="dm-subtitle">${escHtml(label)}</div><ul class="dm-list">${items.map(i => `<li>${wiki(i)}</li>`).join('')}</ul></div>`;
}
function dmListItem(href, title, meta, suffix = '') {
  return `<a class="dm-link${href === '#' ? ' is-disabled' : ''}" href="${href}"${href === '#' ? ' aria-disabled="true"' : ''}><span class="dm-link-title">${escHtml(title)}</span><span class="dm-link-meta">${escHtml(meta)}${suffix}</span></a>`;
}

export function renderDmTableHTML(session, encounters = [], npcs = []) {
  const data = session.data || {};
  const sessionNumber = formatSessionNumber(session.sessionNumber || data.sessionNumber || '?');
  const metaBits = [
    (data.date || session.date) ? formatDate(data.date || session.date) : null,
    (data.partyLevel || session.partyLevel) ? `Party Level ${data.partyLevel || session.partyLevel}` : null,
    session.id ? `ID ${session.id}` : null,
  ].filter(Boolean);

  return `
    <div class="dm-table-panel">
      <div class="dm-table-header">
        <div>
          <div class="dm-table-kicker">DM Table</div>
          <h2 class="dm-table-title">${escHtml(`Session ${sessionNumber}`)}</h2>
          <div class="dm-table-meta">${metaBits.map(escHtml).join(' · ')}</div>
        </div>
        <div class="dm-table-tags">${tagChipsHtml(data.tags || [])}</div>
      </div>
      <div class="dm-table-grid">
        <section class="dm-table-block dm-span-2">
          <div class="dm-table-block-title">Mission</div>
          ${data.sessionGoal ? `<div class="dm-table-lead"><span class="dm-label">Goal:</span> ${wiki(data.sessionGoal)}</div>` : ''}
          ${data.endState ? `<div class="dm-table-lead"><span class="dm-label">End State:</span> ${wiki(data.endState)}</div>` : ''}
          ${data.sessionRecap ? `<div class="dm-table-recap"><span class="dm-label">Recap:</span> ${wiki(data.sessionRecap)}</div>` : ''}
          ${data.openingReadAloud ? `<div class="dm-table-note"><span class="dm-label">Opening:</span> ${wiki(data.openingReadAloud)}</div>` : ''}
          ${data.threeOptionsPrompt ? `<div class="dm-table-note"><span class="dm-label">Three Options:</span> ${wiki(data.threeOptionsPrompt)}</div>` : ''}
        </section>
        <section class="dm-table-block">
          <div class="dm-table-block-title">Continuity</div>
          ${renderBulletList('World State', data.worldStateChanges)}
          ${renderBulletList('Unresolved Threads', data.unresolvedThreads)}
          ${renderBulletList('NPC Status', data.npcStatusChanges)}
          ${renderBulletList('Rewards', data.treasureRewardsLog)}
        </section>
        <section class="dm-table-block">
          <div class="dm-table-block-title">Beats</div>
          <table class="dm-table"><tbody>
            ${renderBeatRow('Open', '0-20 min', data.beatOpen)}
            ${renderBeatRow('Middle', '20-70 min', data.beatMiddle)}
            ${renderBeatRow('Escalate', '70-100 min', data.beatEscalate)}
            ${renderBeatRow('Close', '100-120 min', data.beatClose)}
          </tbody></table>
        </section>
        <section class="dm-table-block">
          <div class="dm-table-block-title">Linked Plans</div>
          ${encounters.length ? `<div class="dm-sublist"><div class="dm-subtitle">Encounters</div>${encounters.map(l => dmListItem(l.exists ? `/encounter/view/${l.id}` : '#', l.name || l.id, l.id, l.exists ? '' : ' · missing plan')).join('')}</div>` : '<p class="dm-empty">No linked encounter plans.</p>'}
          ${npcs.length ? `<div class="dm-sublist"><div class="dm-subtitle">NPCs</div>${npcs.map(n => dmListItem(n.exists ? `/npc/view/${n.id}` : '#', n.name || n.id, n.id, n.exists ? (n.nickname ? ` · ${n.nickname}` : '') : ' · missing NPC')).join('')}</div>` : '<p class="dm-empty">No linked NPCs.</p>'}
        </section>
        ${data.sessionNotes ? `<section class="dm-table-block dm-span-2"><div class="dm-table-block-title">Session Notes</div><div class="dm-table-note">${wiki(data.sessionNotes)}</div></section>` : ''}
      </div>
    </div>`;
}
