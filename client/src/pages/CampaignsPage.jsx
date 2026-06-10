import React, { useEffect, useRef, useState } from 'react';
import { toast, confirmDialog, promptDialog, openExport } from '../lib/vanilla.js';

const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
const slug = (v, fb = 'campaign') => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fb;

// Builds the per-record export files for a campaign bundle (markdown/pdf/json).
async function buildExportFiles(id, name) {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}/export`);
  const bundle = await res.json();
  if (!res.ok) throw new Error(bundle.error || 'Export failed');
  const files = [{ filename: `${slug(name)}-export-${new Date().toISOString().slice(0, 10)}`, displayName: `${name} Campaign Bundle`, type: 'bundle', json: JSON.stringify(bundle, null, 2) }];
  const gen = async (items, path, usePreviewData, displayFn, type) => Promise.allSettled((items || []).map(async item => {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(usePreviewData ? (item.data || item) : item) });
    const g = await r.json();
    if (!r.ok) return null;
    return { filename: g.filename, displayName: displayFn(item), type, markdown: g.markdown, pdf: g.pdf };
  }));
  const results = await Promise.all([
    gen(bundle.sessions, '/api/sessions/preview', true, s => s.goal || `Session ${String(s.sessionNumber || '?').padStart(3, '0')}`, 'session'),
    gen(bundle.encounters, '/api/encounters/preview', true, e => e.name || e.id, 'encounter'),
    gen(bundle.npcs, '/api/npcs/export', false, n => n.name || n.id, 'npc'),
    gen(bundle.locations, '/api/locations/export', false, l => l.name || l.id, 'location'),
    gen(bundle.factions, '/api/factions/export', false, f => f.name || f.id, 'faction'),
  ]);
  results.flat().forEach(r => { if (r.status === 'fulfilled' && r.value) files.push(r.value); });
  return files;
}

export default function CampaignsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const importRef = useRef(null);

  const load = async () => {
    try { const res = await fetch('/api/campaigns'); if (!res.ok) throw new Error(); setData(await res.json()); }
    catch { setError(true); }
  };
  useEffect(() => { document.title = 'Campaigns — D&D Session Master'; load(); }, []);

  async function onNew() {
    const name = await promptDialog('Give this campaign a name.', { title: 'New Campaign', confirmLabel: 'Create', placeholder: 'The Saltmarsh Chronicles' });
    if (!name) return;
    try {
      const res = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || 'Create failed');
      toast(`Campaign "${r.name}" created.`, 'success'); load();
    } catch (err) { toast('Failed to create campaign: ' + err.message, 'error'); }
  }

  async function onGenerateDemo() {
    const ok = await confirmDialog('This recreates the "Demo Campaign" with its example records. It will appear alongside your other campaigns.', { title: 'Generate Demo Campaign', confirmLabel: 'Generate' });
    if (!ok) return;
    try {
      const res = await fetch('/api/campaigns/demo/generate', { method: 'POST' });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || 'Generation failed');
      toast(`"${r.campaign.name}" created.`, 'success'); load();
    } catch (err) { toast('Failed to generate demo campaign: ' + err.message, 'error'); }
  }

  function onImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      let bundle;
      try { bundle = JSON.parse(ev.target.result); if (!bundle.campaign || !Array.isArray(bundle.sessions)) throw new Error(); }
      catch { toast('That file does not look like a campaign export.', 'error'); if (importRef.current) importRef.current.value = ''; return; }
      const counts = `${bundle.sessions.length} session(s), ${(bundle.encounters || []).length} encounter(s), ${(bundle.npcs || []).length} NPC(s), ${(bundle.locations || []).length} location(s), ${(bundle.factions || []).length} faction(s), ${(bundle.map ? 1 : 0)} map(s)`;
      const ok = await confirmDialog(`Import "${bundle.campaign.name || 'Imported Campaign'}" as a new campaign? This will create a new campaign containing ${counts} and its party roster.`, { title: 'Import Campaign', confirmLabel: 'Import' });
      if (!ok) { if (importRef.current) importRef.current.value = ''; return; }
      try {
        const res = await fetch('/api/campaigns/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bundle) });
        const r = await res.json();
        if (!res.ok) throw new Error(r.error || 'Import failed');
        toast(`Imported "${r.campaign.name}" — ${r.importedSessions} session(s), ${r.importedEncounters} encounter(s), ${r.importedNpcs} NPC(s), ${r.importedLocations || 0} location(s), ${r.importedFactions || 0} faction(s), ${r.importedMaps || 0} map(s).`, 'success');
        load();
      } catch (err) { toast('Import failed: ' + err.message, 'error'); }
      finally { if (importRef.current) importRef.current.value = ''; }
    };
    reader.readAsText(file);
  }

  async function onSwitch(id) {
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}/switch`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error || 'Switch failed');
      window.location.href = '/'; // full reload — switching changes all app data
    } catch (err) { toast('Switch failed: ' + err.message, 'error'); }
  }

  async function onRename(id, currentName) {
    const name = await promptDialog('Enter a new name for this campaign.', { title: 'Rename Campaign', confirmLabel: 'Save', defaultValue: currentName, placeholder: 'Campaign name' });
    if (!name) return;
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || 'Rename failed');
      toast('Campaign renamed.', 'success'); load();
    } catch (err) { toast('Rename failed: ' + err.message, 'error'); }
  }

  async function onDelete(id, name, isActive) {
    const ok = await confirmDialog(
      isActive
        ? `"${name}" is your active campaign. All its sessions, encounters, NPCs, locations, factions, and map will be permanently deleted. This cannot be undone.`
        : `Delete "${name}"? All sessions, encounters, NPCs, locations, factions, and the campaign map will be permanently deleted. This cannot be undone.`,
      { title: `Delete ${name}`, confirmLabel: 'Delete Campaign', danger: true });
    if (!ok) return;
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || 'Delete failed');
      toast('Campaign deleted.', 'success');
      if (isActive) window.location.href = '/'; else load();
    } catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  }

  const onExport = (id, name) => openExport({
    title: `Export Campaign: ${name}`,
    formatOptions: [
      { id: 'md', label: 'Markdown', ext: '.md', checked: true },
      { id: 'pdf', label: 'PDF', ext: '.pdf', checked: true },
      { id: 'json', label: 'JSON Bundle', ext: '.json', checked: true },
    ],
    loadFiles: () => buildExportFiles(id, name),
  });

  const campaigns = data?.campaigns || [];
  const activeId = data?.activeCampaignId;
  const hasDemo = campaigns.some(c => c.isDemo);

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <h1 className="page-title">Campaigns</h1>
      <p className="page-subtitle">Each campaign has its own sessions, encounters, NPCs, locations, factions, map, and party roster. Switch between them at any time.</p>

      {error ? <div className="empty-state"><p>Could not load campaigns.</p></div>
        : !data ? <div className="empty-state"><p>Loading campaigns…</p></div>
        : !campaigns.length ? <div className="empty-state"><p>No campaigns yet.</p></div>
        : campaigns.map(c => {
            const isActive = c.id === activeId;
            return (
              <div className={`campaign-row${isActive ? ' is-active' : ''}`} key={c.id}>
                <div className="campaign-row-main">
                  <div className="campaign-row-name">
                    {isActive && <span className="campaign-active-badge">Active</span>}
                    {c.isDemo && <span className="campaign-demo-badge">Demo</span>}
                    {c.name}
                  </div>
                  {c.description && <div className="campaign-row-desc">{c.description}</div>}
                  <div className="campaign-row-meta">Created {fmtDate(c.createdAt)}</div>
                </div>
                <div className="campaign-row-actions">
                  {isActive ? <span className="campaign-current-label">Current</span>
                    : <button className="btn btn-ghost btn-sm" onClick={() => onSwitch(c.id)}>Switch To</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => onRename(c.id, c.name)}>Rename</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => onExport(c.id, c.name)}>Export…</button>
                  {campaigns.length > 1 && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => onDelete(c.id, c.name, isActive)}>Delete</button>}
                </div>
              </div>
            );
          })}

      <div className="campaign-page-actions" style={{ marginTop: 24 }}>
        <button type="button" className="btn btn-primary" onClick={onNew}>+ New Campaign</button>
        <label className="btn btn-ghost" style={{ cursor: 'pointer' }} onClick={() => importRef.current?.click()}>Import Campaign…</label>
        <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={onImportFile} />
        {!hasDemo && <button type="button" className="btn btn-ghost" onClick={onGenerateDemo}>↻ Generate Demo Campaign</button>}
      </div>
      <p className="settings-hint" style={{ marginTop: 10 }}>
        Export a campaign to a JSON file from its row, then import it here — on this machine or another — to recreate it as a new campaign with its own sessions, encounters, NPCs, locations, factions, map, and party roster.
      </p>
    </div>
  );
}
