import React, { useEffect, useMemo, useState } from 'react';
import AppLink from '../components/AppLink.jsx';
import { wikiRender, wikiPreload } from '../lib/vanilla.js';

const WT = ({ text }) => <span dangerouslySetInnerHTML={{ __html: wikiRender(text) }} />;
const num = v => { const r = String(v ?? '?'); return r.includes('.') ? r : r.padStart(3, '0'); };
const sessionLabel = s => `Session #${num(s.sessionNumber)}`;
const fmtDate = d => d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
const byRecentSession = (a, b) => `${b.date || ''}|${b.createdAt || ''}`.localeCompare(`${a.date || ''}|${a.createdAt || ''}`);
const byRecent = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
const byContinuityOrder = (a, b) => {
  const d = (Number(b.sessionNumber) || 0) - (Number(a.sessionNumber) || 0);
  return d !== 0 ? d : String(b.date || '').localeCompare(String(a.date || ''));
};

function Tags({ tags, className }) {
  if (!tags || !tags.length) return null;
  return (
    <div className={className}>
      {tags.map((t, i) => (
        <span key={i} className={`tag-chip${String(t || '').trim().toLowerCase() === 'draft' ? ' is-draft' : ''}`}>{t}</span>
      ))}
    </div>
  );
}

function SectionHeader({ n, title, action }) {
  return (
    <div className="section-header compact gm-section-header">
      <span className="section-num">{n}</span>
      <h2>{title}</h2>
      {action && <div className="gm-section-action">{action}</div>}
    </div>
  );
}

// ── Section 1: Campaign Header ────────────────────────────────────────────────
function CampaignHeader({ campaign, sessions, latestSession, continuitySessions }) {
  const party = Array.isArray(campaign.partyRoster) ? campaign.partyRoster : [];

  return (
    <section className="gm-campaign-header">
      <div className="gm-campaign-header-main dashboard-hero-copy">
        <div className="dashboard-eyebrow">Current Campaign</div>
        <h1 className="page-title">{campaign.name || 'Campaign'}</h1>
        {campaign.description && <p className="page-subtitle">{campaign.description}</p>}
        <div className="gm-header-stats">
          <span className="gm-header-stat"><strong>{sessions.length}</strong> sessions</span>
          <span className="gm-header-stat"><strong>{continuitySessions.length}</strong> tracked</span>
          {party.length > 0 && <span className="gm-header-stat"><strong>{party.length}</strong> party members</span>}
        </div>
        <div className="dashboard-hero-actions">
          <AppLink to="/form" className="btn btn-primary">New Session</AppLink>
          {latestSession && <AppLink to={`/run/${latestSession.id}`} className="btn btn-ghost">Run Latest Session</AppLink>}
          <AppLink to="/graph" className="btn btn-ghost">Open Graph</AppLink>
          <AppLink to="/map" className="btn btn-ghost">Open Map</AppLink>
          <AppLink to="/campaigns" className="btn btn-ghost">Manage Campaigns</AppLink>
        </div>
      </div>
      {party.length > 0 && (
        <div className="gm-party-card card">
          <div className="gm-party-label">Party Roster</div>
          <div className="gm-party-list">
            {party.map((m, i) => (
              <div key={i} className="gm-party-item">
                <span className="gm-party-name">{m.name || 'Unnamed'}</span>
                {m.playerClass && <span className="gm-party-class">{m.playerClass}</span>}
                {m.characterUrl && (
                  <a href={m.characterUrl} target="_blank" rel="noopener" className="gm-party-link">Sheet ↗</a>
                )}
              </div>
            ))}
          </div>
          <AppLink to="/settings" className="btn btn-ghost btn-sm gm-party-edit">Edit Roster</AppLink>
        </div>
      )}
    </section>
  );
}

