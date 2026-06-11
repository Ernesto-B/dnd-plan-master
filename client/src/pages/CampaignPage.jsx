import React, { useEffect, useMemo, useState } from 'react';
import AppLink from '../components/AppLink.jsx';
import EntityGraph from './campaign/EntityGraph.jsx';
import { wikiRender, wikiPreload } from '../lib/vanilla.js';

const WT = ({ text }) => <span dangerouslySetInnerHTML={{ __html: wikiRender(text) }} />;
const num = v => { const r = String(v ?? '?'); return r.includes('.') ? r : r.padStart(3, '0'); };
const sessionLabel = s => `Session #${num(s.sessionNumber)}`;
const sessionLabelId = s => `Session #${num(s.sessionNumber)} · ${s.id}`;
const fmtDate = d => d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
const byRecent = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
const byRecentSession = (a, b) => `${b.date || ''}|${b.createdAt || ''}`.localeCompare(`${a.date || ''}|${a.createdAt || ''}`);

function Tags({ tags, className }) {
  if (!tags || !tags.length) return null;
  return <div className={className}>{tags.map((t, i) => <span key={i} className={`tag-chip${String(t || '').trim().toLowerCase() === 'draft' ? ' is-draft' : ''}`}>{t}</span>)}</div>;
}

function SectionHeader({ n, title }) {
  return <div className="section-header compact"><span className="section-num">{n}</span><h2>{title}</h2></div>;
}

// ─── Dashboard (overview) ────────────────────────────────────────────────────
function StatCard({ label, value, listHref, latest }) {
  return (
    <div className="dashboard-stat-card">
      <AppLink className="dashboard-stat-main" to={listHref}>
        <div className="dashboard-stat-label">{label}</div>
        <div className="dashboard-stat-value">{value}</div>
      </AppLink>
      {latest
        ? <AppLink className="dashboard-stat-latest" to={latest.href} data-tooltip={latest.tooltip}>Latest: {latest.title}</AppLink>
        : <p className="dashboard-stat-empty">No {label.toLowerCase()} yet.</p>}
    </div>
  );
}

