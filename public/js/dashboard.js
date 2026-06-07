(async function () {
  const heroEl = document.getElementById('dashboard-hero');
  const statsEl = document.getElementById('dashboard-stats');
  const continuityEl = document.getElementById('dashboard-continuity');
  const partyEl = document.getElementById('dashboard-party');

  try {
    const activeCampaign = await fetchJson('/api/campaigns/active');
    if (!activeCampaign) throw new Error('Could not load current campaign');

    const [sessions, encounters, npcs, locations, continuitySessions] = await Promise.all([
      fetchJson('/api/sessions', []),
      fetchJson('/api/encounters', []),
      fetchJson('/api/npcs', []),
      fetchJson('/api/locations', []),
      fetchJson('/api/sessions/campaign', []),
    ]);

    renderDashboard({
      campaign: activeCampaign,
      sessions,
      encounters,
      npcs,
      locations,
      continuitySessions,
    });
  } catch (err) {
    heroEl.innerHTML = `<div class="empty-state"><p>${escHtml(err.message || 'Could not load dashboard.')}</p></div>`;
    statsEl.innerHTML = '';
    continuityEl.innerHTML = '';
    partyEl.innerHTML = '';
  }

  async function fetchJson(url, fallback = null) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      return await res.json();
    } catch {
      return fallback;
    }
  }

  function renderDashboard({ campaign, sessions, encounters, npcs, locations, continuitySessions }) {
    const latestSession = [...sessions].sort(compareByRecentSession)[0] || null;
    const latestEncounter = [...encounters].sort(compareByRecent)[0] || null;
    const latestNpc = [...npcs].sort(compareByRecent)[0] || null;
    const latestLocation = [...locations].sort(compareByRecent)[0] || null;
    const continuity = summarizeContinuity(continuitySessions);
    const party = Array.isArray(campaign.partyRoster) ? campaign.partyRoster : [];

    heroEl.innerHTML = `
      <div class="dashboard-hero-copy">
        <div class="dashboard-eyebrow">Current Campaign</div>
        <h1 class="page-title">${escHtml(campaign.name || 'Campaign')}</h1>
        <p class="page-subtitle">${escHtml(campaign.description || 'Your overview of the current campaign. Start here, then jump into sessions, encounters, NPCs, and continuity work from one place.')}</p>
        <div class="dashboard-hero-actions">
          <a href="/form" class="btn btn-primary">New Session</a>
          <a href="/encounter/new" class="btn btn-ghost">New Encounter</a>
          <a href="/npc/new" class="btn btn-ghost">New NPC</a>
          <a href="/location/new" class="btn btn-ghost">New Location</a>
          <a href="/campaigns" class="btn btn-ghost">Manage Campaigns</a>
        </div>
      </div>
      <div class="dashboard-hero-side card">
        <div class="dashboard-hero-side-label">Campaign Status</div>
        <div class="dashboard-hero-side-value">${sessions.length} session${sessions.length === 1 ? '' : 's'}</div>
        <p class="dashboard-hero-side-note">${party.length ? `${party.length} party member${party.length === 1 ? '' : 's'} in the current roster.` : 'No party roster yet. Add it in Settings when you are ready.'}</p>
      </div>
    `;

    statsEl.innerHTML = [
      statCard('Sessions', sessions.length, '/sessions', latestSession && {
        href: `/view/${latestSession.id}`,
        title: sessionLabel(latestSession),
        tooltip: latestSession.goal || 'No session goal recorded.',
      }),
      statCard('Encounters', encounters.length, '/encounters', latestEncounter && {
        href: `/encounter/view/${latestEncounter.id}`,
        title: latestEncounter.name || latestEncounter.id,
        tooltip: latestEncounter.fiction || 'No encounter fiction recorded.',
      }),
      statCard('NPCs', npcs.length, '/npcs', latestNpc && {
        href: `/npc/view/${latestNpc.id}`,
        title: latestNpc.name || latestNpc.id,
        tooltip: latestNpc.situation || latestNpc.nickname || 'No current NPC situation recorded.',
      }),
      statCard('Locations', locations.length, '/locations', latestLocation && {
        href: `/location/view/${latestLocation.id}`,
        title: latestLocation.name || latestLocation.id,
        tooltip: latestLocation.description || 'No location description recorded.',
      }),
    ].join('');

    continuityEl.innerHTML = `
      <div class="dashboard-side-card card">
        <div class="dashboard-side-list">
          ${sideMetric('Tracked Sessions', continuity.trackedSessions)}
          ${sideMetric('World Changes', continuity.worldChanges)}
          ${sideMetric('Open Threads', continuity.unresolvedThreads)}
          ${sideMetric('NPC Updates', continuity.npcUpdates)}
          ${sideMetric('Rewards', continuity.treasureRewards)}
        </div>
        <a href="#campaign-guide" class="btn btn-ghost dashboard-side-btn">Jump to Continuity</a>
      </div>
    `;

    partyEl.innerHTML = party.length
      ? `
        <div class="dashboard-side-card card">
          <div class="dashboard-scroll-area" id="dashboard-party-scroll">
            <div class="dashboard-party-list">
              ${party.map(member => `
                <div class="dashboard-party-item">
                  <div class="dashboard-party-name">${escHtml(member.name || 'Unnamed')}</div>
                  <div class="dashboard-party-meta">${escHtml(member.playerClass || 'Class not set')}</div>
                  ${member.characterUrl ? `<a class="dashboard-party-link" href="${escHtml(member.characterUrl)}" target="_blank" rel="noopener">Character Sheet ↗</a>` : ''}
                </div>
              `).join('')}
            </div>
            <div class="dashboard-scroll-fade" aria-hidden="true"></div>
          </div>
          <a href="/settings#sec-party" class="btn btn-ghost dashboard-side-btn">Edit Party Roster</a>
        </div>
      `
      : `
        <div class="dashboard-side-card card">
          <p class="dashboard-empty-copy">No party roster yet. Add the current adventuring party in Settings so encounter planning and campaign overview stay grounded.</p>
          <a href="/settings#sec-party" class="btn btn-primary dashboard-side-btn">Add Party Roster</a>
        </div>
      `;

    setupScrollFade(document.getElementById('dashboard-party-scroll'));
  }

  function setupScrollFade(scrollArea) {
    if (!scrollArea) return;
    const update = () => {
      const overflowing = scrollArea.scrollHeight - scrollArea.clientHeight > 4;
      const atBottom = scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 4;
      scrollArea.classList.toggle('show-fade', overflowing && !atBottom);
    };
    scrollArea.addEventListener('scroll', update, { passive: true });
    update();
  }

  function summarizeContinuity(items) {
    return (items || []).reduce((acc, session) => {
      acc.trackedSessions += 1;
      acc.worldChanges += session.continuity.worldStateChanges.length;
      acc.unresolvedThreads += session.continuity.unresolvedThreads.length;
      acc.npcUpdates += session.continuity.npcStatusChanges.length;
      acc.treasureRewards += session.continuity.treasureRewardsLog.length;
      return acc;
    }, {
      trackedSessions: 0,
      worldChanges: 0,
      unresolvedThreads: 0,
      npcUpdates: 0,
      treasureRewards: 0,
    });
  }

  function statCard(label, value, listHref, latest) {
    return `
      <div class="dashboard-stat-card">
        <a class="dashboard-stat-main" href="${listHref}">
          <div class="dashboard-stat-label">${label}</div>
          <div class="dashboard-stat-value">${value}</div>
        </a>
        ${latest
          ? `<a class="dashboard-stat-latest" href="${latest.href}" data-tooltip="${escHtml(latest.tooltip)}">Latest: ${escHtml(latest.title)}</a>`
          : `<p class="dashboard-stat-empty">No ${escHtml(label.toLowerCase())} yet.</p>`}
      </div>
    `;
  }

  function sideMetric(label, value) {
    return `
      <div class="dashboard-side-metric">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `;
  }

  function sessionLabel(session) {
    const numRaw = String(session.sessionNumber ?? '?');
    const num = numRaw.includes('.') ? numRaw : numRaw.padStart(3, '0');
    return `Session #${num}`;
  }

  function compareByRecentSession(a, b) {
    const aKey = `${a.date || ''}|${a.createdAt || ''}`;
    const bKey = `${b.date || ''}|${b.createdAt || ''}`;
    return bKey.localeCompare(aKey);
  }

  function compareByRecent(a, b) {
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
})();
