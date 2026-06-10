// Single source of truth for primary navigation (mirrors the old nav.js NAV).
// `native: true` means the page is ported to React (use client-side <Link>);
// otherwise it's still a legacy full page (use a plain <a> so the browser does
// a real navigation). Flip `native` to true as each page is ported.
export const NAV = [
  { href: '/campaign',   icon: 'campaign',   label: 'Campaign',   group: 'overview', native: true,
    match: p => p === '/' || p === '/campaign' || p === '/campaigns' },
  { href: '/sessions',   icon: 'sessions',   label: 'Sessions',   group: 'play', native: true,
    match: p => p === '/sessions' || p === '/view' || p === '/form' || p.startsWith('/view/') || p.startsWith('/run/') },
  { href: '/encounters', icon: 'encounters', label: 'Encounters', group: 'play', native: true,
    match: p => p === '/encounters' || p.startsWith('/encounter/') },
  { href: '/npcs',       icon: 'npc',        label: 'NPCs',       group: 'world', native: true,
    match: p => p === '/npcs' || p.startsWith('/npc/') },
  { href: '/locations',  icon: 'location',   label: 'Locations',  group: 'world', native: true,
    match: p => p === '/locations' || p.startsWith('/location/') },
  { href: '/factions',   icon: 'faction',    label: 'Factions',   group: 'world', native: true,
    match: p => p === '/factions' || p.startsWith('/faction/') },
  { href: '/map',        icon: 'map',        label: 'Map',        group: 'world', native: true,
    match: p => p === '/map' },
];

// Create-menu targets (all still legacy forms for now).
export const CREATE_ITEMS = [
  { href: '/form',          label: 'Session' },
  { href: '/encounter/new', label: 'Encounter' },
  { href: '/npc/new',       label: 'NPC' },
  { href: '/location/new',  label: 'Location' },
  { href: '/faction/new',   label: 'Faction' },
];
