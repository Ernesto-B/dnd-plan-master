import React, { useMemo, useState } from 'react';
import AppLink from '../../components/AppLink.jsx';

const TYPES = ['session', 'faction', 'npc', 'encounter', 'location'];
const LABELS = { session: ['Session', 'Sessions'], faction: ['Faction', 'Factions'], npc: ['NPC', 'NPCs'], encounter: ['Encounter', 'Encounters'], location: ['Location', 'Locations'] };
const typeLabel = (t, plural) => (LABELS[t] || [t, `${t}s`])[plural ? 1 : 0];
const cmp = (a, b) => (b.connectionCount !== a.connectionCount) ? b.connectionCount - a.connectionCount : String(a.label).localeCompare(String(b.label));

export default function EntityGraph({ graphData }) {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedId, setSelectedId] = useState(null);

  const nodes = graphData?.nodes || [];
  const nodesById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const q = query.trim().toLowerCase();

  const matches = useMemo(() => nodes.filter(n =>
    (filterType === 'all' || n.entityType === filterType) && (!q || n.searchText.includes(q))
  ), [nodes, filterType, q]);

  const selectedNode = selectedId && nodesById.has(selectedId) ? nodesById.get(selectedId) : null;
  const matchedIds = useMemo(() => new Set(matches.map(n => n.id)), [matches]);

  const visibleIds = useMemo(() => {
    const visible = new Set();
    if (selectedNode) {
      visible.add(selectedNode.id);
      (selectedNode.links || []).forEach(l => visible.add(l));
      if (q || filterType !== 'all') matches.forEach(n => visible.add(n.id));
      return visible;
    }
    if (q || filterType !== 'all') {
      matches.forEach(n => { visible.add(n.id); (n.links || []).forEach(l => visible.add(l)); });
      return visible;
    }
    TYPES.forEach(t => matches.filter(n => n.entityType === t).sort(cmp).slice(0, 7).forEach(n => visible.add(n.id)));
    return visible;
  }, [selectedNode, matches, q, filterType]);

  const visibleNodes = [...visibleIds].map(id => nodesById.get(id)).filter(Boolean);
  const relatedCount = visibleNodes.filter(n => !matchedIds.has(n.id)).length;
  const selectedLinks = new Set(selectedNode?.links || []);

  const summary = visibleNodes.length
    ? (q || filterType !== 'all')
      ? `${matches.length} match${matches.length === 1 ? '' : 'es'} · ${relatedCount} directly linked record${relatedCount === 1 ? '' : 's'}`
      : `${visibleNodes.length} visible entities · browse the most connected records`
    : 'No matching entities.';

  const clearFilters = () => { setQuery(''); setFilterType('all'); };
  const toggleSelect = id => setSelectedId(prev => prev === id ? null : id);

  const groups = {};
  TYPES.forEach(t => { groups[t] = visibleNodes.filter(n => n.entityType === t).sort(cmp); });

  return (
    <>
      <div className="campaign-connections-toolbar">
        <input type="search" className="search-input campaign-search-input" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search sessions, encounters, NPCs, locations, factions, tags, IDs, or notes…" />
        <div className="campaign-connections-filters">
          {[['all', 'All'], ['session', 'Sessions'], ['faction', 'Factions'], ['npc', 'NPCs'], ['encounter', 'Encounters'], ['location', 'Locations']].map(([t, label]) => (
            <button key={t} type="button" className={`search-chip${filterType === t ? ' active' : ''}`} onClick={() => setFilterType(t)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="campaign-connections-summary">{summary}</div>

      <div className="campaign-connections-layout">
        <div className="campaign-graph-shell">
          <div className="entity-graph-map">
            {!visibleNodes.length ? (
              <div className="campaign-graph-empty">
                <p>No entities match this search.</p>
                <button type="button" className="btn btn-ghost" onClick={clearFilters}>Clear Filters</button>
              </div>
            ) : TYPES.map(type => (
              <section className={`graph-column graph-column-${type}`} key={type}>
                <div className="graph-column-head">{typeLabel(type, true)}</div>
                <div className="graph-column-list">
                  {groups[type].length ? groups[type].map(node => {
                    const isSelected = node.id === selectedId;
                    const isMatched = matchedIds.has(node.id);
                    const isLinked = selectedNode ? selectedLinks.has(node.id) : false;
                    const isDimmed = selectedNode && !isSelected && !isLinked;
                    return (
                      <button key={node.id} type="button"
                        className={`graph-node${isSelected ? ' selected' : ''}${isMatched ? ' matched' : ''}${isLinked ? ' linked' : ''}${isDimmed ? ' dimmed' : ''}`}
                        onClick={() => toggleSelect(node.id)}>
                        <span className="graph-node-title">{node.label}</span>
                        <span className="graph-node-meta">{node.subtitle || node.rawId}</span>
                        <span className="graph-node-foot">
                          <span className="graph-node-badge">{node.connectionCount} link{node.connectionCount === 1 ? '' : 's'}</span>
                          {node.tags?.length ? <span className="graph-node-tags">{node.tags.slice(0, 2).join(' · ')}</span> : null}
                        </span>
                      </button>
                    );
                  }) : <div className="graph-column-empty">No {type}s in this view.</div>}
                </div>
              </section>
            ))}
          </div>
        </div>

        <aside className="entity-graph-detail">
          <GraphDetail node={selectedNode} nodesById={nodesById} allNodes={nodes} onFocus={setSelectedId} onClear={() => setSelectedId(null)} visibleEmpty={!visibleNodes.length} />
        </aside>
      </div>
    </>
  );
}

function GraphDetail({ node, nodesById, allNodes, onFocus, onClear, visibleEmpty }) {
  if (visibleEmpty) {
    return (
      <div className="campaign-graph-placeholder">
        <div className="campaign-guide-label">No Selection</div>
        <p>Clear the search or switch filters to explore the relationship table again.</p>
      </div>
    );
  }
  if (!node) {
    const top = [...allNodes].sort(cmp).slice(0, 5);
    return (
      <div className="campaign-graph-placeholder">
        <div className="campaign-guide-label">Select an Entity</div>
        <p>Search to narrow the explorer, then click any card to inspect its connected sessions, factions, encounters, NPCs, and locations.</p>
        <div className="campaign-guide-label" style={{ marginTop: 16 }}>Good Starting Points</div>
        <div className="graph-detail-links">
          {top.map(n => (
            <button key={n.id} type="button" className="graph-detail-link" onClick={() => onFocus(n.id)}>
              <span>{n.label}</span><span>{n.connectionCount} links</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const grouped = { session: [], faction: [], npc: [], encounter: [], location: [] };
  (node.links || []).forEach(id => { const l = nodesById.get(id); if (l && grouped[l.entityType]) grouped[l.entityType].push(l); });
  Object.keys(grouped).forEach(t => grouped[t].sort(cmp));

  const Section = ({ title, items }) => (
    <section className="graph-detail-section">
      <div className="campaign-guide-label">{title}</div>
      {items.length
        ? <div className="graph-detail-links">{items.map(it => (
            <button key={it.id} type="button" className="graph-detail-link" onClick={() => onFocus(it.id)}>
              <span>{it.label}</span><span>{it.connectionCount} links</span>
            </button>
          ))}</div>
        : <p className="campaign-mini-empty">No {title.toLowerCase()}.</p>}
    </section>
  );

  return (
    <div className="graph-detail-card">
      <div className="graph-detail-head">
        <div>
          <div className="graph-detail-type">{typeLabel(node.entityType, false)}</div>
          <h3 className="graph-detail-title">{node.label}</h3>
          <p className="graph-detail-copy">{node.subtitle || 'No additional summary available.'}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClear}>Clear</button>
      </div>
      <div className="graph-detail-meta">
        <AppLink to={node.url} className="btn btn-primary">Open Record</AppLink>
        <span className="graph-node-badge">{node.connectionCount} direct link{node.connectionCount === 1 ? '' : 's'}</span>
        {node.tags?.length ? <div className="graph-detail-tags">{node.tags.map((t, i) => <span key={i} className={`tag-chip${String(t || '').trim().toLowerCase() === 'draft' ? ' is-draft' : ''}`}>{t}</span>)}</div> : null}
      </div>
      <Section title="Connected Sessions" items={grouped.session} />
      <Section title="Connected Factions" items={grouped.faction} />
      <Section title="Connected NPCs" items={grouped.npc} />
      <Section title="Connected Encounters" items={grouped.encounter} />
      <Section title="Connected Locations" items={grouped.location} />
    </div>
  );
}