// ── Section 2: Pick Up Next (hero section) ────────────────────────────────────
function PickUpNext({ continuitySessions, graphData }) {
  const sorted = useMemo(() => [...continuitySessions].sort(byContinuityOrder), [continuitySessions]);
  const latest = sorted[0];

  if (!latest) {
    return (
      <div className="gm-pickup-empty card">
        <p className="campaign-mini-empty">No continuity sessions yet. Fill the Campaign Continuity section in a Session Plan to see your "Pick Up Next" summary here.</p>
        <AppLink to="/form" className="btn btn-primary">New Session with Continuity</AppLink>
      </div>
    );
  }

  const recentNodeIds = new Set(sorted.slice(0, 2).map(s => `session:${s.id}`));
  const pickN = { faction: [], npc: [], location: [] };
  for (const node of graphData.nodes) {
    if (!['faction', 'npc', 'location'].includes(node.entityType)) continue;
    if (!(node.links || []).some(l => recentNodeIds.has(l))) continue;
    pickN[node.entityType].push(node);
  }

  const threads = [];
  for (const s of sorted) {
    for (const t of s.continuity.unresolvedThreads || []) {
      threads.push({ text: t, session: s });
      if (threads.length >= 5) break;
    }
    if (threads.length >= 5) break;
  }

  return (
    <div className="campaign-pickup card">
      <div className="campaign-pickup-head">
        <div className="campaign-mini-label">Pick Up Next</div>
        <h2 className="campaign-pickup-title">
          Last played{' '}
          <AppLink className="campaign-session-link" to={`/view/${latest.id}`}>{sessionLabel(latest)}</AppLink>
          {latest.date && <span className="campaign-pickup-date">{fmtDate(latest.date)}</span>}
        </h2>
        {latest.continuity.sessionRecap && (
          <p className="gm-pickup-recap"><WT text={latest.continuity.sessionRecap} /></p>
        )}
      </div>
      <div className="campaign-pickup-grid">
        {[
          ['Factions To Watch', pickN.faction, 'No factions linked to recent sessions yet.'],
          ['NPCs To Revisit', pickN.npc, 'No NPCs linked to recent sessions yet.'],
          ['Locations To Revisit', pickN.location, 'No locations linked to recent sessions yet.'],
        ].map(([title, nodes, empty]) => (
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
                <div className="campaign-mini-item" key={i}>
                  <WT text={t.text} />
                  <AppLink className="campaign-board-meta campaign-board-meta-link" to={`/view/${t.session.id}`}>{sessionLabel(t.session)}</AppLink>
                </div>
              ))}</div>
            : <p className="campaign-mini-empty">No unresolved threads logged yet.</p>}
        </section>
      </div>
      <div className="gm-pickup-actions">
        <AppLink to={`/run/${latest.id}`} className="btn btn-primary">Run Last Session</AppLink>
        <AppLink to={`/form?edit=${latest.id}`} className="btn btn-ghost">Edit Last Session</AppLink>
        <AppLink to="/form" className="btn btn-ghost">Plan Next Session</AppLink>
      </div>
    </div>
  );
}

