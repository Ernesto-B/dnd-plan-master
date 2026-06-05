(async function () {
  const statsEl = document.getElementById('campaign-stats');
  const boardsEl = document.getElementById('campaign-boards');
  const timelineEl = document.getElementById('campaign-timeline');
  const searchEl = document.getElementById('campaign-search');

  let sessions = [];

  try {
    const res = await fetch('/api/sessions/campaign');
    if (!res.ok) throw new Error('Could not load campaign continuity');
    sessions = await res.json();
  } catch (err) {
    boardsEl.innerHTML = `<div class="empty-state"><p>${escHtml(err.message)}</p></div>`;
    timelineEl.innerHTML = '';
    return;
  }

  if (!sessions.length) {
    renderStats([]);
    boardsEl.innerHTML = `
      <div class="empty-state campaign-empty">
        <p>No continuity notes yet.</p>
        <a href="/form" class="btn btn-primary">Add to a Session Plan</a>
      </div>`;
    timelineEl.innerHTML = '';
    return;
  }

  sessions.sort((a, b) => {
    const numA = Number(a.sessionNumber) || 0;
    const numB = Number(b.sessionNumber) || 0;
    if (numA !== numB) return numB - numA;
    return String(b.date || '').localeCompare(String(a.date || ''));
  });

  render(sessions);
  searchEl.addEventListener('input', () => {
    const query = searchEl.value.trim().toLowerCase();
    if (!query) {
      render(sessions);
      return;
    }
    const filtered = sessions.filter(session => getSearchBlob(session).includes(query));
    render(filtered, true);
  });

  function render(items, isFiltered) {
    renderStats(items);
    renderBoards(items, isFiltered);
    renderTimeline(items, isFiltered);
  }

  function renderStats(items) {
    const totals = items.reduce((acc, session) => {
      acc.sessions += 1;
      acc.worldStateChanges += session.continuity.worldStateChanges.length;
      acc.unresolvedThreads += session.continuity.unresolvedThreads.length;
      acc.npcStatusChanges += session.continuity.npcStatusChanges.length;
      acc.treasureRewardsLog += session.continuity.treasureRewardsLog.length;
      return acc;
    }, {
      sessions: 0,
      worldStateChanges: 0,
      unresolvedThreads: 0,
      npcStatusChanges: 0,
      treasureRewardsLog: 0,
    });

    statsEl.innerHTML = `
      <div class="campaign-stat-card">
        <div class="campaign-stat-label">Tracked Sessions</div>
        <div class="campaign-stat-value">${totals.sessions}</div>
      </div>
      <div class="campaign-stat-card">
        <div class="campaign-stat-label">World Changes</div>
        <div class="campaign-stat-value">${totals.worldStateChanges}</div>
      </div>
      <div class="campaign-stat-card">
        <div class="campaign-stat-label">Open Threads</div>
        <div class="campaign-stat-value">${totals.unresolvedThreads}</div>
      </div>
      <div class="campaign-stat-card">
        <div class="campaign-stat-label">NPC Updates</div>
        <div class="campaign-stat-value">${totals.npcStatusChanges}</div>
      </div>
      <div class="campaign-stat-card">
        <div class="campaign-stat-label">Rewards Logged</div>
        <div class="campaign-stat-value">${totals.treasureRewardsLog}</div>
      </div>
    `;
  }

  function renderBoards(items, isFiltered) {
    if (!items.length) {
      boardsEl.innerHTML = `<div class="empty-state"><p>${isFiltered ? 'No campaign notes match your search.' : 'No continuity notes yet.'}</p></div>`;
      return;
    }

    const boardDefs = [
      { key: 'worldStateChanges', title: 'World-State Changes', empty: 'No world-state changes logged yet.' },
      { key: 'unresolvedThreads', title: 'Unresolved Threads', empty: 'No unresolved threads logged yet.' },
      { key: 'npcStatusChanges', title: 'NPC Status Changes', empty: 'No NPC status changes logged yet.' },
      { key: 'treasureRewardsLog', title: 'Treasure & Rewards', empty: 'No rewards logged yet.' },
    ];

    boardsEl.innerHTML = boardDefs.map(def => {
      const entries = items.flatMap(session => session.continuity[def.key].map(text => ({
        text,
        session,
      })));

      const body = entries.length
        ? entries.map(entry => `
            <a class="campaign-board-item" href="/view/${entry.session.id}">
              <span class="campaign-board-text">${escHtml(entry.text)}</span>
              <span class="campaign-board-meta">${sessionLabel(entry.session)}</span>
            </a>
          `).join('')
        : `<p class="campaign-board-empty">${def.empty}</p>`;

      return `
        <div class="campaign-board card">
          <div class="campaign-board-head">
            <span>${def.title}</span>
            <span class="campaign-board-count">${entries.length}</span>
          </div>
          <div class="campaign-board-list">${body}</div>
        </div>
      `;
    }).join('');
  }

  function renderTimeline(items, isFiltered) {
    if (!items.length) {
      timelineEl.innerHTML = `<div class="empty-state"><p>${isFiltered ? 'No sessions match your search.' : 'No continuity sessions yet.'}</p></div>`;
      return;
    }

    timelineEl.innerHTML = items.map(session => {
      const recap = session.continuity.sessionRecap
        ? `
          <div class="campaign-session-recap">
            <div class="campaign-mini-label">Session Recap</div>
            <p>${escHtml(session.continuity.sessionRecap)}</p>
          </div>`
        : '';

      return `
        <article class="campaign-session card">
          <div class="campaign-session-head">
            <div>
              <a class="campaign-session-link" href="/view/${session.id}">${sessionLabel(session)}</a>
              <div class="campaign-session-sub">${escHtml(session.goal || 'No session goal recorded.')}</div>
            </div>
            <div class="campaign-session-meta">
              ${session.date ? `<span>${formatDate(session.date)}</span>` : ''}
              ${session.partyLevel ? `<span>Level ${escHtml(String(session.partyLevel))}</span>` : ''}
            </div>
          </div>
          ${renderTags(session.tags)}
          ${recap}
          <div class="campaign-session-grid">
            ${renderSessionListCard('World-State Changes', session.continuity.worldStateChanges, 'No world-state changes noted.')}
            ${renderSessionListCard('Unresolved Threads', session.continuity.unresolvedThreads, 'No unresolved threads noted.')}
            ${renderSessionListCard('NPC Status Changes', session.continuity.npcStatusChanges, 'No NPC updates noted.')}
            ${renderSessionListCard('Treasure & Rewards', session.continuity.treasureRewardsLog, 'No rewards logged.')}
          </div>
        </article>
      `;
    }).join('');
  }
})();

