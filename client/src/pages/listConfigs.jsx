import React from 'react';

// ─── Shared row helpers (ported from the list controllers' renderTable) ──────
function DemoBadge({ demo }) {
  return demo ? <span className="demo-badge">Demo</span> : null;
}
function LinkChip({ n, noun }) {
  if (!n) return null;
  return <span className="link-count-chip">{n} {noun}{n === 1 ? '' : 's'}</span>;
}
function DraftBadge({ status }) {
  return status === 'draft' ? <span className="draft-state-chip">Draft</span> : null;
}
function TagsWrap({ tags, max = 3 }) {
  if (!tags || !tags.length) return null;
  const visible = tags.slice(0, max);
  return (
    <span className="tags-wrap">
      <br />
      {visible.map((t, i) => (
        <React.Fragment key={i}>
          <span className={`tag-chip${String(t || '').trim().toLowerCase() === 'draft' ? ' is-draft' : ''}`}>{t}</span>{' '}
        </React.Fragment>
      ))}
      {tags.length > max ? <span className="tag-chip overflow">+{tags.length - max}</span> : null}
    </span>
  );
}
function fmtDate(d, withTime) {
  if (!d) return '—';
  const date = withTime ? new Date(d) : new Date(d + 'T12:00:00');
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function reputationLabel(value) {
  const score = Number(value) || 0;
  const labels = { '-3': 'Hostile', '-2': 'Distrusted', '-1': 'Cold', '0': 'Neutral', '1': 'Warm', '2': 'Trusted', '3': 'Allied' };
  return `${score > 0 ? '+' : ''}${score} ${labels[String(score)] || ''}`.trim();
}

// ─── Per-entity list configuration ───────────────────────────────────────────
export const LIST_CONFIGS = {
  sessions: {
    title: 'Sessions',
    subtitle: 'Each row is one session plan for one play night.',
    api: '/api/sessions',
    newHref: '/form',
    newLabel: 'New Session',
    viewHref: id => `/view/${id}`,
    viewNative: true,
    empty: 'No sessions yet. Plan your first one!',
    searchText: s => [String(s.sessionNumber ?? ''), s.goal].filter(Boolean).join(' '),
    columns: [
      { header: 'Session', cell: s => {
          const raw = String(s.sessionNumber ?? '?');
          const num = raw.includes('.') ? raw : raw.padStart(3, '0');
          return (<>
            <span className="session-num">#{num}</span> <DraftBadge status={s.status} /> <DemoBadge demo={s.isDemo} />{' '}
            <LinkChip n={s.linkedEncounterCount} noun="linked encounter" />
            <TagsWrap tags={s.tags} />
          </>);
        } },
      { header: 'Date', className: 'session-date', cell: s => fmtDate(s.date) },
      { header: 'Party Level', className: 'session-level', cell: s => `Lv ${s.partyLevel || '?'}` },
      { header: 'Goal', className: 'session-goal', cell: s => s.goal || '' },
    ],
  },

  encounters: {
    title: 'Encounters',
    subtitle: 'Reusable encounter plans — scene packets, not one-off notes.',
    api: '/api/encounters',
    newHref: '/encounter/new',
    newLabel: 'New Encounter',
    viewHref: id => `/encounter/view/${id}`,
    viewNative: true,
    empty: 'No encounters yet. Build your first scene!',
    searchText: e => [e.id, e.name, e.fiction].filter(Boolean).join(' '),
    columns: [
      { header: 'ID', cell: e => (<>
          <span className="session-num">{e.id}</span> <DraftBadge status={e.status} /> <DemoBadge demo={e.isDemo} />{' '}
          <LinkChip n={e.linkedSessionCount} noun="linked session" />
          <TagsWrap tags={e.tags} />
        </>) },
      { header: 'Encounter Name', className: 'session-goal', cell: e => e.name || '' },
      { header: 'Session', className: 'session-date', cell: e => e.sessionId
          ? <span className="session-num">{e.sessionId}</span>
          : <span style={{ color: 'var(--muted)' }}>—</span> },
      { header: 'Created', className: 'session-date', cell: e => fmtDate(e.createdAt, true) },
      { header: 'Fiction', className: 'session-goal', cell: e => e.fiction || '' },
    ],
  },

  npcs: {
    title: 'NPCs',
    subtitle: 'Characters your players will meet — click any row to view their full profile.',
    api: '/api/npcs',
    newHref: '/npc/new',
    newLabel: 'New NPC',
    viewHref: id => `/npc/view/${id}`,
    viewNative: true,
    empty: 'No NPCs yet. Create your first character!',
    searchText: n => [n.id, n.name, n.nickname, n.situation, (n.tags || []).join(' ')].filter(Boolean).join(' '),
    columns: [
      { header: 'Name', cell: n => (<>
          <span className="session-num npc-name-cell">{n.name}</span> <DraftBadge status={n.status} /> <DemoBadge demo={n.isDemo} />
          {n.nickname ? <span className="npc-nickname"> "{n.nickname}"</span> : null}{' '}
          <LinkChip n={n.linkedSessions?.length} noun="session" />{' '}
          <LinkChip n={n.linkedEncounters?.length} noun="encounter" />
          <TagsWrap tags={n.tags} />
        </>) },
      { header: 'Situation', className: 'session-goal', cell: n => n.situation || '' },
    ],
  },

  locations: {
    title: 'Locations',
    subtitle: 'Places, districts, and sites the party can visit.',
    api: '/api/locations',
    newHref: '/location/new',
    newLabel: 'New Location',
    viewHref: id => `/location/view/${id}`,
    viewNative: true,
    empty: 'No locations yet. Map your first place!',
    searchText: l => [l.id, l.name, l.description, (l.tags || []).join(' ')].filter(Boolean).join(' '),
    columns: [
      { header: 'Name', cell: l => (<>
          <span className="session-num npc-name-cell">{l.name}</span> <DraftBadge status={l.status} /> <DemoBadge demo={l.isDemo} />{' '}
          <LinkChip n={l.linkedSessions?.length} noun="session" />
          <TagsWrap tags={l.tags} />
        </>) },
      { header: 'Description', className: 'session-goal', cell: l => l.description || '' },
    ],
  },

  factions: {
    title: 'Factions',
    subtitle: 'Power groups moving in the background: guilds, cults, houses, conspiracies.',
    api: '/api/factions',
    newHref: '/faction/new',
    newLabel: 'New Faction',
    viewHref: id => `/faction/view/${id}`,
    viewNative: true,
    empty: 'No factions yet. Add your first power group!',
    searchText: f => [f.id, f.name, f.goal, (f.tags || []).join(' ')].filter(Boolean).join(' '),
    columns: [
      { header: 'Name', cell: f => (<>
          <span className="session-num npc-name-cell">{f.name}</span>
          {f.origin ? <span className="npc-nickname"> · {f.origin}</span> : null} <DraftBadge status={f.status} /> <DemoBadge demo={f.isDemo} />{' '}
          <LinkChip n={f.linkedSessions?.length} noun="session" />
          <TagsWrap tags={f.tags} />
        </>) },
      { header: 'Goal', className: 'session-goal', cell: f => f.goal || '' },
      { header: 'Reputation', cell: f => reputationLabel(f.partyReputation) },
    ],
  },
};
