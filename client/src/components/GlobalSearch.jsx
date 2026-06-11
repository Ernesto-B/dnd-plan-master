import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const TYPE_LABELS = {
  session:   'Sessions',
  encounter: 'Encounters',
  npc:       'NPCs',
  location:  'Locations',
  faction:   'Factions',
};

const HINT_CHIPS = ['enc:', 'ses:', 'npc:', 'loc:', 'fac:'];

function detectScope(q) {
  const m = q.match(/^(enc|encounter|encounters|ses|sess|session|sessions|npc|loc|location|locations|fac|faction|factions):/i);
  if (!m) return null;
  const p = m[1].toLowerCase();
  if (p.startsWith('enc'))  return 'Encounters';
  if (p.startsWith('ses'))  return 'Sessions';
  if (p === 'npc')          return 'NPCs';
  if (p.startsWith('loc'))  return 'Locations';
  if (p.startsWith('fac'))  return 'Factions';
  return null;
}

function groupResults(results) {
  const order = ['session', 'encounter', 'npc', 'location', 'faction'];
  const map = {};
  for (const r of results) {
    (map[r.type] = map[r.type] || []).push(r);
  }
  return order.filter(t => map[t]).map(t => [t, map[t]]);
}

export default function GlobalSearch() {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef   = useRef(null);
  const debounceRef = useRef(null);
  const navigate   = useNavigate();

  // Cmd/Ctrl+O opens the palette
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        const el = document.activeElement;
        if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  // Focus + reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActiveIdx(0);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setActiveIdx(0);
      } catch { setResults([]); }
      setLoading(false);
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
  }, []);

  const goTo = useCallback(url => {
    close();
    navigate(url);
  }, [close, navigate]);

  function onKeyDown(e) {
    if (e.key === 'Escape')    { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[activeIdx]) goTo(results[activeIdx].url);
  }

  const scope  = detectScope(query);
  const groups = groupResults(results);

  return (
    <>
      <button
        className="gs-trigger"
        onClick={() => setOpen(true)}
        title="Global Search (⌘O)"
        aria-label="Global Search"
      >
        <span className="gs-trigger-icon">⌕</span>
        <span>Search…</span>
        <kbd className="gs-trigger-kbd">⌘O</kbd>
      </button>

      {open && (
        <div
          className={`gs-overlay visible${scope ? ' gs-has-scope' : ''}`}
          onClick={e => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="gs-box">
            <div className="gs-input-row">
              <span className="gs-input-icon">⌕</span>
              <input
                ref={inputRef}
                className="gs-input"
                placeholder="Search everything…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
              />
              <div className="gs-input-tools">
                {scope && <span className="gs-scope-indicator">{scope}</span>}
                <kbd className="gs-esc-hint">esc</kbd>
              </div>
            </div>

            <div className="gs-hints">
              {HINT_CHIPS.map(chip => (
                <button
                  key={chip}
                  className={`gs-hint-chip${query.toLowerCase().startsWith(chip) ? ' is-active' : ''}`}
                  tabIndex={-1}
                  onClick={() => { setQuery(chip); inputRef.current?.focus(); }}
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="gs-results">
              {loading && <div className="gs-empty">Searching…</div>}
              {!loading && query && results.length === 0 && (
                <div className="gs-empty">No results for "{query}"</div>
              )}
              {!loading && !query && (
                <div className="gs-empty">
                  Type to search sessions, encounters, NPCs, locations, and factions.
                </div>
              )}
              {groups.map(([type, items]) => (
                <div key={type}>
                  <div className="gs-group-head">{TYPE_LABELS[type] || type}</div>
                  {items.map(item => {
                    const flatIdx = results.indexOf(item);
                    return (
                      <a
                        key={item.id}
                        className={`gs-item${flatIdx === activeIdx ? ' gs-active' : ''}`}
                        href={item.url}
                        onClick={e => { e.preventDefault(); goTo(item.url); }}
                        onMouseEnter={() => setActiveIdx(flatIdx)}
                      >
                        <span className="gs-item-title">{item.title}</span>
                        {item.subtitle && <span className="gs-item-sub">{item.subtitle}</span>}
                      </a>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
