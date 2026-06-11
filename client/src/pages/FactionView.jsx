import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ViewActionSidebar from '../components/ViewActionSidebar.jsx';
import LinksEditor from '../components/LinksEditor.jsx';
import TagEditor from '../components/TagEditor.jsx';
import { wikiRender, wikiPreload, toast, confirmDialog, openExport, openConnections } from '../lib/vanilla.js';

const Prose = ({ text, className }) => <p className={className} dangerouslySetInnerHTML={{ __html: wikiRender(text) }} />;
function reputationLabel(value) {
  const score = Number(value) || 0;
  const labels = { '-3': 'Hostile', '-2': 'Distrusted', '-1': 'Cold', '0': 'Neutral', '1': 'Warm', '2': 'Trusted', '3': 'Allied' };
  return `${score > 0 ? '+' : ''}${score} ${labels[String(score)] || ''}`.trim();
}

export default function FactionView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [f, setF] = useState(null);
  const [links, setLinks] = useState({ sessions: [], encounters: [], npcs: [], locations: [] });
  const [error, setError] = useState(false);
  const [promoting, setPromoting] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [res] = await Promise.all([fetch(`/api/factions/${id}`), wikiPreload()]);
        if (!res.ok) throw new Error('not found');
        const data = await res.json();
        if (!alive) return;
        setF(data);
        document.title = `${data.name} — D&D Session Master`;
        if (data.linkedSessions?.length || data.linkedEncounters?.length || data.linkedNpcs?.length || data.linkedLocations?.length) {
          const [s, e, n, l] = await Promise.all([
            fetch(`/api/factions/${id}/linked-sessions`).then(r => r.ok ? r.json() : []),
            fetch(`/api/factions/${id}/linked-encounters`).then(r => r.ok ? r.json() : []),
            fetch(`/api/factions/${id}/linked-npcs`).then(r => r.ok ? r.json() : []),
            fetch(`/api/factions/${id}/linked-locations`).then(r => r.ok ? r.json() : []),
          ]);
          if (alive) setLinks({ sessions: s, encounters: e, npcs: n, locations: l });
        }
      } catch { if (alive) setError(true); }
    })();
    return () => { alive = false; };
  }, [id]);


  if (error) return (
    <div className="view-layout"><main className="view-main">
      <div className="empty-state"><p>Faction not found.</p><a href="/factions" className="btn btn-ghost">← Back to Factions</a></div>
    </main></div>
  );
  if (!f) return <div className="view-layout"><main className="view-main"><div className="empty-state"><p>Loading faction…</p></div></main></div>;

  const snapshot = [
    f.origin && ['Origin', f.origin],
    (f.size !== '' && f.size != null) && ['Size', String(f.size)],
    ['Party Reputation', reputationLabel(f.partyReputation)],
  ].filter(Boolean);
  const clocks = (f.factionClocks || []).filter(c => c.name || c.advanceTrigger || c.setbackTrigger || (c.stepDescriptions || []).some(Boolean));

  const toc = [
    ['faction-section-identity', 'Identity'],
    snapshot.length && ['faction-section-snapshot', 'Snapshot'],
    f.goal && ['faction-section-goal', 'Goal'],
    clocks.length && ['faction-section-clocks', 'Clocks'],
  ].filter(Boolean);

  async function onDelete() {
    const ok = await confirmDialog('Move this faction to trash? You can restore it later from Settings.', {
      title: 'Move Faction to Trash', confirmLabel: 'Move to Trash', danger: true });
    if (!ok) return;
    try {
      const res = await fetch(`/api/factions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      toast('Faction moved to trash.', 'success');
      setTimeout(() => navigate('/factions'), 700);
    } catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  }

  async function onPromote() {
    setPromoting(true);
    try {
      const res = await fetch(`/api/factions/${id}/state`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      toast('Draft promoted to faction.', 'success');
      setTimeout(() => window.location.reload(), 700);
    } catch (err) { toast('Promote failed: ' + err.message, 'error'); setPromoting(false); }
  }

  const exportFactionFile = async () => {
    const res = await fetch('/api/factions/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || 'Generation failed');
    return { filename: r.filename, displayName: f.name || r.filename, type: 'faction', markdown: r.markdown, pdf: r.pdf };
  };
  function onExport() { openExport({ title: 'Export Faction', loadFiles: async () => [await exportFactionFile()] }); }
  function onExportConnections() {
    openExport({ title: 'Export Faction with Connections', loadFiles: async () => {
      const files = [await exportFactionFile()];
      const gen = async (item, kind, exportPath, previewKey) => {
        const recRes = await fetch(`/api/${kind}s/${encodeURIComponent(item.id)}`);
        if (!recRes.ok) return null;
        const rec = await recRes.json();
        const payload = previewKey ? rec.data : rec;
        const gRes = await fetch(exportPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const g = await gRes.json();
        if (!gRes.ok) return null;
        const displayName = kind === 'session'
          ? (item.sessionNumber ? `Session ${String(item.sessionNumber).padStart(3, '0')}` : (item.goal || item.id))
          : (item.name || item.id);
        return { filename: g.filename, type: kind, markdown: g.markdown, pdf: g.pdf, displayName };
      };
      const jobs = [
        ...links.sessions.filter(x => x.exists !== false).map(x => gen(x, 'session', '/api/sessions/preview', true)),
        ...links.encounters.filter(x => x.exists !== false).map(x => gen(x, 'encounter', '/api/encounters/preview', true)),
        ...links.npcs.filter(x => x.exists !== false).map(x => gen(x, 'npc', '/api/npcs/export', false)),
        ...links.locations.filter(x => x.exists !== false).map(x => gen(x, 'location', '/api/locations/export', false)),
      ];
      (await Promise.allSettled(jobs)).forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });
      return files;
    } });
  }
  function onConnections() {
    const sec = (title, empty, items) => ({ title, empty, items });
    openConnections({
      title: `${f.name} Connections`,
      subtitle: 'All sessions, encounter plans, NPCs, and locations currently linked to this faction.',
      sections: [
        sec('Linked Sessions', 'No linked sessions yet.', links.sessions.map(s => ({ label: s.sessionNumber ? `Session ${String(s.sessionNumber).padStart(3, '0')}` : s.id, meta: `${s.goal || s.id}${s.exists ? '' : ' · missing session'}`, url: `/view/${s.id}`, exists: s.exists }))),
        sec('Linked Encounter Plans', 'No linked encounter plans yet.', links.encounters.map(e => ({ label: e.name || e.id, meta: `${e.id}${e.fiction ? ` · ${e.fiction.slice(0, 72)}` : ''}${e.exists ? '' : ' · missing plan'}`, url: `/encounter/view/${e.id}`, exists: e.exists }))),
        sec('Linked NPCs', 'No linked NPCs yet.', links.npcs.map(n => ({ label: n.name || n.id, meta: `${n.id}${n.nickname ? ` · "${n.nickname}"` : ''}${n.exists ? '' : ' · missing NPC'}`, url: `/npc/view/${n.id}`, exists: n.exists }))),
        sec('Linked Locations', 'No linked locations yet.', links.locations.map(l => ({ label: l.name || l.id, meta: `${l.id}${l.description ? ` · ${l.description.slice(0, 72)}` : ''}${l.exists ? '' : ' · missing location'}`, url: `/location/view/${l.id}`, exists: l.exists }))),
      ],
    });
  }

  return (
    <>
      <div className="view-layout">
        <ViewActionSidebar
          backHref="/factions" backLabel="All Factions" backNative
          editLabel="Edit Faction" onEdit={() => { window.location.href = `/faction/edit/${id}`; }}
          onConnections={onConnections}
          onExport={onExport} exportConnectionsLabel="Export with Connections" onExportConnections={onExportConnections}
          onDelete={onDelete}
          showPromote={f.status === 'draft'} onPromote={onPromote} promoting={promoting}
        />
        <main className="view-main">
          <div className="npc-view-body">
            <div className="npc-view-header" id="faction-section-identity">
              <h1 className="npc-view-name">{f.name}</h1>
              <TagEditor id={id} initialTags={f.tags || []} apiBase="/api/factions" className="npc-view-tags" />
            </div>

            {snapshot.length > 0 && (
              <div className="npc-view-section" id="faction-section-snapshot">
                <div className="npc-view-section-label">Snapshot</div>
                <div className="npc-core-grid">
                  {snapshot.map(([label, value]) => (
                    <div className="npc-core-item" key={label}>
                      <div className="npc-core-label">{label}</div>
                      <Prose text={value} className="npc-view-prose" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {f.goal && (
              <div className="npc-view-section" id="faction-section-goal">
                <div className="npc-view-section-label">Goal</div>
                <Prose text={f.goal} className="npc-view-prose" />
              </div>
            )}

            {clocks.length > 0 && (
              <div className="npc-view-section" id="faction-section-clocks">
                <div className="npc-view-section-label">Faction Clocks</div>
                <div className="npc-skills-view-grid">
                  {clocks.map((clock, ci) => {
                    const steps = Number(clock.steps || (clock.stepDescriptions || []).length || 0);
                    const hasSteps = (clock.stepDescriptions || []).some(Boolean);
                    return (
                      <div className="npc-skill-card faction-view-clock-card" key={ci}>
                        <div className="npc-skill-label">{clock.name || 'Unnamed Clock'} <span className="npc-skill-sub">({steps} step{steps === 1 ? '' : 's'})</span></div>
                        {clock.advanceTrigger && <p className="npc-view-prose"><strong>Advances:</strong> <span dangerouslySetInnerHTML={{ __html: wikiRender(clock.advanceTrigger) }} /></p>}
                        {clock.setbackTrigger && <p className="npc-view-prose"><strong>Setbacks:</strong> <span dangerouslySetInnerHTML={{ __html: wikiRender(clock.setbackTrigger) }} /></p>}
                        {hasSteps ? (
                          <ol className="faction-view-step-list">
                            {clock.stepDescriptions.map((step, si) => (
                              <li key={si}>
                                <span className="faction-view-step-num">{si + 1}.</span>
                                <span dangerouslySetInnerHTML={{ __html: wikiRender(step || 'No change noted for this step yet.') }} />
                              </li>
                            ))}
                          </ol>
                        ) : <p className="npc-view-prose">No step changes recorded yet.</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="npc-view-section">
              <div className="npc-view-section-label">Connections</div>
              <LinksEditor
                key={`${id}-${links.sessions.length}-${links.encounters.length}-${links.npcs.length}-${links.locations.length}`}
                id={id}
                apiBase="/api/factions"
                groups={[
                  {
                    key: 'linkedSessions',
                    label: 'Sessions',
                    listApi: '/api/sessions',
                    toOption: s => ({ value: s.id, label: s.goal ? `${String(s.sessionNumber || '').padStart(3, '0')} — ${s.goal}` : `Session ${String(s.sessionNumber || s.id).padStart(3, '0')}` }),
                    getHref: sid => `/view/${sid}`,
                    initial: links.sessions.map(s => ({ id: s.id, label: s.goal || `Session ${String(s.sessionNumber || s.id).padStart(3, '0')}`, href: `/view/${s.id}` })),
                  },
                  {
                    key: 'linkedEncounters',
                    label: 'Encounter Plans',
                    listApi: '/api/encounters',
                    toOption: e => ({ value: e.id, label: e.name || e.id }),
                    getHref: eid => `/encounter/view/${eid}`,
                    initial: links.encounters.map(e => ({ id: e.id, label: e.name || e.id, href: `/encounter/view/${e.id}` })),
                  },
                  {
                    key: 'linkedNpcs',
                    label: 'NPCs',
                    listApi: '/api/npcs',
                    toOption: n => ({ value: n.id, label: n.nickname ? `${n.name} "${n.nickname}"` : n.name }),
                    getHref: nid => `/npc/view/${nid}`,
                    initial: links.npcs.map(n => ({ id: n.id, label: n.nickname ? `${n.name} "${n.nickname}"` : (n.name || n.id), href: `/npc/view/${n.id}` })),
                  },
                  {
                    key: 'linkedLocations',
                    label: 'Locations',
                    listApi: '/api/locations',
                    toOption: l => ({ value: l.id, label: l.name || l.id }),
                    getHref: lid => `/location/view/${lid}`,
                    initial: links.locations.map(l => ({ id: l.id, label: l.name || l.id, href: `/location/view/${l.id}` })),
                  },
                ]}
              />
            </div>
          </div>
        </main>
      </div>
      <aside id="toc-nav" className="toc-nav">
        {toc.length > 0 && (
          <div className="toc-inner">
            <p className="toc-head">Contents</p>
            {toc.map(([sid, label]) => <a key={sid} href={`#${sid}`} className="toc-link">{label}</a>)}
          </div>
        )}
      </aside>
    </>
  );
}
