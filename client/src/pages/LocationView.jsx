import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ViewActionSidebar from '../components/ViewActionSidebar.jsx';
import { wikiRender, wikiPreload, toast, confirmDialog, mountTags, openExport, openConnections } from '../lib/vanilla.js';

const Prose = ({ text, className, style }) => <p className={className} style={style} dangerouslySetInnerHTML={{ __html: wikiRender(text) }} />;
const Grid = ({ items }) => (
  <div className="npc-core-grid">
    {items.map(([label, text]) => (
      <div className="npc-core-item" key={label}>
        <div className="npc-core-label">{label}</div>
        <Prose text={text} className="npc-view-prose" />
      </div>
    ))}
  </div>
);

export default function LocationView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loc, setLoc] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const tagsMounted = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [res] = await Promise.all([fetch(`/api/locations/${id}`), wikiPreload()]);
        if (!res.ok) throw new Error('not found');
        const data = await res.json();
        if (!alive) return;
        setLoc(data);
        document.title = `${data.name} — D&D Session Master`;
        if (data.linkedSessions?.length) {
          const s = await fetch(`/api/locations/${id}/linked-sessions`).then(r => r.ok ? r.json() : []);
          if (alive) setSessions(s);
        }
      } catch { if (alive) setError(true); }
    })();
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!loc || tagsMounted.current) return;
    const anchor = document.getElementById('loc-tags-container');
    if (anchor) { anchor.innerHTML = ''; mountTags(id, loc.tags || [], '/api/locations', '#loc-tags-container'); tagsMounted.current = true; }
  }, [loc, id]);

  if (error) return (
    <div className="view-layout"><main className="view-main">
      <div className="empty-state"><p>Location not found.</p><a href="/locations" className="btn btn-ghost">← Back to Locations</a></div>
    </main></div>
  );
  if (!loc) return <div className="view-layout"><main className="view-main"><div className="empty-state"><p>Loading location…</p></div></main></div>;

  const general = [
    loc.government && ['Government', loc.government],
    loc.populationSize && ['Population Size', loc.populationSize],
    loc.populationDiversity && ['Population Diversity', loc.populationDiversity],
    loc.languages && ['Languages', loc.languages],
    loc.resources && ['Resources', loc.resources],
    loc.funFact && ['Fun Fact', loc.funFact],
  ].filter(Boolean);
  const details = [
    loc.sensoryDetail && ['Sensory Detail', loc.sensoryDetail],
    loc.hiddenDetail && ['Hidden Detail / Secret', loc.hiddenDetail],
  ].filter(Boolean);
  const districts = (loc.districts || []).filter(d => d.name || d.readAloud || (d.pointsOfInterest || []).length);

  const toc = [
    ['loc-section-identity', 'Identity'],
    general.length && ['loc-section-general', 'General'],
    loc.description && ['loc-section-description', 'Description'],
    details.length && ['loc-section-details', 'Details'],
    districts.length && ['loc-section-districts', 'Districts'],
    loc.onTheHorizon && ['loc-section-horizon', 'On the Horizon'],
  ].filter(Boolean);

  async function onDelete() {
    const ok = await confirmDialog('Move this Location to trash? You can restore it later from Settings.', {
      title: 'Move Location to Trash', confirmLabel: 'Move to Trash', danger: true });
    if (!ok) return;
    try {
      const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      toast('Location moved to trash.', 'success');
      setTimeout(() => navigate('/locations'), 700);
    } catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  }

  async function onPromote() {
    setPromoting(true);
    try {
      const res = await fetch(`/api/locations/${id}/state`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      toast('Draft promoted to location.', 'success');
      setTimeout(() => window.location.reload(), 700);
    } catch (err) { toast('Promote failed: ' + err.message, 'error'); setPromoting(false); }
  }

  const exportLocFile = async () => {
    const res = await fetch('/api/locations/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loc) });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || 'Generation failed');
    return { filename: r.filename, displayName: loc.name || r.filename, type: 'location', markdown: r.markdown, pdf: r.pdf };
  };
  function onExport() { openExport({ title: 'Export Location', loadFiles: async () => [await exportLocFile()] }); }
  function onExportConnections() {
    openExport({ title: 'Export Location with Connections', loadFiles: async () => {
      const files = [await exportLocFile()];
      const jobs = sessions.filter(s => s.exists !== false).map(async sess => {
        const sRes = await fetch(`/api/sessions/${encodeURIComponent(sess.id)}`);
        if (!sRes.ok) return null;
        const rec = await sRes.json();
        const gRes = await fetch('/api/sessions/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec.data) });
        const g = await gRes.json();
        if (!gRes.ok) return null;
        return { filename: g.filename, type: 'session', markdown: g.markdown, pdf: g.pdf,
          displayName: sess.sessionNumber ? `Session ${String(sess.sessionNumber).padStart(3, '0')}` : (sess.goal || sess.id) };
      });
      (await Promise.allSettled(jobs)).forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });
      return files;
    } });
  }
  function onConnections() {
    openConnections({
      title: `${loc.name} Connections`, subtitle: 'All sessions currently linked to this location.',
      sections: [{ title: 'Linked Sessions', empty: 'No linked sessions yet.',
        items: sessions.map(s => ({ label: s.sessionNumber ? `Session ${String(s.sessionNumber).padStart(3, '0')}` : s.id,
          meta: `${s.goal || s.id}${s.exists ? '' : ' · missing session'}`, url: `/view/${s.id}`, exists: s.exists })) }],
    });
  }

  return (
    <>
      <div className="view-layout">
        <ViewActionSidebar
          backHref="/locations" backLabel="All Locations" backNative
          editLabel="Edit Location" onEdit={() => { window.location.href = `/location/edit/${id}`; }}
          onConnections={onConnections}
          onExport={onExport} exportConnectionsLabel="Export with Connections" onExportConnections={onExportConnections}
          onDelete={onDelete}
          showPromote={loc.status === 'draft'} onPromote={onPromote} promoting={promoting}
        />
        <main className="view-main">
          <div className="npc-view-body">
            <div className="npc-view-header" id="loc-section-identity">
              <h1 className="npc-view-name">{loc.name}</h1>
              <div id="loc-tags-container" className="npc-view-tags" />
            </div>

            {general.length > 0 && (
              <div className="npc-view-section" id="loc-section-general">
                <div className="npc-view-section-label">General</div>
                <Grid items={general} />
              </div>
            )}

            {loc.description && (
              <div className="npc-view-section" id="loc-section-description">
                <div className="npc-view-section-label">Description</div>
                <Prose text={loc.description} className="npc-view-prose" />
              </div>
            )}

            {details.length > 0 && (
              <div className="npc-view-section" id="loc-section-details">
                <div className="npc-view-section-label">Details</div>
                <Grid items={details} />
              </div>
            )}

            {districts.length > 0 && (
              <div className="npc-view-section" id="loc-section-districts">
                <div className="npc-view-section-label">Districts</div>
                <div className="npc-skills-view-grid">
                  {districts.map((d, di) => {
                    const pois = (d.pointsOfInterest || []).filter(p => p.name || p.description);
                    return (
                      <div className="npc-skill-card" key={di}>
                        <div className="npc-skill-label">{d.name || 'Unnamed District'}</div>
                        {d.readAloud && <Prose text={d.readAloud} className="npc-view-prose" style={{ fontStyle: 'italic' }} />}
                        {pois.length > 0 && (
                          <ul className="npc-carry-list">
                            {pois.map((p, pi) => (
                              <li key={pi}><strong>{p.name || 'Unnamed'}</strong>
                                {p.description && <> — <span dangerouslySetInnerHTML={{ __html: wikiRender(p.description) }} /></>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {loc.onTheHorizon && (
              <div className="npc-view-section" id="loc-section-horizon">
                <div className="npc-view-section-label">On the Horizon</div>
                <Prose text={loc.onTheHorizon} className="npc-view-prose" />
              </div>
            )}
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
