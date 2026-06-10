import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/useApi.js';
import AppLink from '../components/AppLink.jsx';

// Generic native list page (sessions/encounters/npcs/locations/factions).
// Core experience: title, "New" action, text search, and click-through rows.
// Deferred to a later phase (still available on the legacy view pages):
// drag-reorder, multi-select bulk actions, right-click context menu, hover
// preview. Navigating to a record uses a real load (view pages are legacy).
export default function ListPage({ config }) {
  const { data, loading, error } = useApi(config.api);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const requestedStatus = (params.get('status') || 'all').toLowerCase();
  const statusFilter = ['all', 'active', 'draft'].includes(requestedStatus) ? requestedStatus : 'all';

  // Ported view pages navigate client-side (flash-free); legacy views full-load.
  const openRecord = id => {
    if (config.viewNative) navigate(config.viewHref(id));
    else window.location.href = config.viewHref(id);
  };

  const items = Array.isArray(data) ? data : [];
  const counts = useMemo(() => ({
    all: items.length,
    active: items.filter(it => (it.status || 'active') === 'active').length,
    draft: items.filter(it => it.status === 'draft').length,
  }), [items]);

  const visible = useMemo(() => {
    if (statusFilter === 'draft') return items.filter(it => it.status === 'draft');
    if (statusFilter === 'active') return items.filter(it => (it.status || 'active') === 'active');
    return items;
  }, [items, statusFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter(it => config.searchText(it).toLowerCase().includes(q));
  }, [visible, query, config]);

  function setStatusFilter(nextStatus) {
    const next = new URLSearchParams(params);
    if (nextStatus === 'all') next.delete('status');
    else next.set('status', nextStatus);
    setParams(next, { replace: true });
  }

  function filterLabel() {
    if (statusFilter === 'draft') return 'drafts';
    if (statusFilter === 'active') return config.title.toLowerCase();
    return config.title.toLowerCase();
  }

  return (
    <div className="container wide">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, marginTop: 8 }}>
        <h1 className="page-title">{config.title}</h1>
        <AppLink to={config.newHref} className="btn btn-primary" data-icon="plus">{config.newLabel}</AppLink>
      </div>
      <p className="page-subtitle">{config.subtitle}</p>

      {items.length > 0 && (
        <div className="list-status-bar">
          <div className="list-status-tabs" role="tablist" aria-label={`${config.title} status filters`}>
            {[
              ['all', `All (${counts.all})`],
              ['active', `Active (${counts.active})`],
              ['draft', `Drafts (${counts.draft})`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`list-status-tab${statusFilter === key ? ' is-active' : ''}`}
                aria-pressed={statusFilter === key}
                onClick={() => setStatusFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {counts.draft > 0 && (
            <div className="list-status-meta">
              Drafts stay in the app, remain searchable, and can be promoted from their view pages.
            </div>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div style={{ margin: '18px 0' }}>
          <input
            type="search"
            className="search-input"
            placeholder={`Search ${filterLabel()}…`}
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      )}

      {loading && <div className="empty-state"><p>Loading {config.title.toLowerCase()}…</p></div>}
      {error && <div className="empty-state"><p>Could not load {config.title.toLowerCase()}.</p></div>}

      {!loading && !error && items.length === 0 && (
        <div className="empty-state">
          <p>{config.empty}</p>
          <AppLink to={config.newHref} className="btn btn-primary">+ {config.newLabel}</AppLink>
        </div>
      )}

      {!loading && !error && items.length > 0 && visible.length === 0 && statusFilter === 'draft' && (
        <div className="empty-state">
          <p>No drafts yet.</p>
          <AppLink to={config.newHref} className="btn btn-primary">+ {config.newLabel}</AppLink>
        </div>
      )}

      {!loading && !error && visible.length > 0 && filtered.length === 0 && (
        <div className="empty-state"><p>No {filterLabel()} match your search.</p></div>
      )}

      {filtered.length > 0 && (
        <table className="sessions-table">
          <thead>
            <tr>{config.columns.map(c => <th key={c.header}>{c.header}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr
                key={item.id}
                className="session-row"
                data-id={item.id}
                style={{ cursor: 'pointer' }}
                onClick={() => openRecord(item.id)}
              >
                {config.columns.map(c => (
                  <td key={c.header} className={`clickable${c.className ? ' ' + c.className : ''}`}>
                    {c.cell(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
