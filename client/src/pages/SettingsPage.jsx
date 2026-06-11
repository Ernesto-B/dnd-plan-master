import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormToc } from '../components/form/FormKit.jsx';
import { toast, toastAction, confirmDialog, openExport } from '../lib/vanilla.js';
import {
  getDefinitions, getDefaultShortcuts, canonicalizeShortcutString, eventToCombo,
  loadStoredShortcuts, saveStoredShortcuts,
} from '../lib/shortcuts.js';

const SECTIONS = [
  { id: 'settings-appearance', num: '01', label: 'Appearance' },
  { id: 'settings-party', num: '02', label: 'Party Roster' },
  { id: 'settings-export-import', num: '03', label: 'Export & Import' },
  { id: 'settings-backups', num: '04', label: 'Backups' },
  { id: 'settings-trash', num: '05', label: 'Archive & Trash' },
  { id: 'settings-link-health', num: '06', label: 'Link Health' },
  { id: 'settings-danger', num: '!', label: 'Danger Zone' },
];
const PREVIEW_TYPES = ['session', 'encounter', 'npc', 'location', 'faction'];
const TYPE_LABEL = { session: 'Session', encounter: 'Encounter', npc: 'NPC', location: 'Location', faction: 'Faction', map: 'Map' };
const clampScale = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(0.85, Math.min(1.25, Math.round(n * 100) / 100)) : 1; };
const slug = (v, fb = 'campaign') => String(v || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fb;
const fmtDate = v => { try { return new Date(v).toLocaleString(); } catch { return v; } };

// Build relationship maps for "Select All Related".
function buildMaps(d) {
  const m = {};
  ['se', 'es', 'sn', 'ns', 'sl', 'ls', 'en', 'ne', 'sf', 'fs', 'ef', 'fe', 'nf', 'fn', 'lf', 'fl'].forEach(k => (m[k] = new Map()));
  const add = (map, k, v) => { if (!k || !v) return; if (!map.has(k)) map.set(k, new Set()); map.get(k).add(v); };
  for (const e of d.encounters) if (e.sessionId) { add(m.se, e.sessionId, e.id); add(m.es, e.id, e.sessionId); }
  for (const s of d.sessions) {
    for (const c of s.data?.encounters || []) if (c.encounterPlanId) { add(m.se, s.id, c.encounterPlanId); add(m.es, c.encounterPlanId, s.id); }
    for (const id of s.data?.linkedNpcs || []) { add(m.sn, s.id, id); add(m.ns, id, s.id); }
    for (const id of s.data?.linkedLocations || []) { add(m.sl, s.id, id); add(m.ls, id, s.id); }
  }
  for (const n of d.npcs) { for (const id of n.linkedSessions || []) { add(m.ns, n.id, id); add(m.sn, id, n.id); } for (const id of n.linkedEncounters || []) { add(m.ne, n.id, id); add(m.en, id, n.id); } }
  for (const l of d.locations) for (const id of l.linkedSessions || []) { add(m.ls, l.id, id); add(m.sl, id, l.id); }
  for (const f of d.factions) {
    for (const id of f.linkedSessions || []) { add(m.fs, f.id, id); add(m.sf, id, f.id); }
    for (const id of f.linkedEncounters || []) { add(m.fe, f.id, id); add(m.ef, id, f.id); }
    for (const id of f.linkedNpcs || []) { add(m.fn, f.id, id); add(m.nf, id, f.id); }
    for (const id of f.linkedLocations || []) { add(m.fl, f.id, id); add(m.lf, id, f.id); }
  }
  return m;
}

async function buildCampaignExportFiles(id, name) {
  const bundle = await (await fetch(`/api/campaigns/${encodeURIComponent(id)}/export`)).json();
  const files = [{ filename: `${slug(name)}-export-${new Date().toISOString().slice(0, 10)}`, displayName: `${name} Campaign Bundle`, type: 'bundle', json: JSON.stringify(bundle, null, 2) }];
  const gen = (items, path, usePrev, disp, type) => Promise.allSettled((items || []).map(async it => {
    const g = await (await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(usePrev ? (it.data || it) : it) })).json();
    return g.filename ? { filename: g.filename, displayName: disp(it), type, markdown: g.markdown, pdf: g.pdf } : null;
  }));
  const r = await Promise.all([
    gen(bundle.sessions, '/api/sessions/preview', true, s => s.goal || `Session ${String(s.sessionNumber || '?').padStart(3, '0')}`, 'session'),
    gen(bundle.encounters, '/api/encounters/preview', true, e => e.name || e.id, 'encounter'),
    gen(bundle.npcs, '/api/npcs/export', false, n => n.name || n.id, 'npc'),
    gen(bundle.locations, '/api/locations/export', false, l => l.name || l.id, 'location'),
    gen(bundle.factions, '/api/factions/export', false, f => f.name || f.id, 'faction'),
  ]);
  r.flat().forEach(x => { if (x.status === 'fulfilled' && x.value) files.push(x.value); });
  return files;
}

const Toggle = ({ on, onClick }) => <button type="button" className="btn btn-ghost" style={{ minWidth: 120 }} onClick={onClick}>{on ? 'On' : 'Off'}</button>;