// ── Section 3: Continuity Boards ──────────────────────────────────────────────
function ContinuityBoards({ continuitySessions, allSessions }) {
  const [query, setQuery] = useState('');
  const sorted = useMemo(() => [...continuitySessions].sort(byContinuityOrder), [continuitySessions]);

  const q = query.trim().toLowerCase();
  const blob = s => [s.id, s.goal, s.date, ...(s.tags || []), s.continuity.sessionRecap,
    ...(s.continuity.worldStateChanges || []), ...(s.continuity.unresolvedThreads || []),
    ...(s.continuity.npcStatusChanges || []), ...(s.continuity.treasureRewardsLog || [])].join(' ').toLowerCase();
  const items = q ? sorted.filter(s => blob(s).includes(q)) : sorted;

  const untracked = allSessions.filter(s => !continuitySessions.some(c => c.id === s.id)).slice(0, 4);

  const boardDefs = [
    { key: 'worldStateChanges', title: 'World-State Changes', empty: 'No world-state changes logged yet.' },
    { key: 'unresolvedThreads', title: 'Unresolved Threads', empty: 'No unresolved threads logged yet.' },
    { key: 'npcStatusChanges', title: 'NPC Status Changes', empty: 'No NPC status changes logged yet.' },
    { key: 'treasureRewardsLog', title: 'Treasure & Rewards', empty: 'No rewards logged yet.' },
  ];

  return (
    <div>
      {untracked.length > 0 && (
        <div className="gm-untracked-hint">
          <span className="gm-untracked-label">Sessions missing continuity:</span>
          {untracked.map(s => (
            <AppLink key={s.id} className="gm-untracked-link" to={`/form?edit=${s.id}#s-continuity`}>
              {sessionLabel(s)}
            </AppLink>
          ))}
        </div>
      )}
      <div className="gm-boards-search">
        <input type="search" className="search-input" value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search continuity notes, threads, NPC updates, rewards…" />
      </div>
      <div className="campaign-boards">
        {!items.length
          ? <div className="empty-state"><p>{q ? 'No continuity notes match your search.' : 'No continuity sessions yet. Fill the Campaign Continuity section inside a Session Plan.'}</p></div>
          : boardDefs.map(def => {
              const entries = items.flatMap(s => s.continuity[def.key].map(text => ({ text, session: s })));
              return (
                <div className="campaign-board card" key={def.key}>
                  <div className="campaign-board-head">
                    <span>{def.title}</span>
                    <span className="campaign-board-count">{entries.length}</span>
                  </div>
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
    </div>
  );
}

// ── Section 4: Prep Radar ─────────────────────────────────────────────────────
function PrepRadar({ sessions, encounters, npcs, locations, factions, continuitySessions }) {
  const trackedIds = new Set(continuitySessions.map(s => s.id));

  const radarItems = [
    {
      label: 'Sessions missing continuity notes',
      records: sessions.filter(s => !trackedIds.has(s.id)),
      toHref: s => `/form?edit=${s.id}#s-continuity`,
      toLabel: s => sessionLabel(s),
    },
    {
      label: 'Encounters not linked to a session',
      records: encounters.filter(e => !e.sessionId),
      toHref: e => `/encounter/edit/${e.id}`,
      toLabel: e => e.name || e.id,
    },
    {
      label: 'NPCs missing situation',
      records: npcs.filter(n => !n.situation),
      toHref: n => `/npc/edit/${n.id}`,
      toLabel: n => n.name || n.id,
    },
    {
      label: 'Locations missing description',
      records: locations.filter(l => !l.description),
      toHref: l => `/location/edit/${l.id}`,
      toLabel: l => l.name || l.id,
    },
    {
      label: 'Factions with no session links',
      records: factions.filter(f => !f.linkedSessions || f.linkedSessions.length === 0),
      toHref: f => `/faction/edit/${f.id}`,
      toLabel: f => f.name || f.id,
    },
  ].filter(item => item.records.length > 0);

  if (!radarItems.length) {
    return (
      <div className="prep-radar-clear card">
        <p>All clear — no obvious prep gaps detected.</p>
      </div>
    );
  }

  return (
    <div className="prep-radar-items">
      {radarItems.map(item => (
        <div className="prep-radar-item card" key={item.label}>
          <div className="prep-radar-item-header">
            <span className="prep-radar-item-label">{item.label}</span>
            <span className="prep-radar-item-count">{item.records.length}</span>
          </div>
          <div className="prep-radar-item-links">
            {item.records.slice(0, 6).map(r => (
              <AppLink key={r.id} to={item.toHref(r)} className="prep-radar-link">{item.toLabel(r)}</AppLink>
            ))}
            {item.records.length > 6 && (
              <span className="prep-radar-overflow">+{item.records.length - 6} more</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Section 5: Recent Sessions ────────────────────────────────────────────────
function RecentSessions({ sessions, continuitySessions }) {
  const SHOW = 10;
  const sorted = useMemo(() => [...sessions].sort(byRecentSession), [sessions]);
  const recent = sorted.slice(0, SHOW);
  const contMap = Object.fromEntries(continuitySessions.map(s => [s.id, s]));
  const contSorted = [...continuitySessions].sort(byContinuityOrder);

  return (
    <div>
      <div className="recent-sessions">
        {!recent.length
          ? <div className="empty-state"><p>No sessions yet.</p></div>
          : recent.map((s, i) => {
              const cs = contMap[s.id];
              const prevIdx = cs ? contSorted.findIndex(x => x.id === s.id) + 1 : -1;
              const prevCs = prevIdx >= 0 ? contSorted[prevIdx] : null;
              const levelUp = cs && prevCs && cs.partyLevel && prevCs.partyLevel &&
                Number(cs.partyLevel) > Number(prevCs.partyLevel);
              return (
                <div key={s.id} className={`recent-session-row${i === 0 ? ' is-latest' : ''}`}>
                  <div className="recent-session-main">
                    <AppLink className="recent-session-num" to={`/view/${s.id}`}>{sessionLabel(s)}</AppLink>
                    {levelUp && <span className="recent-session-level">▲ Lv {cs.partyLevel}</span>}
                    <span className="recent-session-goal">{s.goal || <em>No goal recorded</em>}</span>
                    {s.date && <span className="recent-session-date">{fmtDate(s.date)}</span>}
                    <Tags tags={s.tags} className="recent-session-tags" />
                  </div>
                  <div className="recent-session-actions">
                    <AppLink to={`/view/${s.id}`} className="btn btn-ghost btn-sm">View</AppLink>
                    <AppLink to={`/form?edit=${s.id}`} className="btn btn-ghost btn-sm">Edit</AppLink>
                    <AppLink to={`/run/${s.id}`} className="btn btn-ghost btn-sm">Run</AppLink>
                  </div>
                </div>
              );
            })}
      </div>
      {sessions.length > SHOW && (
        <div className="recent-sessions-cta">
          <span className="recent-sessions-more">Showing {SHOW} of {sessions.length} sessions.</span>
          <AppLink to="/sessions" className="btn btn-ghost btn-sm">Browse All Sessions</AppLink>
          <AppLink to="/graph" className="btn btn-ghost btn-sm">View in Graph</AppLink>
        </div>
      )}
    </div>
  );
}

// ── Section 6: Session Prep Shortcuts ─────────────────────────────────────────
function PrepShortcuts({ sessions, encounters }) {
  const latestSession = useMemo(() => [...sessions].sort(byRecentSession)[0], [sessions]);
  const latestEncounter = useMemo(() => [...encounters].sort(byRecent)[0], [encounters]);

  const shortcuts = [
    latestSession && {
      label: 'Continue Last Session Plan',
      desc: sessionLabel(latestSession),
      to: `/form?edit=${latestSession.id}`,
    },
    { label: 'Plan New Session', desc: 'Start a blank session plan', to: '/form' },
    latestSession && {
      label: 'Run Latest Session',
      desc: 'Open in live run mode',
      to: `/run/${latestSession.id}`,
    },
    latestEncounter && {
      label: 'Open Latest Encounter',
      desc: latestEncounter.name || latestEncounter.id,
      to: `/encounter/view/${latestEncounter.id}`,
    },
    { label: 'Browse All Sessions', desc: 'Search and filter session history', to: '/sessions' },
    { label: 'New NPC', desc: 'Add a character to the campaign', to: '/npc/new' },
  ].filter(Boolean);

  return (
    <div className="prep-shortcuts">
      {shortcuts.map(s => (
        <AppLink key={s.to + s.label} to={s.to} className="prep-shortcut-btn card">
          <span className="prep-shortcut-label">{s.label}</span>
          <span className="prep-shortcut-desc">{s.desc}</span>
        </AppLink>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
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
      } catch (err) {
        if (alive) setState({ loading: false, error: err.message, data: null });
      }
    })();
    return () => { alive = false; };
  }, []);

  if (state.loading) return <div className="container wide"><div className="empty-state"><p>Loading campaign…</p></div></div>;
  if (state.error) return <div className="container wide"><div className="empty-state"><p>{state.error}</p></div></div>;

  const d = state.data;
  const latestSession = [...d.sessions].sort(byRecentSession)[0] || null;

  return (
    <div className="container wide campaign-page gm-command-center">

      <CampaignHeader
        campaign={d.campaign}
        sessions={d.sessions}
        latestSession={latestSession}
        continuitySessions={d.continuitySessions}
      />

      <section className="gm-section">
        <SectionHeader n="01" title="Pick Up Next" />
        <PickUpNext continuitySessions={d.continuitySessions} graphData={d.graphData} />
      </section>

      <section className="gm-section">
        <SectionHeader n="02" title="Continuity Boards" />
        <ContinuityBoards continuitySessions={d.continuitySessions} allSessions={d.sessions} />
      </section>

      <section className="gm-section">
        <SectionHeader n="03" title="Prep Radar" />
        <PrepRadar
          sessions={d.sessions}
          encounters={d.encounters}
          npcs={d.npcs}
          locations={d.locations}
          factions={d.factions}
          continuitySessions={d.continuitySessions}
        />
      </section>

      <section className="gm-section">
        <SectionHeader
          n="04"
          title="Recent Sessions"
          action={<AppLink to="/sessions" className="btn btn-ghost btn-sm">Browse All</AppLink>}
        />
        <RecentSessions sessions={d.sessions} continuitySessions={d.continuitySessions} />
      </section>

      <section className="gm-section">
        <SectionHeader n="05" title="Session Prep" />
        <PrepShortcuts sessions={d.sessions} encounters={d.encounters} />
      </section>


    </div>
  );
}
