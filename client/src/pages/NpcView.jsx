import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ViewActionSidebar from '../components/ViewActionSidebar.jsx';
import LinksEditor from '../components/LinksEditor.jsx';
import TagEditor from '../components/TagEditor.jsx';
import { wikiRender, wikiPreload, toast, confirmDialog, openExport, openConnections } from '../lib/vanilla.js';

const SKILL_LABELS = {
  perception: 'Perception', insight: 'Insight', medicine: 'Medicine', investigation: 'Investigation',
  arcana: 'Arcana', history: 'History', religion: 'Religion', nature: 'Nature',
  persuasion: 'Persuasion', deception: 'Deception', intimidation: 'Intimidation',
};
const SKILL_PREFIXES = {
  perception: 'For the Perceptive', insight: 'For the Insightful', medicine: 'For the Healer',
  investigation: 'For the Investigator', arcana: 'For the Arcanist', history: 'For the Historian',
  religion: 'For the Faithful', nature: 'For the Naturalist', persuasion: 'Under Persuasion',
  deception: 'Detecting Deception', intimidation: 'Under Intimidation',
};

const Prose = ({ text, className }) => <p className={className} dangerouslySetInnerHTML={{ __html: wikiRender(text) }} />;

export default function NpcView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [npc, setNpc] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [error, setError] = useState(false);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [res] = await Promise.all([fetch(`/api/npcs/${id}`), wikiPreload()]);
        if (!res.ok) throw new Error('not found');
        const data = await res.json();
        if (!alive) return;
        setNpc(data);
        document.title = `${data.name} — D&D Session Master`;
        if (data.linkedSessions?.length || data.linkedEncounters?.length) {
          const [s, e] = await Promise.all([
            fetch(`/api/npcs/${id}/linked-sessions`).then(r => r.ok ? r.json() : []),
            fetch(`/api/npcs/${id}/linked-encounters`).then(r => r.ok ? r.json() : []),
          ]);
          if (alive) { setSessions(s); setEncounters(e); }
        }
      } catch { if (alive) setError(true); }
    })();
    return () => { alive = false; };
  }, [id]);


  if (error) return (
    <div className="view-layout"><main className="view-main">
      <div className="empty-state"><p>NPC not found.</p><a href="/npcs" className="btn btn-ghost">← Back to NPCs</a></div>
    </main></div>
  );
  if (!npc) return <div className="view-layout"><main className="view-main"><div className="empty-state"><p>Loading NPC…</p></div></main></div>;

  const coreItems = [
    npc.situation ? ['Situation', npc.situation] : null,
    npc.wantsNeeds ? ['Wants & Needs', npc.wantsNeeds] : null,
    npc.secretObstacle ? ['Secret / Obstacle', npc.secretObstacle] : null,
  ].filter(Boolean);
  const skills = npc.skillDescriptions || {};
  const filledSkills = Object.entries(SKILL_LABELS).filter(([k]) => skills[k] && skills[k].trim());

  const tocSections = [
    ['npc-section-identity', 'Identity'],
    npc.commonPhrase && ['npc-section-phrase', 'Signature'],
    npc.appearance && ['npc-section-appearance', 'Appearance'],
    coreItems.length && ['npc-section-core', 'Core'],
    filledSkills.length && ['npc-section-skills', 'Skill Triggers'],
    npc.carrying?.length && ['npc-section-carrying', 'Carrying'],
  ].filter(Boolean);

  async function onDelete() {
    const ok = await confirmDialog('Move this NPC to trash? You can restore it later from Settings.', {
      title: 'Move NPC to Trash', confirmLabel: 'Move to Trash', danger: true });
    if (!ok) return;
    try {
      const res = await fetch(`/api/npcs/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      toast('NPC moved to trash.', 'success');
      setTimeout(() => navigate('/npcs'), 700);
    } catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  }

  async function onPromote() {
    setPromoting(true);
    try {
      const res = await fetch(`/api/npcs/${id}/state`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      toast('Draft promoted to NPC.', 'success');
      setTimeout(() => window.location.reload(), 700);
    } catch (err) { toast('Promote failed: ' + err.message, 'error'); setPromoting(false); }
  }

  const exportNpcFile = async () => {
    const res = await fetch('/api/npcs/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(npc) });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || 'Generation failed');
    return { filename: r.filename, displayName: npc.name || r.filename, type: 'npc', markdown: r.markdown, pdf: r.pdf };
  };

  function onExport() {
    openExport({ title: 'Export NPC', loadFiles: async () => [await exportNpcFile()] });
  }

  function onExportConnections() {
    openExport({ title: 'Export NPC with Connections', loadFiles: async () => {
      const files = [await exportNpcFile()];
      const gen = async (item, kind) => {
        const recRes = await fetch(`/api/${kind}s/${encodeURIComponent(item.id)}`);
        if (!recRes.ok) return null;
        const rec = await recRes.json();
        const gRes = await fetch(`/api/${kind}s/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec.data) });
        const g = await gRes.json();
        if (!gRes.ok) return null;
        return { filename: g.filename, type: kind, markdown: g.markdown, pdf: g.pdf,
          displayName: kind === 'session'
            ? (item.sessionNumber ? `Session ${String(item.sessionNumber).padStart(3, '0')}` : (item.goal || item.id))
            : (item.name || item.id) };
      };
      const [s, e] = await Promise.all([
        Promise.allSettled(sessions.filter(x => x.exists !== false).map(x => gen(x, 'session'))),
        Promise.allSettled(encounters.filter(x => x.exists !== false).map(x => gen(x, 'encounter'))),
      ]);
      [...s, ...e].forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });
      return files;
    } });
  }

  function onConnections() {
    openConnections({
      title: `${npc.name} Connections`,
      subtitle: 'All sessions and encounter plans currently linked to this NPC.',
      sections: [
        { title: 'Linked Sessions', empty: 'No linked sessions yet.',
          items: sessions.map(s => ({ label: s.sessionNumber ? `Session ${String(s.sessionNumber).padStart(3, '0')}` : s.id,
            meta: `${s.goal || s.id}${s.exists ? '' : ' · missing session'}`, url: `/view/${s.id}`, exists: s.exists })) },
        { title: 'Linked Encounter Plans', empty: 'No linked encounter plans yet.',
          items: encounters.map(e => ({ label: e.name || e.id,
            meta: `${e.id}${e.fiction ? ` · ${e.fiction.slice(0, 72)}` : ''}${e.exists ? '' : ' · missing plan'}`, url: `/encounter/view/${e.id}`, exists: e.exists })) },
      ],
    });
  }

  return (
    <>
      <div className="view-layout">
        <ViewActionSidebar
          backHref="/npcs" backLabel="All NPCs" backNative
          editLabel="Edit NPC" onEdit={() => { window.location.href = `/npc/edit/${id}`; }}
          onConnections={onConnections}
          onExport={onExport} exportConnectionsLabel="Export with Connections" onExportConnections={onExportConnections}
          onDelete={onDelete}
          showPromote={npc.status === 'draft'} onPromote={onPromote} promoting={promoting}
        />
        <main className="view-main">
          <div className="npc-view-body">
            <div className="npc-view-header" id="npc-section-identity">
              <h1 className="npc-view-name">{npc.name}{npc.nickname && <span className="npc-view-nickname">"{npc.nickname}"</span>}</h1>
              <TagEditor id={id} initialTags={npc.tags || []} apiBase="/api/npcs" className="npc-view-tags" />
            </div>

            {npc.commonPhrase && <blockquote className="npc-phrase" id="npc-section-phrase" dangerouslySetInnerHTML={{ __html: wikiRender(npc.commonPhrase) }} />}

            {npc.appearance && (
              <div className="npc-view-section" id="npc-section-appearance">
                <div className="npc-view-section-label">Appearance</div>
                <Prose text={npc.appearance} className="npc-view-prose npc-view-appearance" />
              </div>
            )}

            {coreItems.length > 0 && (
              <div className="npc-view-section" id="npc-section-core">
                <div className="npc-view-section-label">Character Core</div>
                <div className="npc-core-grid">
                  {coreItems.map(([label, text]) => (
                    <div className="npc-core-item" key={label}>
                      <div className="npc-core-label">{label}</div>
                      <Prose text={text} className="npc-view-prose" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {filledSkills.length > 0 && (
              <div className="npc-view-section" id="npc-section-skills">
                <div className="npc-view-section-label">Skill Triggers <span className="npc-dm-only">— DM only</span></div>
                <div className="npc-skills-view-grid">
                  {filledSkills.map(([k, label]) => (
                    <div className="npc-skill-card" key={k}>
                      <div className="npc-skill-label">{SKILL_PREFIXES[k]} <span className="npc-skill-sub">({label})</span></div>
                      <Prose text={skills[k]} className="npc-view-prose" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {npc.carrying?.length > 0 && (
              <div className="npc-view-section" id="npc-section-carrying">
                <div className="npc-view-section-label">Carrying</div>
                <ul className="npc-carry-list">{npc.carrying.map((i, k) => <li key={k}>{i}</li>)}</ul>
              </div>
            )}

            <div className="npc-view-section">
              <div className="npc-view-section-label">Connections</div>
              <LinksEditor
                key={`${id}-${sessions.length}-${encounters.length}`}
                id={id}
                apiBase="/api/npcs"
                groups={[
                  {
                    key: 'linkedSessions',
                    label: 'Sessions',
                    listApi: '/api/sessions',
                    toOption: s => ({ value: s.id, label: s.goal ? `${String(s.sessionNumber || '').padStart(3, '0')} — ${s.goal}` : `Session ${String(s.sessionNumber || s.id).padStart(3, '0')}` }),
                    getHref: sid => `/view/${sid}`,
                    initial: sessions.map(s => ({
                      id: s.id,
                      label: s.goal || `Session ${String(s.sessionNumber || s.id).padStart(3, '0')}`,
                      href: `/view/${s.id}`,
                    })),
                  },
                  {
                    key: 'linkedEncounters',
                    label: 'Encounter Plans',
                    listApi: '/api/encounters',
                    toOption: e => ({ value: e.id, label: e.name || e.id }),
                    getHref: eid => `/encounter/view/${eid}`,
                    initial: encounters.map(e => ({ id: e.id, label: e.name || e.id, href: `/encounter/view/${e.id}` })),
                  },
                ]}
              />
            </div>
          </div>
        </main>
      </div>
      <aside id="toc-nav" className="toc-nav">
        {tocSections.length > 0 && (
          <div className="toc-inner">
            <p className="toc-head">Contents</p>
            {tocSections.map(([sid, label]) => <a key={sid} href={`#${sid}`} className="toc-link">{label}</a>)}
          </div>
        )}
      </aside>
    </>
  );
}
