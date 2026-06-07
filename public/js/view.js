(function () {
  marked.use({
    renderer: {
      link(token) {
        const text = this.parser.parseInline(token.tokens);
        let out = '<a href="' + (token.href || '') + '"';
        if (token.title) out += ' title="' + token.title + '"';
        out += ' target="_blank" rel="noopener">' + text + '</a>';
        return out;
      },
    },
  });
})();

(async function () {
  const id = location.pathname.split('/').pop();
  const content = document.getElementById('content');

  let session = null;
  let linkedEncounterLinks = [];
  let linkedNpcLinks = [];

  try {
    const [sessionRes, linksRes, npcRes] = await Promise.all([
      fetch(`/api/sessions/${id}`),
      fetch(`/api/sessions/${id}/links`),
      fetch(`/api/sessions/${id}/linked-npcs`),
    ]);

    if (!sessionRes.ok) throw new Error('Not found');
    session = await sessionRes.json();
    linkedEncounterLinks = linksRes.ok ? await linksRes.json() : [];
    linkedNpcLinks = npcRes.ok ? await npcRes.json() : [];
  } catch {
    content.innerHTML = '<div class="empty-state"><p>Session not found.</p><a href="/sessions" class="btn btn-ghost">← Back</a></div>';
    return;
  }

  document.title = `Session ${id} — D&D Session Master`;
  content.innerHTML = `
    <div class="markdown-body" id="session-markdown">${marked.parse(session.markdown || '')}</div>
  `;

  buildMarkdownToc();
  mountTagEditor(id, session.data?.tags || [], '/api/sessions', '#tags-anchor');
  setupDmModal(session, linkedEncounterLinks, linkedNpcLinks);
  setupConnectionsPanel(session, linkedEncounterLinks, linkedNpcLinks);

  document.getElementById('btn-run').addEventListener('click', () => {
    location.href = `/run/${id}`;
  });
  document.getElementById('btn-edit').addEventListener('click', () => {
    location.href = `/form?edit=${id}`;
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    ExportDialog.open({
      title: 'Export Session',
      loadFiles: async () => {
        const res = await fetch('/api/sessions/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(session.data),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Generation failed');
        return [{
          filename: result.filename,
          displayName: session.data?.goal || `Session ${formatSessionNumber(session.sessionNumber || session.data?.sessionNumber || '?')}`,
          type: 'session',
          markdown: result.markdown,
          pdf: result.pdf,
        }];
      },
    });
  });

  document.getElementById('btn-export-connections').addEventListener('click', () => {
    ExportDialog.open({
      title: 'Export Session with Connections',
      loadFiles: async () => {
        const files = [];

        const sessionRes = await fetch('/api/sessions/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(session.data),
        });
        const sessionResult = await sessionRes.json();
        if (!sessionRes.ok) throw new Error(sessionResult.error || 'Session generation failed');
        files.push({
          filename: sessionResult.filename,
          displayName: session.data?.goal || `Session ${formatSessionNumber(session.sessionNumber || session.data?.sessionNumber || '?')}`,
          type: 'session',
          markdown: sessionResult.markdown,
          pdf: sessionResult.pdf,
        });

        const encounterJobs = linkedEncounterLinks
          .filter(l => l.exists)
          .map(async link => {
            const encRes = await fetch(`/api/encounters/${encodeURIComponent(link.id)}`);
            if (!encRes.ok) return null;
            const enc = await encRes.json();
            const genRes = await fetch('/api/encounters/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(enc.data),
            });
            const genResult = await genRes.json();
            if (!genRes.ok) return null;
            return {
              filename: genResult.filename,
              displayName: link.name || link.id,
              type: 'encounter',
              markdown: genResult.markdown,
              pdf: genResult.pdf,
            };
          });

        const npcJobs = linkedNpcLinks
          .filter(l => l.exists)
          .map(async link => {
            const npcRes = await fetch(`/api/npcs/${encodeURIComponent(link.id)}`);
            if (!npcRes.ok) return null;
            const npc = await npcRes.json();
            const genRes = await fetch('/api/npcs/export', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(npc),
            });
            const genResult = await genRes.json();
            if (!genRes.ok) return null;
            return {
              filename: genResult.filename,
              displayName: link.name || link.id,
              type: 'npc',
              markdown: genResult.markdown,
              pdf: genResult.pdf,
            };
          });

        const [encResults, npcResults] = await Promise.all([
          Promise.allSettled(encounterJobs),
          Promise.allSettled(npcJobs),
        ]);

        encResults.forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });
        npcResults.forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });

        return files;
      },
    });
  });

  document.getElementById('btn-delete').addEventListener('click', () => deleteSession(id));
})();

