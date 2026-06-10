import React, { useMemo, useState } from 'react';

// Searchable, checkable list for linking records — a cleaner, more intuitive
// replacement for the legacy Ctrl/⌘-click multi-select.
export default function LinkedRecordPicker({ options, selected, onChange, emptyText = 'None available yet.' }) {
  const [q, setQ] = useState('');
  const sel = useMemo(() => new Set(selected || []), [selected]);
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return query ? options.filter(o => o.label.toLowerCase().includes(query)) : options;
  }, [options, q]);

  const toggle = v => {
    const next = new Set(sel);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange([...next]);
  };

  return (
    <div className="linked-picker">
      {options.length > 4 && (
        <input type="search" className="search-input linked-picker-search" placeholder="Filter…"
          value={q} onChange={e => setQ(e.target.value)} />
      )}
      <div className="linked-picker-list">
        {options.length === 0
          ? <div className="linked-picker-empty">{emptyText}</div>
          : filtered.length === 0
            ? <div className="linked-picker-empty">No matches.</div>
            : filtered.map(o => (
                <label key={o.value} className={`linked-picker-item${sel.has(o.value) ? ' is-checked' : ''}`}>
                  <input type="checkbox" checked={sel.has(o.value)} onChange={() => toggle(o.value)} />
                  <span className="linked-picker-label">{o.label}</span>
                </label>
              ))}
      </div>
      {sel.size > 0 && <div className="linked-picker-count">{sel.size} selected</div>}
    </div>
  );
}