function Dashboard({ campaign, sessions, encounters, npcs, locations, factions, continuitySessions }) {
  const latestSession = [...sessions].sort(byRecentSession)[0];
  const latestEnc = [...encounters].sort(byRecent)[0];
  const latestNpc = [...npcs].sort(byRecent)[0];
  const latestLoc = [...locations].sort(byRecent)[0];
  const latestFac = [...factions].sort(byRecent)[0];
  const party = Array.isArray(campaign.partyRoster) ? campaign.partyRoster : [];
  const c = (continuitySessions || []).reduce((a, s) => ({
    trackedSessions: a.trackedSessions + 1,
    worldChanges: a.worldChanges + s.continuity.worldStateChanges.length,
    unresolvedThreads: a.unresolvedThreads + s.continuity.unresolvedThreads.length,
    npcUpdates: a.npcUpdates + s.continuity.npcStatusChanges.length,
    treasureRewards: a.treasureRewards + s.continuity.treasureRewardsLog.length,
  }), { trackedSessions: 0, worldChanges: 0, unresolvedThreads: 0, npcUpdates: 0, treasureRewards: 0 });

  return (
    <>
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <div className="dashboard-eyebrow">Current Campaign</div>
          <h1 className="page-title">{campaign.name || 'Campaign'}</h1>
          <p className="page-subtitle">{campaign.description || 'Your overview of the current campaign. Start here, then jump into sessions, encounters, NPCs, locations, factions, and continuity work from one place.'}</p>
          <div className="dashboard-hero-actions">
            <AppLink to="/form" className="btn btn-primary">New Session</AppLink>
            <AppLink to="/encounter/new" className="btn btn-ghost">New Encounter</AppLink>
            <AppLink to="/npc/new" className="btn btn-ghost">New NPC</AppLink>
            <AppLink to="/location/new" className="btn btn-ghost">New Location</AppLink>
            <AppLink to="/faction/new" className="btn btn-ghost">New Faction</AppLink>
            <AppLink to="/campaigns" className="btn btn-ghost">Manage Campaigns</AppLink>
          </div>
        </div>
        <div className="dashboard-hero-side card">
          <div className="dashboard-hero-side-label">Campaign Status</div>
          <div className="dashboard-hero-side-value">{sessions.length} session{sessions.length === 1 ? '' : 's'}</div>
          <p className="dashboard-hero-side-note">{party.length ? `${party.length} party member${party.length === 1 ? '' : 's'} in the current roster.` : 'No party roster yet. Add it in Settings when you are ready.'}</p>
        </div>
      </section>

      <section className="dashboard-grid">
        <StatCard label="Sessions" value={sessions.length} listHref="/sessions" latest={latestSession && { href: `/view/${latestSession.id}`, title: sessionLabel(latestSession), tooltip: latestSession.goal || 'No session goal recorded.' }} />
        <StatCard label="Encounters" value={encounters.length} listHref="/encounters" latest={latestEnc && { href: `/encounter/view/${latestEnc.id}`, title: latestEnc.name || latestEnc.id, tooltip: latestEnc.fiction || 'No encounter fiction recorded.' }} />
        <StatCard label="NPCs" value={npcs.length} listHref="/npcs" latest={latestNpc && { href: `/npc/view/${latestNpc.id}`, title: latestNpc.name || latestNpc.id, tooltip: latestNpc.situation || latestNpc.nickname || 'No current NPC situation recorded.' }} />
        <StatCard label="Locations" value={locations.length} listHref="/locations" latest={latestLoc && { href: `/location/view/${latestLoc.id}`, title: latestLoc.name || latestLoc.id, tooltip: latestLoc.description || 'No location description recorded.' }} />
        <StatCard label="Factions" value={factions.length} listHref="/factions" latest={latestFac && { href: `/faction/view/${latestFac.id}`, title: latestFac.name || latestFac.id, tooltip: latestFac.goal || latestFac.origin || 'No faction goal recorded.' }} />
      </section>

      <section className="dashboard-secondary-column">
        <SectionHeader n="01" title="Party Roster" />
        <div className="dashboard-side-stack">
          {party.length ? (
            <div className="dashboard-side-card card">
              <div className="dashboard-scroll-area">
                <div className="dashboard-party-list">
                  {party.map((m, i) => (
                    <div className="dashboard-party-item" key={i}>
                      <div className="dashboard-party-name">{m.name || 'Unnamed'}</div>
                      <div className="dashboard-party-meta">{m.playerClass || 'Class not set'}</div>
                      {m.characterUrl && <a className="dashboard-party-link" href={m.characterUrl} target="_blank" rel="noopener">Character Sheet ↗</a>}
                    </div>
                  ))}
                </div>
              </div>
              <a href="/settings#sec-party" className="btn btn-ghost dashboard-side-btn">Edit Party Roster</a>
            </div>
          ) : (
            <div className="dashboard-side-card card">
              <p className="dashboard-empty-copy">No party roster yet. Add the current adventuring party in Settings so encounter planning and campaign overview stay grounded.</p>
              <a href="/settings#sec-party" className="btn btn-primary dashboard-side-btn">Add Party Roster</a>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ─── Continuity (guide + stats + pickup + boards + timeline) ─────────────────
function Continuity({ continuitySessions, allSessions, graphData }) {
  const [query, setQuery] = useState('');
  const [expandedSet, setExpandedSet] = useState(null); // null = default (index 0 expanded)
  const sorted = useMemo(() => [...continuitySessions].sort((a, b) => {
    const d = (Number(b.sessionNumber) || 0) - (Number(a.sessionNumber) || 0);
    return d !== 0 ? d : String(b.date || '').localeCompare(String(a.date || ''));
  }), [continuitySessions]);

  const q = query.trim().toLowerCase();
  const blob = s => [s.id, s.goal, s.date, s.partyLevel, ...(s.tags || []), s.continuity.sessionRecap,
    ...(s.continuity.worldStateChanges || []), ...(s.continuity.unresolvedThreads || []),
    ...(s.continuity.npcStatusChanges || []), ...(s.continuity.treasureRewardsLog || [])].join(' ').toLowerCase();
  const items = q ? sorted.filter(s => blob(s).includes(q)) : sorted;
  const isFiltered = !!q;

  const untracked = allSessions.filter(su => !continuitySessions.some(s => s.id === su.id)).slice(0, 4);

  const totals = items.reduce((a, s) => ({
    sessions: a.sessions + 1,
    worldStateChanges: a.worldStateChanges + s.continuity.worldStateChanges.length,
    unresolvedThreads: a.unresolvedThreads + s.continuity.unresolvedThreads.length,
    npcStatusChanges: a.npcStatusChanges + s.continuity.npcStatusChanges.length,
    treasureRewardsLog: a.treasureRewardsLog + s.continuity.treasureRewardsLog.length,
  }), { sessions: 0, worldStateChanges: 0, unresolvedThreads: 0, npcStatusChanges: 0, treasureRewardsLog: 0 });

  const isExpanded = (id, idx) => expandedSet === null ? idx === 0 : expandedSet.has(id);
  const toggleSession = (id) => {
    setExpandedSet(prev => {
      const base = prev ?? new Set(items.length ? [items[0].id] : []);
      const next = new Set(base);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const expandAll = () => setExpandedSet(new Set(items.map(s => s.id)));
  const collapseAll = () => setExpandedSet(new Set());

  const boardDefs = [
    { key: 'worldStateChanges', title: 'World-State Changes', empty: 'No world-state changes logged yet.' },
    { key: 'unresolvedThreads', title: 'Unresolved Threads', empty: 'No unresolved threads logged yet.' },
    { key: 'npcStatusChanges', title: 'NPC Status Changes', empty: 'No NPC status changes logged yet.' },
    { key: 'treasureRewardsLog', title: 'Treasure & Rewards', empty: 'No rewards logged yet.' },
  ];

  // Pickup data
  const latest = sorted[0];
  const recentNodeIds = new Set(sorted.slice(0, 2).map(s => `session:${s.id}`));
  const pickN = { faction: [], npc: [], location: [] };
  for (const node of graphData.nodes) {
    if (!['faction', 'npc', 'location'].includes(node.entityType)) continue;
    if (!(node.links || []).some(l => recentNodeIds.has(l))) continue;
    pickN[node.entityType].push(node);
  }
  const threads = [];
  for (const s of sorted) {
    for (const t of s.continuity.unresolvedThreads || []) { threads.push({ text: t, session: s }); if (threads.length >= 5) break; }
    if (threads.length >= 5) break;
  }

  return (
    <>
      <div className="campaign-hero">
        <div className="campaign-hero-top">
          <div>
            <h1 className="page-title">Campaign Continuity</h1>
            <p className="page-subtitle">Review what changed, what is still unresolved, and what the party has earned across the whole campaign.</p>
          </div>
          <AppLink to="/map" className="btn btn-ghost btn-sm">World Map</AppLink>
        </div>
        <div className="campaign-search-wrap">
          <input type="search" className="search-input campaign-search-input" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search recap, threads, NPC updates, rewards, tags, or session goal…" />
        </div>
      </div>

      <div id="campaign-guide" className="campaign-guide">
        <div className="campaign-guide-card">
          <div className="campaign-guide-head">
            <div>
              <div className="campaign-guide-title">How This Page Works</div>
              <p className="campaign-guide-copy">{continuitySessions.length
                ? 'This page fills automatically from the Campaign Continuity section inside each Session Plan. Update those session fields, then return here to see the rollup.'
                : 'This page stays empty until you fill the Campaign Continuity section inside at least one Session Plan. You do not manually link sessions to Campaign right now.'}</p>
            </div>
            <div className="campaign-guide-actions">
              <a href="/form#s-continuity" className="btn btn-primary">New Session with Continuity</a>
              <AppLink to="/sessions" className="btn btn-ghost">Browse Sessions</AppLink>
            </div>
          </div>
          {untracked.length > 0 && (
            <div className="campaign-guide-block">
              <div className="campaign-guide-label">Quick Add From Existing Sessions</div>
              <div className="campaign-guide-links">
                {untracked.map(s => (
                  <a key={s.id} className="campaign-guide-link" href={`/form?edit=${encodeURIComponent(s.id)}#s-continuity`}>
                    Session #{num(s.sessionNumber)}{s.goal ? ` - ${s.goal}` : ''}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="campaign-stats">
        {[['Tracked Sessions', totals.sessions], ['World Changes', totals.worldStateChanges], ['Open Threads', totals.unresolvedThreads], ['NPC Updates', totals.npcStatusChanges], ['Rewards Logged', totals.treasureRewardsLog]].map(([l, v]) => (
          <div className="campaign-stat-card" key={l}><div className="campaign-stat-label">{l}</div><div className="campaign-stat-value">{v}</div></div>
        ))}
      </div>

      {latest && (
        <div>
          <div className="campaign-pickup card">
            <div className="campaign-pickup-head">
              <div className="campaign-mini-label">Pick Up Next</div>
              <h2 className="campaign-pickup-title">
                Last played <AppLink className="campaign-session-link" to={`/view/${latest.id}`}>{sessionLabel(latest)}</AppLink>
                {latest.date && <span className="campaign-pickup-date">{fmtDate(latest.date)}</span>}
              </h2>
            </div>
            <div className="campaign-pickup-grid">
              {[['Factions To Watch', pickN.faction, 'No factions are linked to your most recent sessions yet.'],
                ['NPCs To Revisit', pickN.npc, 'No NPCs are linked to your most recent sessions yet.'],
                ['Locations To Revisit', pickN.location, 'No locations are linked to your most recent sessions yet.']].map(([title, nodes, empty]) => (
                <section className="campaign-mini-card" key={title}>
                  <div className="campaign-mini-label">{title}</div>
                  {nodes.length
                    ? <div className="campaign-pickup-chips">{nodes.map(n => <AppLink key={n.id} className="campaign-pickup-chip" to={n.url}>{n.label}</AppLink>)}</div>
                    : <p className="campaign-mini-empty">{empty}</p>}
                </section>
              ))}
              <section className="campaign-mini-card campaign-pickup-threads">
                <div className="campaign-mini-label">Open Threads · Newest First</div>
                {threads.length
                  ? <div className="campaign-mini-list">{threads.map((t, i) => (
                      <div className="campaign-mini-item" key={i}><WT text={t.text} /> <AppLink className="campaign-board-meta campaign-board-meta-link" to={`/view/${t.session.id}`}>{sessionLabel(t.session)}</AppLink></div>
                    ))}</div>
                  : <p className="campaign-mini-empty">No unresolved threads logged yet.</p>}
              </section>
            </div>
          </div>
        </div>
      )}

      <div className="campaign-layout">
        <section className="campaign-column">
          <SectionHeader n="01" title="Continuity Boards" />
          <div className="campaign-boards">
            {!items.length
              ? <div className="empty-state"><p>{isFiltered ? 'No campaign notes match your search.' : 'No continuity notes yet.'}</p></div>
              : boardDefs.map(def => {
                  const entries = items.flatMap(s => s.continuity[def.key].map(text => ({ text, session: s })));
                  return (
                    <div className="campaign-board card" key={def.key}>
                      <div className="campaign-board-head"><span>{def.title}</span><span className="campaign-board-count">{entries.length}</span></div>
                      <div className="campaign-board-list">
                        {entries.length
                          ? entries.map((e, i) => (
                              <div className="campaign-board-item" key={i}>
                                <span className="campaign-board-text"><WT text={e.text} /></span>
                                <AppLink className="campaign-board-meta campaign-board-meta-link" to={`/view/${e.session.id}`}>{sessionLabel(e.session)}</AppLink>
                              </div>
                            ))
                          : <p className="campaign-board-empty">{def.empty}</p>}
                      </div>
                    </div>
                  );
                })}
          </div>
        </section>

        <section className="campaign-column">
          <div className="campaign-tl-header">
            <SectionHeader n="02" title="Session Timeline" />
            {items.length > 1 && (
              <div className="campaign-tl-controls">
                <button className="btn btn-ghost btn-sm" onClick={expandAll}>Expand All</button>
                <button className="btn btn-ghost btn-sm" onClick={collapseAll}>Collapse All</button>
              </div>
            )}
          </div>
          <div className="campaign-timeline">
            {!items.length
              ? <div className="empty-state"><p>{isFiltered ? 'No sessions match your search.' : 'No continuity sessions yet.'}</p></div>
              : items.map((s, i) => {
                  const expanded = isExpanded(s.id, i);
                  const prev = i > 0 ? items[i - 1] : null;
                  const showLevel = prev && prev.partyLevel && s.partyLevel &&
                    Number(prev.partyLevel) > Number(s.partyLevel);
                  return (
                    <React.Fragment key={s.id}>
                      {showLevel && (
                        <div className="campaign-tl-level-marker">
                          <span className="campaign-tl-level-badge">▲ Party reached Level {prev.partyLevel}</span>
                        </div>
                      )}
                      <div className={`campaign-tl-node${i === 0 ? ' campaign-tl-node--latest' : ''}`}>
                        <div className="campaign-tl-dot" />
                        <article className="campaign-session card">
                          <div className="campaign-session-toggle" onClick={() => toggleSession(s.id)}>
                            <div className="campaign-session-head">
                              <div>
                                <AppLink className="campaign-session-link" to={`/view/${s.id}`} onClick={e => e.stopPropagation()}>{sessionLabel(s)}</AppLink>
                                <div className="campaign-session-sub">{s.goal || 'No session goal recorded.'}</div>
                              </div>
                              <div className="campaign-session-meta">
                                {s.date && <span>{fmtDate(s.date)}</span>}
                                {s.partyLevel && <span>Lv {String(s.partyLevel)}</span>}
                                <span className={`campaign-tl-chevron${expanded ? ' is-open' : ''}`}>▸</span>
                              </div>
                            </div>
                            <Tags tags={s.tags} className="campaign-session-tags" />
                          </div>
                          {expanded && (
                            <div className="campaign-session-body">
                              {s.continuity.sessionRecap && (
                                <div className="campaign-session-recap"><div className="campaign-mini-label">Session Recap</div><p><WT text={s.continuity.sessionRecap} /></p></div>
                              )}
                              <div className="campaign-session-grid">
                                {[['World-State Changes', s.continuity.worldStateChanges, 'No world-state changes noted.'],
                                  ['Unresolved Threads', s.continuity.unresolvedThreads, 'No unresolved threads noted.'],
                                  ['NPC Status Changes', s.continuity.npcStatusChanges, 'No NPC updates noted.'],
                                  ['Treasure & Rewards', s.continuity.treasureRewardsLog, 'No rewards logged.']].map(([title, list, empty]) => (
                                  <section className="campaign-mini-card" key={title}>
                                    <div className="campaign-mini-label">{title}</div>
                                    {list.length
                                      ? <div className="campaign-mini-list">{list.map((it, j) => <div className="campaign-mini-item" key={j}><WT text={it} /></div>)}</div>
                                      : <p className="campaign-mini-empty">{empty}</p>}
                                  </section>
                                ))}
                              </div>
                            </div>
                          )}
                        </article>
                      </div>
                    </React.Fragment>
                  );
                })}
          </div>
        </section>
      </div>
    </>
  );
}

export default function CampaignPage() {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      const j = (url, fb) => fetch(url).then(r => r.ok ? r.json() : fb).catch(() => fb);
      try {
        await wikiPreload();
        const campaign = await j('/api/campaigns/active', null);
        if (!campaign) throw new Error('Could not load current campaign');
        const [sessions, encounters, npcs, locations, factions, continuitySessions, graphData] = await Promise.all([
          j('/api/sessions', []), j('/api/encounters', []), j('/api/npcs', []),
          j('/api/locations', []), j('/api/factions', []), j('/api/sessions/campaign', []),
          j('/api/search/entity-graph', { nodes: [], edges: [] }),
        ]);
        if (!alive) return;
        document.title = `${campaign.name || 'Campaign'} — D&D Session Master`;
        setState({ loading: false, error: null, data: { campaign, sessions, encounters, npcs, locations, factions, continuitySessions, graphData } });
      } catch (err) { if (alive) setState({ loading: false, error: err.message, data: null }); }
    })();
    return () => { alive = false; };
  }, []);

  if (state.loading) return <div className="container wide"><div className="empty-state"><p>Loading current campaign…</p></div></div>;
  if (state.error) return <div className="container wide"><div className="empty-state"><p>{state.error}</p></div></div>;

  const d = state.data;
  return (
    <div className="container wide campaign-page dashboard-page">
      <Dashboard {...d} />
      <Continuity continuitySessions={d.continuitySessions} allSessions={d.sessions} graphData={d.graphData} />
      <section className="campaign-connections-section">
        <SectionHeader n="03" title="Entity Connections" />
        <p className="campaign-connections-note">Search for any session, encounter, NPC, location, faction, tag, or note. The explorer will show your matches plus the directly linked records that matter for running the game.</p>
        <EntityGraph graphData={d.graphData} />
      </section>
    </div>
  );
}
