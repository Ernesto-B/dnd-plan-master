(async function () {
  const guideEl = document.getElementById('campaign-guide');
  const statsEl = document.getElementById('campaign-stats');
  const boardsEl = document.getElementById('campaign-boards');
  const timelineEl = document.getElementById('campaign-timeline');
  const pickupEl = document.getElementById('campaign-pickup');
  const searchEl = document.getElementById('campaign-search');
  const graphSearchEl = document.getElementById('entity-graph-search');
  const graphMapEl = document.getElementById('entity-graph-map');
  const graphDetailEl = document.getElementById('entity-graph-detail');
  const graphSummaryEl = document.getElementById('entity-graph-summary');

  let sessions = [];
  let allSessions = [];
  let graphData = { nodes: [], edges: [] };
  let graphFilterType = 'all';
  let graphQuery = '';
  let selectedGraphNodeId = null;

  if (window.WikiLinks) {
    try { await window.WikiLinks.preload(); } catch {}
  }

  try {
    const summaryRes = await fetch('/api/sessions');
    if (summaryRes.ok) {
      allSessions = await summaryRes.json();
    }
  } catch {
    allSessions = [];
  }

  try {
    const graphRes = await fetch('/api/search/entity-graph');
    if (graphRes.ok) {
      graphData = await graphRes.json();
    }
  } catch {
    graphData = { nodes: [], edges: [] };
  }

  try {
    const res = await fetch('/api/sessions/campaign');
    if (!res.ok) throw new Error('Could not load campaign continuity');
    sessions = await res.json();
  } catch (err) {
    renderGuide([], allSessions, true);
    boardsEl.innerHTML = `<div class="empty-state"><p>${escHtml(err.message)}</p></div>`;
    timelineEl.innerHTML = '';
    pickupEl.innerHTML = '';
    return;
  }

  renderGuide(sessions, allSessions, false);
  initEntityConnections();

  if (!sessions.length) {
    renderStats([]);
    boardsEl.innerHTML = `
      <div class="empty-state campaign-empty">
        <p>No continuity notes are showing yet.</p>
        <div class="campaign-empty-actions">
          <a href="/form#s-continuity" class="btn btn-primary">Create a Session with Continuity</a>
          <a href="/sessions" class="btn btn-ghost">Open Sessions List</a>
        </div>
      </div>`;
    timelineEl.innerHTML = '';
    pickupEl.innerHTML = '';
    return;
  }

  sessions.sort((a, b) => {
    const numA = Number(a.sessionNumber) || 0;
    const numB = Number(b.sessionNumber) || 0;
    if (numA !== numB) return numB - numA;
    return String(b.date || '').localeCompare(String(a.date || ''));
  });

  render(sessions);
  renderPickup(sessions);
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

  function initEntityConnections() {
    if (!graphMapEl || !graphDetailEl) return;

    graphSearchEl.addEventListener('input', () => {
      graphQuery = graphSearchEl.value.trim().toLowerCase();
      if (selectedGraphNodeId && !graphData.nodes.find(node => node.id === selectedGraphNodeId)) {
        selectedGraphNodeId = null;
      }
      renderEntityConnections();
    });

    document.querySelectorAll('#entity-graph-filters [data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        graphFilterType = btn.dataset.type;
        document.querySelectorAll('#entity-graph-filters [data-type]').forEach(chip => {
          chip.classList.toggle('active', chip.dataset.type === graphFilterType);
        });
        renderEntityConnections();
      });
    });

    renderEntityConnections();
  }

  function renderEntityConnections() {
    const nodesById = new Map(graphData.nodes.map(node => [node.id, node]));
    const matches = graphData.nodes.filter(node => {
      const typeMatch = graphFilterType === 'all' || node.entityType === graphFilterType;
      const queryMatch = !graphQuery || node.searchText.includes(graphQuery);
      return typeMatch && queryMatch;
    });

    if (selectedGraphNodeId && !nodesById.has(selectedGraphNodeId)) {
      selectedGraphNodeId = null;
    }

    const visibleIds = getVisibleGraphNodeIds(matches, nodesById);
    const visibleNodes = [...visibleIds].map(id => nodesById.get(id)).filter(Boolean);
    const matchedIds = new Set(matches.map(node => node.id));
    const selectedNode = selectedGraphNodeId ? nodesById.get(selectedGraphNodeId) : null;
    const selectedLinks = new Set(selectedNode?.links || []);
    const relatedCount = visibleNodes.filter(node => !matchedIds.has(node.id)).length;

    graphSummaryEl.textContent = visibleNodes.length
      ? graphQuery || graphFilterType !== 'all'
        ? `${matches.length} match${matches.length === 1 ? '' : 'es'} · ${relatedCount} directly linked record${relatedCount === 1 ? '' : 's'}`
        : `${visibleNodes.length} visible entities · browse the most connected records`
      : 'No matching entities.';

    if (!visibleNodes.length) {
      graphMapEl.innerHTML = `
        <div class="campaign-graph-empty">
          <p>No entities match this search.</p>
          <button type="button" class="btn btn-ghost" id="btn-clear-entity-search">Clear Filters</button>
        </div>
      `;
      graphDetailEl.innerHTML = `
        <div class="campaign-graph-placeholder">
          <div class="campaign-guide-label">No Selection</div>
          <p>Clear the search or switch filters to explore the relationship table again.</p>
        </div>
      `;
      const clearBtn = document.getElementById('btn-clear-entity-search');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          graphQuery = '';
          graphFilterType = 'all';
          graphSearchEl.value = '';
          document.querySelectorAll('#entity-graph-filters [data-type]').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.type === 'all');
          });
          renderEntityConnections();
        });
      }
      return;
    }

    const groups = {
      session: visibleNodes.filter(node => node.entityType === 'session').sort(compareGraphNodes),
      faction: visibleNodes.filter(node => node.entityType === 'faction').sort(compareGraphNodes),
      npc: visibleNodes.filter(node => node.entityType === 'npc').sort(compareGraphNodes),
      encounter: visibleNodes.filter(node => node.entityType === 'encounter').sort(compareGraphNodes),
      location: visibleNodes.filter(node => node.entityType === 'location').sort(compareGraphNodes),
    };

    graphMapEl.innerHTML = ['session', 'faction', 'npc', 'encounter', 'location'].map(type => `
      <section class="graph-column graph-column-${type}">
        <div class="graph-column-head">${graphTypeLabel(type, true)}</div>
        <div class="graph-column-list">
          ${groups[type].length
            ? groups[type].map(node => {
                const isSelected = node.id === selectedGraphNodeId;
                const isMatched = matchedIds.has(node.id);
                const isLinked = selectedNode ? selectedLinks.has(node.id) : false;
                const isDimmed = selectedNode && !isSelected && !isLinked;
                return `
                  <button type="button"
                    class="graph-node${isSelected ? ' selected' : ''}${isMatched ? ' matched' : ''}${isLinked ? ' linked' : ''}${isDimmed ? ' dimmed' : ''}"
                    data-node-id="${escHtml(node.id)}">
                    <span class="graph-node-title">${escHtml(node.label)}</span>
                    <span class="graph-node-meta">${escHtml(node.subtitle || node.rawId)}</span>
                    <span class="graph-node-foot">
                      <span class="graph-node-badge">${node.connectionCount} link${node.connectionCount === 1 ? '' : 's'}</span>
                      ${node.tags?.length ? `<span class="graph-node-tags">${node.tags.slice(0, 2).map(tag => escHtml(tag)).join(' · ')}</span>` : ''}
                    </span>
                  </button>
                `;
              }).join('')
            : `<div class="graph-column-empty">No ${type}s in this view.</div>`}
        </div>
      </section>
    `).join('');

    graphMapEl.querySelectorAll('.graph-node').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedGraphNodeId = btn.dataset.nodeId === selectedGraphNodeId ? null : btn.dataset.nodeId;
        renderEntityConnections();
      });
    });

    renderGraphDetail(selectedNode, nodesById);
  }

  function getVisibleGraphNodeIds(matches, nodesById) {
    const visible = new Set();

    if (selectedGraphNodeId && nodesById.has(selectedGraphNodeId)) {
      visible.add(selectedGraphNodeId);
      const selectedNode = nodesById.get(selectedGraphNodeId);
      for (const neighborId of selectedNode.links || []) visible.add(neighborId);

      if (graphQuery || graphFilterType !== 'all') {
        matches.forEach(node => visible.add(node.id));
      }
      return visible;
    }

    if (graphQuery || graphFilterType !== 'all') {
      matches.forEach(node => {
        visible.add(node.id);
        (node.links || []).forEach(linkId => visible.add(linkId));
      });
      return visible;
    }

    const grouped = {
      session: matches.filter(node => node.entityType === 'session').sort(compareGraphNodes),
      faction: matches.filter(node => node.entityType === 'faction').sort(compareGraphNodes),
      npc: matches.filter(node => node.entityType === 'npc').sort(compareGraphNodes),
      encounter: matches.filter(node => node.entityType === 'encounter').sort(compareGraphNodes),
      location: matches.filter(node => node.entityType === 'location').sort(compareGraphNodes),
    };

    const limit = 7;
    ['session', 'faction', 'npc', 'encounter', 'location'].forEach(type => {
      grouped[type].slice(0, limit).forEach(node => visible.add(node.id));
    });

    return visible;
  }

  function graphTypeLabel(type, plural) {
    const labels = {
      session: ['Session', 'Sessions'],
      faction: ['Faction', 'Factions'],
      npc: ['NPC', 'NPCs'],
      encounter: ['Encounter', 'Encounters'],
      location: ['Location', 'Locations'],
    };
    const pair = labels[type] || [type, `${type}s`];
    return plural ? pair[1] : pair[0];
  }

  function compareGraphNodes(a, b) {
    if (b.connectionCount !== a.connectionCount) return b.connectionCount - a.connectionCount;
    return String(a.label).localeCompare(String(b.label));
  }

  function renderGraphDetail(selectedNode, nodesById) {
    if (!selectedNode) {
      const topConnected = [...graphData.nodes]
        .sort(compareGraphNodes)
        .slice(0, 5)
        .map(node => `
          <button type="button" class="graph-detail-link" data-focus-node="${escHtml(node.id)}">
            <span>${escHtml(node.label)}</span>
            <span>${node.connectionCount} links</span>
          </button>
        `).join('');

      graphDetailEl.innerHTML = `
        <div class="campaign-graph-placeholder">
          <div class="campaign-guide-label">Select an Entity</div>
          <p>Search to narrow the explorer, then click any card to inspect its connected sessions, factions, encounters, NPCs, and locations.</p>
          <div class="campaign-guide-label" style="margin-top:16px;">Good Starting Points</div>
          <div class="graph-detail-links">${topConnected}</div>
        </div>
      `;
      graphDetailEl.querySelectorAll('[data-focus-node]').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedGraphNodeId = btn.dataset.focusNode;
          renderEntityConnections();
        });
      });
      return;
    }

    const groupedLinks = {
      session: [],
      faction: [],
      npc: [],
      encounter: [],
      location: [],
    };
    (selectedNode.links || []).forEach(linkId => {
      const linked = nodesById.get(linkId);
      if (linked && groupedLinks[linked.entityType]) groupedLinks[linked.entityType].push(linked);
    });
    Object.keys(groupedLinks).forEach(type => groupedLinks[type].sort(compareGraphNodes));

    graphDetailEl.innerHTML = `
      <div class="graph-detail-card">
        <div class="graph-detail-head">
          <div>
            <div class="graph-detail-type">${graphTypeLabel(selectedNode.entityType, false)}</div>
            <h3 class="graph-detail-title">${escHtml(selectedNode.label)}</h3>
            <p class="graph-detail-copy">${escHtml(selectedNode.subtitle || 'No additional summary available.')}</p>
          </div>
          <button type="button" class="btn btn-ghost" id="btn-clear-graph-selection">Clear</button>
        </div>
        <div class="graph-detail-meta">
          <a href="${escHtml(selectedNode.url)}" class="btn btn-primary">Open Record</a>
          <span class="graph-node-badge">${selectedNode.connectionCount} direct link${selectedNode.connectionCount === 1 ? '' : 's'}</span>
          ${selectedNode.tags?.length ? `<div class="graph-detail-tags">${selectedNode.tags.map(tag => `<span class="tag-chip${String(tag || '').trim().toLowerCase() === 'draft' ? ' is-draft' : ''}">${escHtml(tag)}</span>`).join('')}</div>` : ''}
        </div>
        ${renderGraphDetailSection('Connected Sessions', groupedLinks.session)}
        ${renderGraphDetailSection('Connected Factions', groupedLinks.faction)}
        ${renderGraphDetailSection('Connected NPCs', groupedLinks.npc)}
        ${renderGraphDetailSection('Connected Encounters', groupedLinks.encounter)}
        ${renderGraphDetailSection('Connected Locations', groupedLinks.location)}
      </div>
    `;

    const clearBtn = document.getElementById('btn-clear-graph-selection');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        selectedGraphNodeId = null;
        renderEntityConnections();
      });
    }
    graphDetailEl.querySelectorAll('[data-focus-node]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedGraphNodeId = btn.dataset.focusNode;
        renderEntityConnections();
      });
    });
  }

  function renderGraphDetailSection(title, items) {
    return `
      <section class="graph-detail-section">
        <div class="campaign-guide-label">${title}</div>
        ${items.length
          ? `<div class="graph-detail-links">${items.map(item => `
              <button type="button" class="graph-detail-link" data-focus-node="${escHtml(item.id)}">
                <span>${escHtml(item.label)}</span>
                <span>${item.connectionCount} links</span>
              </button>
            `).join('')}</div>`
          : `<p class="campaign-mini-empty">No ${title.toLowerCase()}.</p>`}
      </section>
    `;
  }

  function renderGuide(trackedSessions, sessionSummaries, isError) {
    if (isError) {
      guideEl.innerHTML = '';
      return;
    }

    const untracked = sessionSummaries
      .filter(summary => !trackedSessions.some(session => session.id === summary.id))
      .slice(0, 4);

    const helperCopy = trackedSessions.length
      ? 'This page fills automatically from the Campaign Continuity section inside each Session Plan. Update those session fields, then return here to see the rollup.'
      : 'This page stays empty until you fill the Campaign Continuity section inside at least one Session Plan. You do not manually link sessions to Campaign right now.';

    const untrackedBlock = untracked.length
      ? `
        <div class="campaign-guide-block">
          <div class="campaign-guide-label">Quick Add From Existing Sessions</div>
          <div class="campaign-guide-links">
            ${untracked.map(session => `
              <a class="campaign-guide-link" href="/form?edit=${encodeURIComponent(session.id)}#s-continuity">
                ${sessionGuideLabel(session)}
              </a>
            `).join('')}
          </div>
        </div>`
      : '';

    const emptyStateSteps = `
      <div class="campaign-guide-steps">
        <div class="campaign-guide-step">
          <span class="campaign-guide-step-num">1</span>
          <div>
            <div class="campaign-guide-label">Open or create a Session Plan</div>
            <div class="campaign-guide-note">Campaign is currently a single automatic rollup across all sessions, not a separate manual campaign-linking system.</div>
          </div>
        </div>
        <div class="campaign-guide-step">
          <span class="campaign-guide-step-num">2</span>
          <div>
            <div class="campaign-guide-label">Fill the Campaign Continuity section</div>
            <div class="campaign-guide-note">The fields that feed this page are Session Recap, World-State Changes, Unresolved Threads, NPC Status Changes, and Treasure & Rewards Log.</div>
          </div>
        </div>
        <div class="campaign-guide-step">
          <span class="campaign-guide-step-num">3</span>
          <div>
            <div class="campaign-guide-label">Save the session and come back here</div>
            <div class="campaign-guide-note">The stats, continuity boards, and timeline update automatically once those fields exist.</div>
          </div>
        </div>
      </div>`;

    guideEl.innerHTML = `
      <div class="campaign-guide-card">
        <div class="campaign-guide-head">
          <div>
            <div class="campaign-guide-title">How This Page Works</div>
            <p class="campaign-guide-copy">${helperCopy}</p>
          </div>
          <div class="campaign-guide-actions">
            <a href="/form#s-continuity" class="btn btn-primary">New Session with Continuity</a>
            <a href="/sessions" class="btn btn-ghost">Browse Sessions</a>
          </div>
        </div>
        ${trackedSessions.length ? '' : emptyStateSteps}
        ${untrackedBlock}
      </div>
    `;
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
            <div class="campaign-board-item">
              <span class="campaign-board-text">${renderWikiText(entry.text)}</span>
              <a class="campaign-board-meta campaign-board-meta-link" href="/view/${entry.session.id}">${sessionLabel(entry.session)}</a>
            </div>
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

  function renderPickup(items) {
    if (!pickupEl) return;
    if (!items.length) {
      pickupEl.innerHTML = '';
      return;
    }

    const latest = items[0];
    const recentSessions = items.slice(0, 2);
    const recentNodeIds = new Set(recentSessions.map(session => `session:${session.id}`));

    const factionNodes = [];
    const npcNodes = [];
    const locationNodes = [];
    for (const node of graphData.nodes) {
      if (!['faction', 'npc', 'location'].includes(node.entityType)) continue;
      if (!(node.links || []).some(linkId => recentNodeIds.has(linkId))) continue;
      if (node.entityType === 'faction') factionNodes.push(node);
      else if (node.entityType === 'npc') npcNodes.push(node);
      else locationNodes.push(node);
    }

    const threads = [];
    for (const session of items) {
      for (const text of session.continuity.unresolvedThreads || []) {
        threads.push({ text, session });
        if (threads.length >= 5) break;
      }
      if (threads.length >= 5) break;
    }

    pickupEl.innerHTML = `
      <div class="campaign-pickup card">
        <div class="campaign-pickup-head">
          <div class="campaign-mini-label">Pick Up Next</div>
          <h2 class="campaign-pickup-title">
            Last played
            <a class="campaign-session-link" href="/view/${latest.id}">${sessionLabel(latest)}</a>
            ${latest.date ? `<span class="campaign-pickup-date">${formatDate(latest.date)}</span>` : ''}
          </h2>
        </div>
        <div class="campaign-pickup-grid">
          ${renderPickupChips('Factions To Watch', factionNodes, 'No factions are linked to your most recent sessions yet.')}
          ${renderPickupChips('NPCs To Revisit', npcNodes, 'No NPCs are linked to your most recent sessions yet.')}
          ${renderPickupChips('Locations To Revisit', locationNodes, 'No locations are linked to your most recent sessions yet.')}
          <section class="campaign-mini-card campaign-pickup-threads">
            <div class="campaign-mini-label">Open Threads · Newest First</div>
            ${threads.length
              ? `<div class="campaign-mini-list">${threads.map(thread => `
                  <div class="campaign-mini-item">
                    ${renderWikiText(thread.text)}
                    <a class="campaign-board-meta campaign-board-meta-link" href="/view/${thread.session.id}">${sessionLabel(thread.session)}</a>
                  </div>
                `).join('')}</div>`
              : `<p class="campaign-mini-empty">No unresolved threads logged yet.</p>`}
          </section>
        </div>
      </div>
    `;
  }

  function renderPickupChips(title, nodes, emptyText) {
    return `
      <section class="campaign-mini-card">
        <div class="campaign-mini-label">${title}</div>
        ${nodes.length
          ? `<div class="campaign-pickup-chips">${nodes.map(node => `
              <a class="campaign-pickup-chip" href="${node.url}">${escHtml(node.label)}</a>
            `).join('')}</div>`
          : `<p class="campaign-mini-empty">${emptyText}</p>`}
      </section>
    `;
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
            <p>${renderWikiText(session.continuity.sessionRecap)}</p>
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

function sessionGuideLabel(session) {
  const numRaw = String(session.sessionNumber ?? '?');
  const num = numRaw.includes('.') ? numRaw : numRaw.padStart(3, '0');
  const goal = session.goal ? ` - ${session.goal}` : '';
  return `Session #${escHtml(num)}${escHtml(goal)}`;
}

  function renderSessionListCard(title, items, emptyText) {
    return `
    <section class="campaign-mini-card">
      <div class="campaign-mini-label">${title}</div>
      ${items.length
        ? `<div class="campaign-mini-list">${items.map(item => renderCampaignMiniItem(item)).join('')}</div>`
        : `<p class="campaign-mini-empty">${emptyText}</p>`}
    </section>
  `;
  }

  function renderCampaignMiniItem(text) {
    const raw = String(text || '');
    return `<div class="campaign-mini-item">${renderWikiText(raw)}</div>`;
  }

  function renderWikiText(text) {
    if (window.WikiLinks?.render) return window.WikiLinks.render(text);
    return escHtml(text);
  }

function renderTags(tags) {
  if (!tags || !tags.length) return '';
  return `<div class="campaign-session-tags">${tags.map(tag => `<span class="tag-chip${String(tag || '').trim().toLowerCase() === 'draft' ? ' is-draft' : ''}">${escHtml(tag)}</span>`).join('')}</div>`;
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
