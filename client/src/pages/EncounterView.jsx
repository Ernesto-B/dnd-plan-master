import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ViewActionSidebar from '../components/ViewActionSidebar.jsx';
import { wikiPreload, toast, confirmDialog, mountTags, openExport, openConnections } from '../lib/vanilla.js';
import { renderMarkdown, buildMarkdownToc } from '../lib/markdown.js';

export default function EncounterView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [enc, setEnc] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [npcs, setNpcs] = useState([]);
  const [error, setError] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const tagsMounted = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [encRes, linksRes, npcRes] = await Promise.all([
          fetch(`/api/encounters/${id}`),
          fetch(`/api/encounters/${id}/links`),
          fetch(`/api/encounters/${id}/linked-npcs`),
          wikiPreload(),
        ]);
        if (!encRes.ok) throw new Error('not found');
        const data = await encRes.json();
        if (!alive) return;
        setEnc(data);
        setSessions(linksRes.ok ? await linksRes.json() : []);
        setNpcs(npcRes.ok ? await npcRes.json() : []);
        document.title = `${data.name} — D&D Session Master`;
      } catch { if (alive) setError(true); }
    })();
    return () => { alive = false; };
  }, [id]);

  // After the markdown is in the DOM: build the heading TOC + mount tags once.
  useEffect(() => {
    if (!enc || tagsMounted.current) return;
    buildMarkdownToc();
    const anchor = document.getElementById('tags-anchor');
    if (anchor) { anchor.innerHTML = ''; mountTags(id, enc.data?.tags || [], '/api/encounters', '#tags-anchor'); tagsMounted.current = true; }
  }, [enc, id]);

  if (error) return (
    <div className="view-layout"><main className="view-main">
      <div className="empty-state"><p>Encounter plan not found.</p><a href="/encounters" className="btn btn-ghost">← Back</a></div>
    </main></div>
  );
  if (!enc) return <div className="view-layout"><main className="view-main"><div className="empty-state"><p>Loading encounter plan…</p></div></main></div>;

  async function onDelete() {
    const ok = await confirmDialog('Move this encounter plan to trash? You can restore it later from Settings.', {
      title: 'Move Encounter Plan to Trash', confirmLabel: 'Move to Trash', danger: true });
    if (!ok) return;
    try {
      const res = await fetch(`/api/encounters/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      toast('Encounter plan moved to trash.', 'success');
      setTimeout(() => navigate('/encounters'), 800);
    } catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  }

  async function onPromote() {
    setPromoting(true);
    try {
      const res = await fetch(`/api/encounters/${id}/state`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      toast('Draft promoted to encounter plan.', 'success');
      setTimeout(() => window.location.reload(), 700);
    } catch (err) { toast('Promote failed: ' + err.message, 'error'); setPromoting(false); }
  }

  const exportEncFile = async () => {
    const res = await fetch('/api/encounters/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(enc.data) });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || 'Generation failed');
    return { filename: r.filename, displayName: enc.name || r.filename, type: 'encounter', markdown: r.markdown, pdf: r.pdf };
  };

  function onExport() { openExport({ title: 'Export Encounter Plan', loadFiles: async () => [await exportEncFile()] }); }

  function onExportConnections() {
    openExport({ title: 'Export Encounter with Connections', loadFiles: async () => {
      const files = [await exportEncFile()];
      const jobs = npcs.filter(l => l.exists).map(async link => {
        const npcRes = await fetch(`/api/npcs/${encodeURIComponent(link.id)}`);
        if (!npcRes.ok) return null;
        const npc = await npcRes.json();
        const gRes = await fetch('/api/npcs/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(npc) });
        const g = await gRes.json();
        if (!gRes.ok) return null;
        return { filename: g.filename, displayName: link.name || link.id, type: 'npc', markdown: g.markdown, pdf: g.pdf };
      });
      (await Promise.allSettled(jobs)).forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });
      return files;
    } });
  }

  function onConnections() {
    openConnections({
      title: `${enc.name || enc.id} Connections`,
      subtitle: 'All records currently linked to this encounter plan.',
      sections: [
        { title: 'Linked Sessions', empty: 'No linked sessions yet.',
          items: sessions.map(l => ({ label: l.sessionNumber ? `Session ${String(l.sessionNumber).padStart(3, '0')}` : l.id,
            meta: `${l.goal || l.id}${l.exists ? '' : ' · missing session'}`, url: `/view/${l.id}`, exists: l.exists })) },
        { title: 'Linked NPCs', empty: 'No linked NPCs yet.',
          items: npcs.map(n => ({ label: n.name || n.id, meta: `${n.id}${n.nickname ? ` · "${n.nickname}"` : ''}`, url: `/npc/view/${n.id}`, exists: n.exists })) },
      ],
    });
  }

  return (
    <>
      <div className="view-layout">
        <ViewActionSidebar
          backHref="/encounters" backLabel="All Encounters" backNative
          editLabel="Edit Plan" onEdit={() => { window.location.href = `/encounter/edit/${id}`; }}
          onConnections={onConnections}
          onExport={onExport} exportConnectionsLabel="Export with Connections" onExportConnections={onExportConnections}
          onDelete={onDelete}
          showPromote={enc.status === 'draft'} onPromote={onPromote} promoting={promoting}
        />
        <main className="view-main">
          <div id="tags-anchor" />
          <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(enc.markdown || '') }} />
        </main>
      </div>
      <aside id="toc-nav" className="toc-nav" />
    </>
  );
}