function renderSessionListCard(title, items, emptyText) {
  return `
    <section class="campaign-mini-card">
      <div class="campaign-mini-label">${title}</div>
      ${items.length
        ? `<ul class="campaign-mini-list">${items.map(item => `<li>${escHtml(item)}</li>`).join('')}</ul>`
        : `<p class="campaign-mini-empty">${emptyText}</p>`}
    </section>
  `;
}

function renderTags(tags) {
  if (!tags || !tags.length) return '';
  return `<div class="campaign-session-tags">${tags.map(tag => `<span class="tag-chip">${escHtml(tag)}</span>`).join('')}</div>`;
}

function sessionLabel(session) {
  const numRaw = String(session.sessionNumber ?? '?');
  const num = numRaw.includes('.') ? numRaw : numRaw.padStart(3, '0');
  return `Session #${escHtml(num)} · ${escHtml(session.id)}`;
}

function getSearchBlob(session) {
  return [
    session.id,
    session.goal,
    session.date,
    session.partyLevel,
    ...(session.tags || []),
    session.continuity.sessionRecap,
    ...(session.continuity.worldStateChanges || []),
    ...(session.continuity.unresolvedThreads || []),
    ...(session.continuity.npcStatusChanges || []),
    ...(session.continuity.treasureRewardsLog || []),
  ].join(' ').toLowerCase();
}

function formatDate(dateStr) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
