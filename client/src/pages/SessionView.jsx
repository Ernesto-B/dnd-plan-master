import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import ViewActionSidebar from '../components/ViewActionSidebar.jsx';
import { wikiPreload, toast, confirmDialog, mountTags, openExport, openConnections } from '../lib/vanilla.js';
import { renderMarkdown, buildMarkdownToc } from '../lib/markdown.js';
import { renderDmTableHTML } from '../lib/dmTable.js';

const fmtNum = v => { const r = String(v ?? '?'); return r.includes('.') ? r : r.padStart(3, '0'); };

export default function SessionView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [encounters, setEncounters] = useState([]);
  const [npcs, setNpcs] = useState([]);
  const [error, setError] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);
  const tagsMounted = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [sRes, lRes, nRes] = await Promise.all([
          fetch(`/api/sessions/${id}`),
          fetch(`/api/sessions/${id}/links`),
          fetch(`/api/sessions/${id}/linked-npcs`),
          wikiPreload(),
        ]);
        if (!sRes.ok) throw new Error('not found');
        const data = await sRes.json();
        if (!alive) return;
        setSession(data);
        setEncounters(lRes.ok ? await lRes.json() : []);
        setNpcs(nRes.ok ? await nRes.json() : []);
        document.title = `Session ${id} — D&D Session Master`;
      } catch { if (alive) setError(true); }
    })();
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    if (!session || tagsMounted.current) return;
    buildMarkdownToc();
    const anchor = document.getElementById('tags-anchor');
    if (anchor) { anchor.innerHTML = ''; mountTags(id, session.data?.tags || [], '/api/sessions', '#tags-anchor'); tagsMounted.current = true; }
  }, [session, id]);

  // Lock body scroll + Escape-to-close while the DM modal is open.
  useEffect(() => {
    if (!dmOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = e => { if (e.key === 'Escape') setDmOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  }, [dmOpen]);

  if (error) return (
    <div className="view-layout"><main className="view-main">
      <div className="empty-state"><p>Session not found.</p><a href="/sessions" className="btn btn-ghost">← Back</a></div>
    </main></div>
  );
  if (!session) return <div className="view-layout"><main className="view-main"><div className="empty-state"><p>Loading session…</p></div></main></div>;

  async function onDelete() {
    const ok = await confirmDialog(`Move Session ${id} to trash? You can restore it later from Settings.`, {
      title: 'Move Session to Trash', confirmLabel: 'Move to Trash', danger: true });
    if (!ok) return;
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      toast('Session moved to trash.', 'success');
      setTimeout(() => navigate('/sessions'), 800);
    } catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  }

  async function onPromote() {
    setPromoting(true);
    try {
      const res = await fetch(`/api/sessions/${id}/state`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) });
      if (!res.ok) throw new Error((await res.json()).error || 'failed');
      toast('Draft promoted to session.', 'success');
      setTimeout(() => window.location.reload(), 700);
    } catch (err) { toast('Promote failed: ' + err.message, 'error'); setPromoting(false); }
  }

  const displayName = session.data?.goal || `Session ${fmtNum(session.sessionNumber || session.data?.sessionNumber)}`;
  const exportSessionFile = async () => {
    const res = await fetch('/api/sessions/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(session.data) });
    const r = await res.json();
    if (!res.ok) throw new Error(r.error || 'Generation failed');
    return { filename: r.filename, displayName, type: 'session', markdown: r.markdown, pdf: r.pdf };
  };
  function onExport() { openExport({ title: 'Export Session', loadFiles: async () => [await exportSessionFile()] }); }
  function onExportConnections() {
    openExport({ title: 'Export Session with Connections', loadFiles: async () => {
      const files = [await exportSessionFile()];
      const gen = async (item, kind, path, usePreviewData) => {
        const recRes = await fetch(`/api/${kind}s/${encodeURIComponent(item.id)}`);
        if (!recRes.ok) return null;
        const rec = await recRes.json();
        const gRes = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(usePreviewData ? rec.data : rec) });
        const g = await gRes.json();
        if (!gRes.ok) return null;
        return { filename: g.filename, displayName: item.name || item.id, type: kind, markdown: g.markdown, pdf: g.pdf };
      };
      const jobs = [
        ...encounters.filter(l => l.exists).map(l => gen(l, 'encounter', '/api/encounters/preview', true)),
        ...npcs.filter(l => l.exists).map(l => gen(l, 'npc', '/api/npcs/export', false)),
      ];
      (await Promise.allSettled(jobs)).forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });
      return files;
    } });
  }
  function onConnections() {
    openConnections({
      title: `Session ${fmtNum(session.sessionNumber)} Connections`,
      subtitle: 'All records currently linked to this session.',
      sections: [
        { title: 'Linked NPCs', empty: 'No linked NPCs yet.',
          items: npcs.map(n => ({ label: n.name || n.id, meta: `${n.id}${n.nickname ? ` · "${n.nickname}"` : ''}${n.exists ? '' : ' · missing NPC'}`, url: `/npc/view/${n.id}`, exists: n.exists })) },
        { title: 'Linked Encounter Plans', empty: 'No linked encounter plans yet.',
          items: encounters.map(e => ({ label: e.name || e.id, meta: `${e.id}${e.exists ? '' : ' · missing plan'}`, url: `/encounter/view/${e.id}`, exists: e.exists })) },
      ],
    });
  }

  function printDm() {
    document.body.classList.add('dm-print-mode');
    window.addEventListener('afterprint', () => document.body.classList.remove('dm-print-mode'), { once: true });
    setTimeout(() => window.print(), 50);
  }

  return (
    <>
      <div className="view-layout">
        <ViewActionSidebar
          backHref="/sessions" backLabel="All Sessions" backNative
          primaryActions={[{ icon: 'run', label: 'Run Session', onClick: () => { window.location.href = `/run/${id}`; } }]}
          extraActions={[{ icon: 'table', label: 'DM Table', onClick: () => setDmOpen(true) }]}
          editLabel="Edit Session" onEdit={() => { window.location.href = `/form?edit=${id}`; }}
          onConnections={onConnections}
          onExport={onExport} exportConnectionsLabel="Export with Connections" onExportConnections={onExportConnections}
          onDelete={onDelete}
          showPromote={session.status === 'draft'} onPromote={onPromote} promoting={promoting}
        />
        <main className="view-main">
          <div id="tags-anchor" />
          <div className="markdown-body" id="session-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(session.markdown || '') }} />
        </main>
      </div>
      <aside id="toc-nav" className="toc-nav" />

      {createPortal(
        <div id="dm-modal" className="dm-modal" hidden={!dmOpen} aria-modal="true" role="dialog">
          <div className="dm-modal-backdrop" onClick={() => setDmOpen(false)} />
          <div className="dm-modal-sheet">
            <div className="dm-modal-bar">
              <span className="dm-modal-label">DM Table</span>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={printDm}>Print</button>
              <button className="dm-modal-close" aria-label="Close" onClick={() => setDmOpen(false)}>×</button>
            </div>
            <div className="dm-modal-body" id="dm-modal-body"
                 dangerouslySetInnerHTML={{ __html: dmOpen ? renderDmTableHTML(session, encounters, npcs) : '' }} />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