function setupConnectionsPanel(session, linkedEncounterLinks, linkedNpcLinks) {
  const btn = document.getElementById('btn-connections');
  if (!btn || !window.RecordConnectionsPanel) return;
  btn.addEventListener('click', () => {
    window.RecordConnectionsPanel.open({
      title: `Session ${formatSessionNumber(session.sessionNumber || '?')} Connections`,
      subtitle: 'All records currently linked to this session.',
      sections: [
        {
          title: 'Linked NPCs',
          empty: 'No linked NPCs yet.',
          items: linkedNpcLinks.map(npc => ({
            label: npc.name || npc.id,
            meta: `${npc.id}${npc.nickname ? ` · "${npc.nickname}"` : ''}${npc.exists ? '' : ' · missing NPC'}`,
            url: `/npc/view/${npc.id}`,
            exists: npc.exists,
          })),
        },
        {
          title: 'Linked Encounter Plans',
          empty: 'No linked encounter plans yet.',
          items: linkedEncounterLinks.map(link => ({
            label: link.name || link.id,
            meta: `${link.id}${link.exists ? '' : ' · missing plan'}`,
            url: `/encounter/view/${link.id}`,
            exists: link.exists,
          })),
        },
      ],
    });
  });
}

function setupDmModal(session, linkedEncounterLinks, linkedNpcLinks) {
  const modal    = document.getElementById('dm-modal');
  const body     = document.getElementById('dm-modal-body');
  const openBtn  = document.getElementById('btn-dm-table');
  const closeBtn = document.getElementById('btn-dm-modal-close');
  const backdrop = document.getElementById('dm-modal-backdrop');
  const printBtn = document.getElementById('btn-dm-modal-print');

  function open() {
    if (!body.hasChildNodes()) renderDmTablePanel(session, linkedEncounterLinks, linkedNpcLinks, body);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function close() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  openBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  printBtn?.addEventListener('click', () => {
    document.body.classList.add('dm-print-mode');
    window.addEventListener('afterprint', () => document.body.classList.remove('dm-print-mode'), { once: true });
    setTimeout(() => window.print(), 50);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal?.hidden) close();
  });
}