export default function SettingsPage() {
  const [s, setS] = useState({ party: [], theme: 'dark', uiScale: 1, autosaveEnabled: true, scheduledBackupsEnabled: false, scheduledBackupIntervalHours: 24, shortcuts: {} });
  const loaded = useRef(false);
  const saveTimer = useRef(null);
  const [status, setStatus] = useState('Changes save automatically.');
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [hover, setHover] = useState({ enabled: localStorage.getItem('dnd-hover-preview-enabled') !== 'false', delay: localStorage.getItem('dnd-hover-preview-delay') || '500' });
  const [scOpen, setScOpen] = useState(false);

  const set = patch => setS(prev => ({ ...prev, ...patch }));

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.title = 'Settings — D&D Session Master';
    (async () => {
      try {
        const cfg = await (await fetch('/api/settings')).json();
        setS({
          party: cfg.party || [], theme: cfg.theme || document.documentElement.getAttribute('data-theme') || 'dark',
          uiScale: clampScale(cfg.uiScale || 1), autosaveEnabled: cfg.autosaveEnabled !== false,
          scheduledBackupsEnabled: cfg.scheduledBackupsEnabled === true, scheduledBackupIntervalHours: cfg.scheduledBackupIntervalHours || 24,
          shortcuts: cfg.shortcuts || loadStoredShortcuts(),
        });
        if (cfg.shortcuts) saveStoredShortcuts(cfg.shortcuts);
      } catch { /* defaults */ }
      loaded.current = true;
    })();
    fetch('/api/campaigns/active').then(r => r.json()).then(setActiveCampaign).catch(() => {});
    loadExport(); loadBackups(); loadLifecycle();
  }, []); // eslint-disable-line

  // ── Debounced save to /api/settings ────────────────────────────────────────
  useEffect(() => {
    if (!loaded.current) return;
    setStatus('Saving changes…');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...s, party: s.party.filter(p => p.name || p.playerClass) }) });
        if (!res.ok) throw new Error();
        setStatus('Changes saved.');
      } catch { setStatus('Could not save changes.'); }
    }, 200);
  }, [s]);

  // Apply theme + UI scale to the document live.
  useEffect(() => { document.documentElement.setAttribute('data-theme', s.theme); localStorage.setItem('dnd-theme', s.theme); }, [s.theme]);
  useEffect(() => { document.documentElement.style.setProperty('--ui-scale', String(s.uiScale)); localStorage.setItem('dnd-ui-scale', String(s.uiScale)); }, [s.uiScale]);

  const setHoverEnabled = on => { localStorage.setItem('dnd-hover-preview-enabled', on ? 'true' : 'false'); setHover(h => ({ ...h, enabled: on })); };
  const setHoverDelay = v => { const val = Math.max(100, Math.min(5000, parseInt(v, 10) || 500)); localStorage.setItem('dnd-hover-preview-delay', String(val)); setHover(h => ({ ...h, delay: String(val) })); };

  // ── Export ─────────────────────────────────────────────────────────────────
  const [exportData, setExportData] = useState(null);
  const [exportQuery, setExportQuery] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const maps = useRef({});
  const loadExport = useCallback(async () => {
    try {
      const d = await (await fetch('/api/settings/export-data')).json();
      ['sessions', 'encounters', 'npcs', 'locations', 'factions', 'maps'].forEach(k => { d[k] = Array.isArray(d[k]) ? d[k] : []; });
      maps.current = buildMaps(d);
      setExportData(d);
    } catch { setExportData({ error: true }); }
  }, []);
  const exportItems = useMemo(() => {
    if (!exportData || exportData.error) return [];
    const mk = (arr, type, label) => arr.map(x => ({ type, id: x.id, label: label(x), tags: x.tags || [] }));
    return [
      ...mk(exportData.sessions, 'session', x => x.goal || `Session #${x.sessionNumber}`),
      ...mk(exportData.encounters, 'encounter', x => x.name || x.id),
      ...mk(exportData.npcs, 'npc', x => x.name || x.id),
      ...mk(exportData.locations, 'location', x => x.name || x.id),
      ...mk(exportData.factions, 'faction', x => x.name || x.id),
      ...mk(exportData.maps, 'map', x => x.name || 'Campaign Map'),
    ];
  }, [exportData]);
  const exFiltered = useMemo(() => {
    const q = exportQuery.trim().toLowerCase();
    return q ? exportItems.filter(i => [i.id, i.label, (i.tags || []).join(' '), i.type].join(' ').toLowerCase().includes(q)) : exportItems;
  }, [exportItems, exportQuery]);
  const exKey = i => `${i.type}:${i.id}`;
  const toggleSel = key => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const selectAll = () => setSelected(new Set(exportItems.map(exKey)));
  const deselectAll = () => setSelected(new Set());
  const selectRelated = () => {
    const m = maps.current; const avail = new Set(exportItems.map(exKey)); const next = new Set(selected);
    const addKeys = (type, ids) => (ids || new Set()).forEach(id => { const k = `${type}:${id}`; if (avail.has(k)) next.add(k); });
    for (const key of selected) {
      const [type, ...rest] = key.split(':'); const id = rest.join(':');
      if (type === 'session') { addKeys('encounter', m.se.get(id)); addKeys('npc', m.sn.get(id)); addKeys('location', m.sl.get(id)); addKeys('faction', m.sf.get(id)); }
      else if (type === 'encounter') { addKeys('session', m.es.get(id)); addKeys('npc', m.en.get(id)); addKeys('faction', m.ef.get(id)); }
      else if (type === 'npc') { addKeys('session', m.ns.get(id)); addKeys('encounter', m.ne.get(id)); addKeys('faction', m.nf.get(id)); }
      else if (type === 'location') { addKeys('session', m.ls.get(id)); addKeys('faction', m.lf.get(id)); }
      else if (type === 'faction') { addKeys('session', m.fs.get(id)); addKeys('encounter', m.fe.get(id)); addKeys('npc', m.fn.get(id)); addKeys('location', m.fl.get(id)); }
    }
    setSelected(next);
  };
  function exportSelected() {
    const ids = t => new Set([...selected].filter(k => k.startsWith(t + ':')).map(k => k.slice(t.length + 1)));
    const si = ids('session'), ei = ids('encounter'), ni = ids('npc'), li = ids('location'), fi = ids('faction'), mi = ids('map');
    openExport({
      title: 'Export Selected Records',
      formatOptions: [{ id: 'json', label: 'JSON', ext: '.json', checked: true }],
      loadFiles: async () => {
        let mapBundles = [];
        if (mi.size) {
          const res = await fetch('/api/settings/export-data?includeMapAssets=1');
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not load map data for export.');
          mapBundles = (Array.isArray(data.maps) ? data.maps : []).filter(map => mi.has(map.campaignId));
        }
        const payload = {
          schemaVersion: 2,
          bundleType: 'settings-export',
          exportedAt: new Date().toISOString(),
          sessions: exportData.sessions.filter(x => si.has(x.id)),
          encounters: exportData.encounters.filter(x => ei.has(x.id)),
          npcs: exportData.npcs.filter(x => ni.has(x.id)),
          locations: exportData.locations.filter(x => li.has(x.id)),
          factions: exportData.factions.filter(x => fi.has(x.id)),
          maps: mapBundles,
        };
        const total = payload.sessions.length + payload.encounters.length + payload.npcs.length + payload.locations.length + payload.factions.length + payload.maps.length;
        return [{
          filename: `dnd-plans-export-${new Date().toISOString().slice(0, 10)}`,
          displayName: `${total} selected record${total === 1 ? '' : 's'}`,
          type: 'bundle',
          json: JSON.stringify(payload, null, 2),
        }];
      },
    });
  }
  function exportCampaign() {
    if (!activeCampaign?.id) { toast('Could not determine the active campaign.', 'error'); return; }
    openExport({ title: `Export Campaign: ${activeCampaign.name || 'Campaign'}`, formatOptions: [{ id: 'md', label: 'Markdown', ext: '.md', checked: true }, { id: 'pdf', label: 'PDF', ext: '.pdf', checked: true }, { id: 'json', label: 'JSON Bundle', ext: '.json', checked: true }], loadFiles: () => buildCampaignExportFiles(activeCampaign.id, activeCampaign.name || 'Campaign') });
  }

  // ── Import ─────────────────────────────────────────────────────────────────
  const [importFile, setImportFile] = useState(null);
  const [importName, setImportName] = useState('No file selected');
  const [importPreview, setImportPreview] = useState(null); // { preview, resolution }
  const [importReport, setImportReport] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const importInputRef = useRef(null);
  const importAction = item => {
    if (!importPreview) return item.recommendedAction;
    return importPreview.resolution.overrides[item.key] || importPreview.resolution.defaults[item.status] || item.recommendedAction;
  };
  const importCount = importPreview?.preview?.items?.filter(i => importAction(i) !== 'skip').length || 0;
  function onImportFile(e) {
    const file = e.target.files[0];
    if (!file) { setImportName('No file selected'); setImportFile(null); setImportPreview(null); return; }
    setImportName(file.name);
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.sessions && !data.encounters && !data.npcs && !data.locations && !data.factions && !data.maps) throw new Error();
        setImportFile(data);
        const res = await fetch('/api/settings/import-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const preview = await res.json();
        if (!res.ok) throw new Error(preview.error || 'That file could not be imported.');
        setImportPreview({ preview, resolution: { defaults: { duplicate: 'skip', conflict: 'clone', 'missing-id': 'clone' }, overrides: {} } });
      } catch (err) {
        setImportName(err?.message || 'Invalid JSON file');
        setImportFile(null);
        setImportPreview(null);
      }
    };
    reader.readAsText(file);
  }
  async function doImport() {
    if (!importFile || !importPreview) return;
    setImportBusy(true);
    try {
      const res = await fetch('/api/settings/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...importFile, resolution: importPreview.resolution }) });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || 'Import failed');
      setImportReport(r.report || null);
      toast(`Imported ${r.report?.totals.imported || 0}, cloned ${r.report?.totals.cloned || 0}, replaced ${r.report?.totals.replaced || 0}, skipped ${r.report?.totals.skipped || 0}.`, 'success');
      if (importInputRef.current) importInputRef.current.value = '';
      setImportName('No file selected'); setImportFile(null); setImportPreview(null);
      loadExport(); loadBackups(); loadLifecycle();
    } catch (err) { toast('Import failed: ' + err.message, 'error'); } finally { setImportBusy(false); }
  }

  // ── Link Health ────────────────────────────────────────────────────────────
  const [brokenLinks, setBrokenLinks] = useState(null); // null = not scanned yet, [] = clean, [...] = results
  const [linkScanBusy, setLinkScanBusy] = useState(false);
  const [linkRepairBusy, setLinkRepairBusy] = useState(false);
  async function scanBrokenLinks() {
    setLinkScanBusy(true);
    try {
      const r = await (await fetch('/api/settings/broken-links')).json();
      if (r.error) throw new Error(r.error);
      setBrokenLinks(r.broken || []);
    } catch (err) { toast('Scan failed: ' + err.message, 'error'); } finally { setLinkScanBusy(false); }
  }
  async function repairLinks() {
    if (!brokenLinks?.length) return;
    const ok = await confirmDialog(`Remove ${brokenLinks.length} broken link reference(s)? This only removes dead pointers — no records are deleted.`, { title: 'Repair Broken Links', confirmLabel: 'Repair' });
    if (!ok) return;
    setLinkRepairBusy(true);
    try {
      const r = await (await fetch('/api/settings/repair-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ broken: brokenLinks }) })).json();
      if (r.error) throw new Error(r.error);
      toast(`Repaired ${r.repaired} broken link(s).`, 'success');
      setBrokenLinks([]);
    } catch (err) { toast('Repair failed: ' + err.message, 'error'); } finally { setLinkRepairBusy(false); }
  }

  // ── Backups ────────────────────────────────────────────────────────────────
  const [backups, setBackups] = useState(null);
  const loadBackups = useCallback(async () => { try { setBackups(await (await fetch('/api/settings/backups')).json()); } catch { setBackups({ error: true }); } }, []);
  async function createBackup() { try { const r = await (await fetch('/api/settings/backup', { method: 'POST' })).json(); if (r.error) throw new Error(r.error); toast(`Created backup snapshot ${r.name}.`, 'success'); loadBackups(); } catch (err) { toast('Backup failed: ' + err.message, 'error'); } }
  async function restoreBackup(name) {
    const ok = await confirmDialog(`Restore backup ${name}? This replaces the app's current sessions, encounters, NPCs, locations, factions, maps, and settings.`, { title: 'Restore Backup', confirmLabel: 'Restore', danger: true });
    if (!ok) return;
    try { const r = await (await fetch('/api/settings/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })).json(); if (r.error) throw new Error(r.error); toast('Backup restored.', 'success'); setTimeout(() => window.location.reload(), 1000); } catch (err) { toast('Restore failed: ' + err.message, 'error'); }
  }

  // ── Lifecycle (archive/trash) ───────────────────────────────────────────────
  const [lifecycle, setLifecycle] = useState(null);
  const loadLifecycle = useCallback(async () => { try { const r = await (await fetch('/api/settings/records/lifecycle')).json(); setLifecycle(Array.isArray(r.items) ? r.items : []); } catch { setLifecycle({ error: true }); } }, []);
  async function lifecycleState(items, st, msg) {
    try { const r = await (await fetch('/api/settings/records/state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, status: st }) })).json(); if (r.error) throw new Error(r.error); await Promise.all([loadExport(), loadLifecycle()]); toast(msg, 'success'); }
    catch (err) { toast('Update failed: ' + err.message, 'error'); }
  }
  async function lifecycleDelete(items, msg) {
    try { const r = await (await fetch('/api/settings/records/permanent', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })).json(); if (r.error) throw new Error(r.error); await Promise.all([loadExport(), loadLifecycle()]); toast(msg, 'success'); }
    catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  }
  async function emptyTrash() {
    const trashed = (Array.isArray(lifecycle) ? lifecycle : []).filter(i => i.status === 'trashed').map(i => ({ type: i.type, id: i.id }));
    if (!trashed.length) { toast('Trash is already empty.', 'success'); return; }
    const ok = await confirmDialog(`Permanently delete ${trashed.length} trashed record(s)? This cannot be undone.`, { title: 'Empty Trash', confirmLabel: 'Delete Permanently', danger: true });
    if (ok) lifecycleDelete(trashed, `Deleted ${trashed.length} trashed record(s).`);
  }

  // ── Danger zone ─────────────────────────────────────────────────────────────
  async function clearData() {
    const ok = await confirmDialog('Move all active sessions, encounters, NPCs, locations, and factions in this campaign to trash? You can restore them later from Archive & Trash.', { title: 'Move All to Trash', confirmLabel: 'Move to Trash', danger: true });
    if (!ok) return;
    try {
      const r = await (await fetch('/api/settings/data', { method: 'DELETE' })).json();
      if (r.error) throw new Error(r.error);
      toastAction(`Moved ${r.count || 0} active record(s) to trash.`, 'success', 'Undo', async () => {
        await fetch('/api/settings/records/state', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: r.items || [], status: 'active' }) });
        await Promise.all([loadExport(), loadLifecycle()]); toast('Restored moved records.', 'success');
      });
      await Promise.all([loadExport(), loadLifecycle()]);
    } catch (err) { toast('Error: ' + err.message, 'error'); }
  }

  // ── Party ───────────────────────────────────────────────────────────────────
  const updPlayer = (i, patch) => set({ party: s.party.map((p, j) => j === i ? { ...p, ...patch } : p) });

  return (
    <div className="settings-wrap">
      <div className="settings-main">
        <div className="settings-title-row">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Appearance, party roster, data, and backups.</p>
          </div>
          <span className="settings-save-status"><span className="settings-save-dot" />{status}</span>
        </div>

        {/* 01 Appearance */}
        <div className="settings-section-head" id="settings-appearance"><h2 className="settings-section-h">Appearance</h2></div>
        <div className="card">
          <div className="settings-inline-row"><span className="settings-inline-label">Theme</span>
            <button type="button" className="btn btn-ghost" style={{ minWidth: 120 }} onClick={() => set({ theme: s.theme === 'dark' ? 'light' : 'dark' })}>{s.theme === 'dark' ? '☀ Switch to Light' : '☽ Switch to Dark'}</button></div>
          <div className="settings-inline-row settings-inline-wrap" style={{ marginTop: 14 }}>
            <span className="settings-inline-label">UI Scale</span>
            <button type="button" className="btn btn-ghost" style={{ minWidth: 48 }} disabled={s.uiScale <= 0.85} onClick={() => set({ uiScale: clampScale(s.uiScale - 0.05) })}>A-</button>
            <input type="range" min="0.85" max="1.25" step="0.05" style={{ width: 180 }} value={s.uiScale} onChange={e => set({ uiScale: clampScale(e.target.value) })} />
            <button type="button" className="btn btn-ghost" style={{ minWidth: 48 }} disabled={s.uiScale >= 1.25} onClick={() => set({ uiScale: clampScale(s.uiScale + 0.05) })}>A+</button>
            <span className="settings-inline-meta" style={{ minWidth: 52 }}>{Math.round(s.uiScale * 100)}%</span>
            <button type="button" className="btn btn-ghost" onClick={() => set({ uiScale: 1 })}>Reset</button>
          </div>
          <p className="settings-hint" style={{ marginTop: 10 }}>Adjust the size of the entire interface, including fonts, controls, and layout density.</p>
          <div className="settings-inline-row" style={{ marginTop: 14 }}><span className="settings-inline-label">Draft Autosave</span><Toggle on={s.autosaveEnabled} onClick={() => set({ autosaveEnabled: !s.autosaveEnabled })} /></div>
          <p className="settings-hint" style={{ marginTop: 12 }}>When enabled, the session and encounter forms keep a local draft and offer to restore it later.</p>
          <div className="settings-inline-row" style={{ marginTop: 16 }}><span className="settings-inline-label">Hover Preview</span><Toggle on={hover.enabled} onClick={() => setHoverEnabled(!hover.enabled)} /></div>
          <div className="settings-inline-row settings-inline-tight" style={{ marginTop: 10, opacity: hover.enabled ? 1 : 0.4 }}>
            <span className="settings-inline-label">Preview Delay</span>
            <input type="number" min="100" max="5000" step="100" disabled={!hover.enabled} style={{ width: 70, padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)' }} value={hover.delay} onChange={e => setHover(h => ({ ...h, delay: e.target.value }))} onBlur={e => setHoverDelay(e.target.value)} />
            <span className="settings-inline-meta">ms (100–5000)</span>
          </div>
          <div className="settings-inline-row" style={{ marginTop: 16 }}><span className="settings-inline-label">Keyboard Shortcuts</span>
            <button type="button" className="btn btn-ghost" style={{ minWidth: 160 }} onClick={() => setScOpen(true)}>View / Change</button></div>
        </div>

        {/* 02 Party Roster */}
        <div className="settings-section-head" id="settings-party"><h2 className="settings-section-h">Party Roster {activeCampaign?.name && <span className="settings-campaign-tag">{activeCampaign.name}</span>}</h2></div>
        <div className="card">
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16, fontStyle: 'italic' }}>Add one row per player. This roster belongs to the active campaign and is pre-filled in encounter forms.</p>
          <div id="party-list">
            {s.party.map((p, i) => (
              <div className="form-grid party-row" key={i} style={{ gridTemplateColumns: '1fr 1fr 1.6fr auto', gap: 10, marginBottom: 8 }}>
                <div className="field"><label>Player Name</label><input type="text" placeholder="Aldric" value={p.name || ''} onChange={e => updPlayer(i, { name: e.target.value })} /></div>
                <div className="field"><label>Class / Role</label><input type="text" placeholder="Paladin" value={p.playerClass || ''} onChange={e => updPlayer(i, { playerClass: e.target.value })} /></div>
                <div className="field"><label className="party-url-label">Character Sheet URL <span className="party-url-hint">(optional)</span></label><input type="url" placeholder="https://dndbeyond.com/characters/…" value={p.characterUrl || ''} onChange={e => updPlayer(i, { characterUrl: e.target.value })} /></div>
                <div className="field" style={{ alignSelf: 'flex-end', paddingBottom: 2 }}><button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => set({ party: s.party.filter((_, j) => j !== i) })}>✕</button></div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-add" onClick={() => set({ party: [...s.party, { name: '', playerClass: '', characterUrl: '' }] })}>+ Add Player</button>
        </div>

        {/* 03 Export & Import */}
        <div className="settings-section-head" id="settings-export-import"><h2 className="settings-section-h">Export &amp; Import</h2></div>
        <div className="card">
          <h3 className="settings-subhead">Export Records</h3>
          <p className="settings-hint">Select records and the current campaign map to bundle into a JSON file you can share or import on another device.</p>
          <input type="search" className="search-input" style={{ width: '100%', margin: '12px 0' }} placeholder="Search records…" value={exportQuery} onChange={e => setExportQuery(e.target.value)} />
          <div className="export-controls">
            <button type="button" className="btn btn-ghost" onClick={selectAll}>Select All</button>
            <button type="button" className="btn btn-ghost" onClick={selectRelated}>Select All Related</button>
            <button type="button" className="btn btn-ghost" onClick={deselectAll}>Deselect All</button>
          </div>
          <div className="export-list">
            {!exportData ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading records…</p>
              : exportData.error ? <p style={{ color: 'var(--danger)', fontSize: 14 }}>Could not load records.</p>
              : !exFiltered.length ? <p style={{ padding: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{exportQuery ? 'No records match your search.' : 'No records saved yet.'}</p>
              : exFiltered.map(i => (
                  <label className="export-item" key={exKey(i)}>
                    <input type="checkbox" checked={selected.has(exKey(i))} onChange={() => toggleSel(exKey(i))} />
                    <span className={`export-type-badge ${i.type}`}>{TYPE_LABEL[i.type]}</span>
                    <span className="export-item-label">{i.label}</span>
                    <span className="export-item-id">{i.id}</span>
                  </label>
                ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-primary" disabled={!selected.size} onClick={exportSelected}>Export Selected ({selected.size})</button>
            <button type="button" className="btn btn-ghost" style={{ marginLeft: 10 }} onClick={exportCampaign}>Export Campaign…</button>
          </div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <h3 className="settings-subhead">Import Records</h3>
          <p className="settings-hint">Import a previously exported JSON file, review duplicates and conflicts, then choose how each record and map is handled.</p>
          <div className="import-row">
            <label className="btn btn-ghost" style={{ cursor: 'pointer' }} onClick={() => importInputRef.current?.click()}>Choose File</label>
            <input ref={importInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={onImportFile} />
            <span className="import-filename">{importName}</span>
          </div>
          <div style={{ marginTop: 12 }}><button type="button" className="btn btn-primary" disabled={!importPreview || importCount === 0 || importBusy} onClick={doImport}>{importBusy ? 'Importing…' : importCount ? `Import ${importCount} Record${importCount === 1 ? '' : 's'}` : 'Import'}</button></div>
          <ImportPreview state={importPreview} report={importReport} action={importAction} setDefault={(st, v) => setImportPreview(p => ({ ...p, resolution: { ...p.resolution, defaults: { ...p.resolution.defaults, [st]: v } } }))} setOverride={(k, v) => setImportPreview(p => ({ ...p, resolution: { ...p.resolution, overrides: { ...p.resolution.overrides, [k]: v } } }))} />
        </div>

        {/* 04 Backups */}
        <div className="settings-section-head" id="settings-backups"><h2 className="settings-section-h">Backups</h2></div>
        <div className="card">
          <h3 className="settings-subhead">Local Backup Snapshots</h3>
          <p className="settings-hint">Create a full local snapshot of all records, maps, and settings. Restore any snapshot later.</p>
          <div className="settings-inline-row settings-inline-wrap" style={{ marginBottom: 14 }}>
            <span className="settings-inline-label">Scheduled Backups</span><Toggle on={s.scheduledBackupsEnabled} onClick={() => set({ scheduledBackupsEnabled: !s.scheduledBackupsEnabled })} />
            <label className="settings-inline-control">Every <input type="number" min="1" max="168" step="1" style={{ width: 84 }} disabled={!s.scheduledBackupsEnabled} value={s.scheduledBackupIntervalHours} onChange={e => set({ scheduledBackupIntervalHours: Number(e.target.value) || 24 })} /> hours</label>
          </div>
          <p className="settings-hint" style={{ marginBottom: 12 }}>When enabled, the app creates snapshots automatically in the background while running. Old snapshots are pruned.</p>
          <div className="export-controls"><button type="button" className="btn btn-primary" onClick={createBackup}>Create Backup Snapshot</button></div>
          <div className="export-list" style={{ marginTop: 12 }}>
            {!backups ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading backups…</p>
              : backups.error ? <p style={{ color: 'var(--danger)', fontSize: 14 }}>Could not load backups.</p>
              : !backups.length ? <p style={{ padding: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No backups yet.</p>
              : backups.map(bk => (
                  <div className="export-item" style={{ display: 'flex', alignItems: 'center', gap: 12 }} key={bk.name}>
                    <div style={{ flex: 1 }}><div className="export-item-label">{bk.name}</div><div className="export-item-id">{bk.createdAt || 'Unknown date'} · {bk.sessionCount} session(s) · {bk.encounterCount} encounter(s) · {bk.npcCount || 0} NPC(s) · {bk.locationCount || 0} location(s) · {bk.factionCount || 0} faction(s) · {bk.mapCount || 0} map(s)</div></div>
                    <button type="button" className="btn btn-ghost" onClick={() => restoreBackup(bk.name)}>Restore</button>
                  </div>
                ))}
          </div>
        </div>

        {/* 05 Archive & Trash */}
        <div className="settings-section-head" id="settings-trash"><h2 className="settings-section-h">Archive &amp; Trash</h2></div>
        <div className="card">
          <h3 className="settings-subhead">Lifecycle Manager</h3>
          <p className="settings-hint">Archived records are hidden from lists but restorable. Trashed records are soft-deleted until restored or purged.</p>
          <div className="export-controls"><button type="button" className="btn btn-ghost" onClick={loadLifecycle}>Refresh</button><button type="button" className="btn btn-danger" onClick={emptyTrash}>Empty Trash</button></div>
          <div className="export-list" style={{ marginTop: 12 }}>
            {!lifecycle ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading archived and trashed records…</p>
              : lifecycle.error ? <p style={{ color: 'var(--danger)', fontSize: 14 }}>Could not load lifecycle records.</p>
              : !lifecycle.length ? <p style={{ padding: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No archived or trashed records.</p>
              : lifecycle.map(item => (
                  <div className="export-item lifecycle-item" key={`${item.type}:${item.id}`}>
                    <div className="lifecycle-meta">
                      <div className="lifecycle-top"><span className={`export-type-badge ${item.type}`}>{TYPE_LABEL[item.type] || item.type}</span><span className={`import-item-status ${item.status === 'trashed' ? 'conflict' : 'duplicate'}`}>{item.status === 'trashed' ? 'Trashed' : 'Archived'}</span></div>
                      <div className="export-item-label">{item.title || item.id}</div>
                      <div className="export-item-id">{item.id}{item.subtitle ? ` · ${item.subtitle}` : ''}{item.changedAt ? ` · ${fmtDate(item.changedAt)}` : ''}</div>
                    </div>
                    <div className="lifecycle-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => lifecycleState([{ type: item.type, id: item.id }], 'active', 'Record restored.')}>Restore</button>
                      {item.status === 'archived'
                        ? <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => lifecycleState([{ type: item.type, id: item.id }], 'trashed', 'Record moved to trash.')}>Move to Trash</button>
                        : <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={async () => { if (await confirmDialog(`Permanently delete ${item.id}? This cannot be undone.`, { title: 'Delete Permanently', confirmLabel: 'Delete', danger: true })) lifecycleDelete([{ type: item.type, id: item.id }], 'Record permanently deleted.'); }}>Delete Permanently</button>}
                    </div>
                  </div>
                ))}
          </div>
        </div>

        {/* 06 Link Health */}
        <div className="settings-section-head" id="settings-link-health"><h2 className="settings-section-h">Link Health</h2></div>
        <div className="card">
          <h3 className="settings-subhead">Broken Link Scanner</h3>
          <p className="settings-hint">Scan for link references that point to records that no longer exist. Broken links can accumulate when records are deleted or trashed.</p>
          <div className="export-controls">
            <button type="button" className="btn btn-primary" disabled={linkScanBusy} onClick={scanBrokenLinks}>{linkScanBusy ? 'Scanning…' : 'Scan for Broken Links'}</button>
            {brokenLinks?.length > 0 && <button type="button" className="btn btn-ghost" disabled={linkRepairBusy} onClick={repairLinks} style={{ color: 'var(--danger)' }}>{linkRepairBusy ? 'Repairing…' : `Auto-repair ${brokenLinks.length} Broken Link(s)`}</button>}
          </div>
          {brokenLinks !== null && (
            <div className="export-list" style={{ marginTop: 12 }}>
              {brokenLinks.length === 0
                ? <p style={{ padding: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No broken links found — all references are valid.</p>
                : brokenLinks.map((lk, i) => (
                    <div className="import-report-row" key={i} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className={`export-type-badge ${lk.ownerType}`}>{TYPE_LABEL[lk.ownerType] || lk.ownerType}</span>
                        <span className="import-report-label">{lk.ownerLabel || lk.ownerId}</span>
                        <span className="import-item-status conflict">broken link</span>
                      </div>
                      <div className="import-report-id" style={{ paddingLeft: 0 }}>
                        field <code>{lk.field}</code> → missing <span className={`export-type-badge ${lk.targetType}`}>{TYPE_LABEL[lk.targetType] || lk.targetType}</span> <code>{lk.brokenId}</code>
                      </div>
                    </div>
                  ))
              }
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="settings-section-head danger" id="settings-danger"><h2 className="settings-section-h">Danger Zone</h2></div>
        <div className="card" style={{ borderColor: 'rgba(191,58,46,0.35)' }}>
          <p style={{ color: 'var(--text2)', fontSize: 15, marginBottom: 16 }}>Move all active sessions, encounters, NPCs, locations, and factions in the current campaign to trash. Exported files are unaffected, and you can restore from Archive &amp; Trash.</p>
          <button type="button" className="btn btn-danger" onClick={clearData}>Move All Active Records to Trash</button>
        </div>
      </div>
      <FormToc sections={SECTIONS} />
      <ShortcutsModal open={scOpen} onClose={() => setScOpen(false)} current={s.shortcuts} onSaved={sc => set({ shortcuts: sc })} />
    </div>
  );
}

// ─── Import preview / conflict resolution ──────────────────────────────────
const IMPORT_STATUS = { new: 'New', duplicate: 'Duplicate', conflict: 'Conflict', 'missing-id': 'Missing ID' };
const IMPORT_ACTION = { import: 'Import', skip: 'Skip', clone: 'Clone With New ID', replace: 'Replace Existing' };
const IMPORT_REASON = { duplicate: 'exact duplicate', conflict: 'data conflict', 'missing-id': 'no source ID', new: 'new' };

function TypeBreakdown({ byType, mode }) {
  const rows = PREVIEW_TYPES.filter(t => byType[t]?.total > 0);
  if (!rows.length) return null;
  return (
    <div className="import-type-breakdown">
      {rows.map(type => {
        const t = byType[type];
        return (
          <div className="import-type-row" key={type}>
            <span className={`export-type-badge ${type}`}>{TYPE_LABEL[type]}</span>
            <span className="import-type-counts">
              {mode === 'preview' ? <>
                {t.new > 0 && <span className="import-summary-pill success">{t.new} new</span>}
                {t.duplicate > 0 && <span className="import-summary-pill warn">{t.duplicate} dup</span>}
                {t.conflict > 0 && <span className="import-summary-pill danger">{t.conflict} conflict</span>}
                {t['missing-id'] > 0 && <span className="import-summary-pill">{t['missing-id']} no-id</span>}
              </> : <>
                {t.imported > 0 && <span className="import-summary-pill success">{t.imported} imported</span>}
                {t.cloned > 0 && <span className="import-summary-pill accent">{t.cloned} cloned</span>}
                {t.replaced > 0 && <span className="import-summary-pill warn">{t.replaced} replaced</span>}
                {t.skipped > 0 && <span className="import-summary-pill">{t.skipped} skipped</span>}
              </>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ImportPreview({ state, report, action, setDefault, setOverride }) {
  const [showSkipped, setShowSkipped] = React.useState(false);
  const reportBlock = report ? (
    <div className="import-preview-panel" style={{ marginTop: 14 }}>
      <div className="import-preview-head">
        <div>
          <div className="settings-subhead" style={{ margin: 0 }}>Last Import Report</div>
          <p className="settings-hint" style={{ marginTop: 6 }}>
            {report.totals.imported} imported · {report.totals.cloned} cloned · {report.totals.replaced} replaced · {report.totals.skipped} skipped
          </p>
        </div>
      </div>
      <div className="import-preview-summary">
        <span className="import-summary-pill success">Processed {report.totals.processed}</span>
        <span className="import-summary-pill">Remapped {report.remappedIds.length}</span>
        {report.skippedItems?.length > 0 && <span className="import-summary-pill">{report.skippedItems.length} skipped</span>}
      </div>
      <TypeBreakdown byType={report.byType} mode="report" />
      {report.remappedIds.length > 0 && (
        <>
          <p className="settings-hint" style={{ margin: '12px 0 6px', fontWeight: 600, color: 'var(--text2)' }}>Remapped IDs</p>
          <div className="import-report-list">
            {report.remappedIds.map((it, i) => (
              <div className="import-report-row" key={i}>
                <span className={`export-type-badge ${it.type}`}>{TYPE_LABEL[it.type] || it.type}</span>
                <span className="import-report-label">{it.label || it.fromId || 'Untitled'}</span>
                <span className="import-report-id">{it.fromId} → {it.toId}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {report.skippedItems?.length > 0 && (
        <>
          <button type="button" className="btn btn-ghost" style={{ marginTop: 10, fontSize: 12, padding: '3px 10px' }} onClick={() => setShowSkipped(s => !s)}>
            {showSkipped ? '▲ Hide' : '▶ Show'} {report.skippedItems.length} skipped record(s)
          </button>
          {showSkipped && (
            <div className="import-report-list" style={{ marginTop: 6 }}>
              {report.skippedItems.map((it, i) => (
                <div className="import-report-row" key={i}>
                  <span className={`export-type-badge ${it.type}`}>{TYPE_LABEL[it.type] || it.type}</span>
                  <span className="import-report-label">{it.label || it.sourceId || 'Untitled'}</span>
                  <span className="import-report-id">skipped · {IMPORT_REASON[it.reason] || it.reason}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {!report.remappedIds.length && !report.skippedItems?.length && (
        <p className="settings-hint" style={{ margin: '10px 0 0' }}>No IDs remapped and no records skipped.</p>
      )}
    </div>
  ) : null;

  if (!state) return <div className="settings-hint" style={{ marginTop: 12 }}>{reportBlock}</div>;
  const { preview, resolution } = state;
  const decisionItems = preview.items.filter(i => i.status !== 'new');
  const selectedCount = preview.items.filter(i => action(i) !== 'skip').length;
  return (
    <div className="settings-hint" style={{ marginTop: 12 }}>
      <div className="import-preview-panel">
        <div className="import-preview-head"><div><div className="settings-subhead" style={{ margin: 0 }}>Import Preview</div><p className="settings-hint" style={{ marginTop: 6 }}>Review duplicates and conflicts before writing anything. New records import unchanged.</p></div></div>
        <div className="import-preview-summary">
          <span className="import-summary-pill success">{preview.counts.new} new</span>
          <span className="import-summary-pill warn">{preview.counts.duplicate} duplicates</span>
          <span className="import-summary-pill danger">{preview.counts.conflict} conflicts</span>
          <span className="import-summary-pill">{preview.counts['missing-id']} missing IDs</span>
          <span className="import-summary-pill accent">{selectedCount} selected</span>
        </div>
        <TypeBreakdown byType={preview.byType} mode="preview" />
        <div className="import-defaults-row">
          <label className="import-action-select-wrap"><span>Duplicates</span>
            <select className="import-action-select" value={resolution.defaults.duplicate} onChange={e => setDefault('duplicate', e.target.value)}><option value="skip">Skip</option><option value="clone">Clone With New ID</option><option value="replace">Replace Existing</option></select></label>
          <label className="import-action-select-wrap"><span>Conflicts</span>
            <select className="import-action-select" value={resolution.defaults.conflict} onChange={e => setDefault('conflict', e.target.value)}><option value="clone">Clone With New ID</option><option value="skip">Skip</option><option value="replace">Replace Existing</option></select></label>
        </div>
        <div className="import-item-list">
          {decisionItems.length ? decisionItems.map(item => (
            <div className="import-item-row" key={item.key}>
              <div className="import-item-main">
                <div className="import-item-top"><span className={`export-type-badge ${item.type}`}>{TYPE_LABEL[item.type] || item.type}</span><span className="import-item-label">{item.label || item.sourceId || 'Untitled'}</span><span className={`import-item-status ${item.status}`}>{IMPORT_STATUS[item.status] || item.status}</span></div>
                <div className="import-item-meta">Incoming ID: <code>{item.sourceId || 'none'}</code>{item.existingLabel ? ` · Existing: ${item.existingLabel}` : ''}</div>
              </div>
              <label className="import-action-select-wrap"><span>Action</span>
                <select className="import-action-select" value={action(item)} onChange={e => setOverride(item.key, e.target.value)}>{item.availableActions.map(a => <option key={a} value={a}>{IMPORT_ACTION[a] || a}</option>)}</select></label>
            </div>
          )) : <p className="settings-hint" style={{ margin: '10px 0 0' }}>No duplicates or conflicts. Everything is ready to import as-is.</p>}
        </div>
      </div>
      {reportBlock}
    </div>
  );
}

// ─── Keyboard shortcuts modal ──────────────────────────────────────────────

const SC_CATEGORIES = [
  { label: 'Create', actions: ['newSession', 'newEncounter', 'newNpc', 'newFaction'] },
  { label: 'Go To', actions: ['goSessions', 'goEncounters', 'goNpcs', 'goCampaign', 'goFactions', 'goSettings'] },
  { label: 'History', actions: ['historyBack', 'historyForward'] },
  { label: 'Interface', actions: ['focusSearch', 'savePrimary'] },
];

function ShortcutsModal({ open, onClose, current, onSaved }) {
  const defs     = getDefinitions();
  const defaults = getDefaultShortcuts();
  const [draft, setDraft] = useState({});
  const [capturing, setCapturing] = useState(null);
  const [saving, setSaving] = useState(false);

  const defsByAction = useMemo(() => Object.fromEntries(defs.map(d => [d.action, d])), [defs]);

  useEffect(() => { if (open) { setDraft({ ...current }); setCapturing(null); } }, [open, current]);
  useEffect(() => {
    if (!open) return;
    const onKey = e => {
      if (e.key === 'Escape' && !capturing) { onClose(); return; }
      if (!capturing) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { setCapturing(null); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') { setDraft(d => ({ ...d, [capturing]: '' })); setCapturing(null); return; }
      const combo = eventToCombo(e);
      if (combo) { setDraft(d => ({ ...d, [capturing]: combo })); setCapturing(null); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, capturing, onClose]);

  const duplicates = useMemo(() => {
    const seen = new Map();
    Object.entries(draft).forEach(([action, combo]) => { const c = canonicalizeShortcutString(combo); if (!c) return; if (!seen.has(c)) seen.set(c, []); seen.get(c).push(action); });
    return [...seen.entries()].filter(([, a]) => a.length > 1);
  }, [draft]);

  if (!open) return null;

  async function save() {
    if (duplicates.length) return;
    setSaving(true);
    try {
      const normalized = saveStoredShortcuts(draft);
      const r = await (await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shortcuts: normalized }) })).json();
      const saved = r.shortcuts || normalized;
      saveStoredShortcuts(saved);
      window.dispatchEvent(new CustomEvent('dnd-shortcuts-updated'));
      onSaved(saved); onClose(); toast('Keyboard shortcuts saved.', 'success');
    } catch (err) { toast('Could not save shortcuts: ' + err.message, 'error'); } finally { setSaving(false); }
  }

  return (
    <div className="shortcut-modal-overlay" role="dialog" aria-modal="true" onClick={e => { if (e.target.classList.contains('shortcut-modal-overlay')) onClose(); }}>
      <div className="shortcut-modal-box">
        <div className="shortcut-modal-head">
          <div>
            <h3 className="shortcut-modal-title">Keyboard Shortcuts</h3>
            <p className="shortcut-modal-subtitle">Click a binding to rebind · Backspace or Delete to clear · Changes apply after saving.</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        {duplicates.length > 0 && (
          <div className="shortcut-warning">
            {duplicates.map(([combo, actions]) => `${combo} is assigned to ${actions.map(a => defsByAction[a]?.label || a).join(', ')}.`).join(' ')}
          </div>
        )}
        <div className="shortcut-list">
          {SC_CATEGORIES.map(cat => {
            const catDefs = cat.actions.map(a => defsByAction[a]).filter(Boolean);
            if (!catDefs.length) return null;
            return (
              <div key={cat.label} className="shortcut-category">
                <div className="shortcut-category-label">{cat.label}</div>
                {catDefs.map(def => {
                  const combo = draft[def.action] || '';
                  const isCapturing = capturing === def.action;
                  return (
                    <div className={`shortcut-row${isCapturing ? ' capturing' : ''}`} key={def.action}>
                      <div className="shortcut-meta">
                        <div className="shortcut-meta-label">{def.label}</div>
                        <div className="shortcut-meta-desc">{def.description}</div>
                      </div>
                      <div className="shortcut-controls">
                        {isCapturing ? (
                          <span className="shortcut-capturing-hint">Press keys… <kbd className="shortcut-esc-hint">Esc</kbd></span>
                        ) : (
                          <button type="button" className={`shortcut-capture-btn${combo ? '' : ' is-empty'}`} onClick={() => setCapturing(def.action)} title="Click to rebind">
                            {combo || 'Unassigned'}
                          </button>
                        )}
                        {!isCapturing && (
                          <div className="shortcut-row-actions">
                            <button type="button" className="btn btn-ghost" title="Reset to default" onClick={() => { setDraft(d => ({ ...d, [def.action]: defaults[def.action] })); setCapturing(null); }}>↺</button>
                            <button type="button" className="btn btn-ghost" title="Clear" onClick={() => { setDraft(d => ({ ...d, [def.action]: '' })); setCapturing(null); }}>✕</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="shortcut-modal-footer">
          <button type="button" className="btn btn-ghost" onClick={() => { setDraft({ ...defaults }); setCapturing(null); }}>Reset to Defaults</button>
          <div className="shortcut-footer-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={duplicates.length > 0 || saving} onClick={save}>{saving ? 'Saving…' : 'Save Shortcuts'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