function renderDmTablePanel(session, linkedEncounterLinks, linkedNpcLinks, containerEl) {
  const panel = containerEl || document.getElementById('dm-table-panel');
  if (!panel) return;

  const data = session.data || {};
  const sessionNumber = formatSessionNumber(session.sessionNumber || data.sessionNumber || '?');
  const title = `Session ${sessionNumber}`;
  const metaBits = [
    data.date || session.date ? formatDate(data.date || session.date) : null,
    data.partyLevel || session.partyLevel ? `Party Level ${data.partyLevel || session.partyLevel}` : null,
    session.id ? `ID ${session.id}` : null,
  ].filter(Boolean);

  panel.innerHTML = `
    <div class="dm-table-panel">
      <div class="dm-table-header">
        <div>
          <div class="dm-table-kicker">DM Table</div>
          <h2 class="dm-table-title">${escHtml(title)}</h2>
          <div class="dm-table-meta">${metaBits.map(escHtml).join(' · ')}</div>
        </div>
        <div class="dm-table-tags">${tagChipsHtml(data.tags || [])}</div>
      </div>

      <div class="dm-table-grid">
        <section class="dm-table-block dm-span-2">
          <div class="dm-table-block-title">Mission</div>
          ${data.sessionGoal ? `<div class="dm-table-lead"><span class="dm-label">Goal:</span> ${escHtml(data.sessionGoal)}</div>` : ''}
          ${data.endState ? `<div class="dm-table-lead"><span class="dm-label">End State:</span> ${escHtml(data.endState)}</div>` : ''}
          ${data.sessionRecap ? `<div class="dm-table-recap"><span class="dm-label">Recap:</span> ${escHtml(data.sessionRecap)}</div>` : ''}
          ${data.openingReadAloud ? `<div class="dm-table-note"><span class="dm-label">Opening:</span> ${escHtml(data.openingReadAloud)}</div>` : ''}
          ${data.threeOptionsPrompt ? `<div class="dm-table-note"><span class="dm-label">Three Options:</span> ${escHtml(data.threeOptionsPrompt)}</div>` : ''}
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
          <table class="dm-table">
            <tbody>
              ${renderBeatRow('Open', '0-20 min', data.beatOpen)}
              ${renderBeatRow('Middle', '20-70 min', data.beatMiddle)}
              ${renderBeatRow('Escalate', '70-100 min', data.beatEscalate)}
              ${renderBeatRow('Close', '100-120 min', data.beatClose)}
            </tbody>
          </table>
        </section>

        <section class="dm-table-block">
          <div class="dm-table-block-title">Linked Plans</div>
          ${linkedEncounterLinks.length ? `<div class="dm-sublist"><div class="dm-subtitle">Encounters</div>${linkedEncounterLinks.map(link => dmListItem(link.exists ? `/encounter/view/${link.id}` : '#', link.name || link.id, link.id, link.exists ? '' : ' · missing plan')).join('')}</div>` : '<p class="dm-empty">No linked encounter plans.</p>'}
          ${linkedNpcLinks.length ? `<div class="dm-sublist"><div class="dm-subtitle">NPCs</div>${linkedNpcLinks.map(npc => dmListItem(npc.exists ? `/npc/view/${npc.id}` : '#', npc.name || npc.id, npc.id, npc.exists ? (npc.nickname ? ` · ${npc.nickname}` : '') : ' · missing NPC')).join('')}</div>` : '<p class="dm-empty">No linked NPCs.</p>'}
        </section>

        ${data.sessionNotes ? `
          <section class="dm-table-block dm-span-2">
            <div class="dm-table-block-title">Session Notes</div>
            <div class="dm-table-note">${escHtml(data.sessionNotes)}</div>
          </section>` : ''}
      </div>
    </div>
  `;
}


async function deleteSession(id) {
  const ok = await showConfirm(`Delete Session ${id}? This cannot be undone.`, {
    title: 'Delete Session',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;

  try {
    const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Delete failed');
    }
    showToast('Session deleted.', 'success');
    setTimeout(() => { location.href = '/'; }, 1000);
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

function renderBeatRow(label, time, text) {
  if (!text) {
    return `
      <tr>
        <td class="dm-beat-label">${escHtml(label)}<span class="dm-beat-time">${escHtml(time)}</span></td>
        <td class="dm-empty">No notes recorded.</td>
      </tr>`;
  }
  return `
    <tr>
      <td class="dm-beat-label">${escHtml(label)}<span class="dm-beat-time">${escHtml(time)}</span></td>
      <td>${escHtml(text)}</td>
    </tr>`;
}

function renderBulletList(label, rawValue) {
  const items = String(rawValue || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (!items.length) return '';
  return `
    <div class="dm-sublist">
      <div class="dm-subtitle">${escHtml(label)}</div>
      <ul class="dm-list">${items.map(item => `<li>${escHtml(item)}</li>`).join('')}</ul>
    </div>`;
}

function dmListItem(href, title, meta, suffix = '') {
  return `
    <a class="dm-link${href === '#' ? ' is-disabled' : ''}" href="${href}"${href === '#' ? ' aria-disabled="true"' : ''}>
      <span class="dm-link-title">${escHtml(title)}</span>
      <span class="dm-link-meta">${escHtml(meta)}${suffix}</span>
    </a>`;
}

function formatSessionNumber(value) {
  const raw = String(value ?? '?');
  return raw.includes('.') ? raw : raw.padStart(3, '0');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function tagChipsHtml(tags, max = 3) {
  if (!tags || !tags.length) return '';
  const visible = tags.slice(0, max).map(t => `<span class="tag-chip">${escHtml(t)}</span>`);
  if (tags.length > max) visible.push(`<span class="tag-chip overflow">+${tags.length - max}</span>`);
  return visible.join(' ');
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
