import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import FormShell from '../../components/form/FormShell.jsx';
import { Section, Field, AutoTextArea, TagField } from '../../components/form/FormKit.jsx';
import PreviewModal from '../../components/form/PreviewModal.jsx';
import { toast } from '../../lib/vanilla.js';

const MAX = { npc: 5, location: 3, clock: 3, encounter: 3, dist: 5, poi: 5 };
const SECTIONS = [
  { id: 's-info', num: '01', label: 'Session Info' }, { id: 's-hook', num: '02', label: 'Goal & Hook' },
  { id: 's-beats', num: '03', label: 'Session Beats' }, { id: 's-continuity', num: '04', label: 'Continuity' },
  { id: 's-npcs', num: '05', label: 'NPCs' }, { id: 's-locations', num: '06', label: 'Locations' },
  { id: 's-clocks', num: '07', label: 'Faction Clocks' }, { id: 's-encounters', num: '08', label: 'Combat' },
  { id: 's-notes', num: '09', label: 'Session Notes' },
];
const BEATS = [['beatOpen', 'Open', '0–20 minutes'], ['beatMiddle', 'Middle', '20–70 minutes'], ['beatEscalate', 'Escalate', '70–100 minutes'], ['beatClose', 'Close', '100–120 minutes']];
const CONTINUITY = [
  ['sessionRecap', 'Session Recap', 'A quick summary of what actually happened, for future prep and callbacks.', true],
  ['worldStateChanges', 'World-State Changes', 'One change per line. What is different in the world because of this session.'],
  ['unresolvedThreads', 'Unresolved Threads', 'Open questions, promised consequences, and hooks to pay off later.'],
  ['npcStatusChanges', 'NPC Status Changes', 'Alliances, injuries, betrayals, deaths, and major attitude shifts.'],
  ['treasureRewardsLog', 'Treasure & Rewards Log', 'Gold, items, favors, titles, clues, and other earned rewards.'],
];
const newNpc = d => ({ name: '', faction: '', situation: '', wants: '', phrases: '', bodyLanguage: '', neverDoes: '', corneredLine: '', _sourceId: undefined, ...d });
const newLoc = d => ({ name: '', description: '', sensoryDetail: '', hiddenDetail: '', districts: [], _sourceId: undefined, ...d });
const newClock = () => ({ factionName: '', goal: '', progress: '0', max: '8', completion: '' });
const newEnc = () => ({ name: '', summary: '', encounterPlanId: '' });
const CardHead = ({ title, onRemove }) => (
  <div className="card-header"><span className="card-title">{title}</span>
    <div className="card-header-actions"><button type="button" className="btn btn-danger remove-btn" onClick={onRemove}>Remove</button></div></div>
);

function DistrictsEditor({ districts, set }) {
  const upd = (i, patch) => set(districts.map((d, di) => di === i ? { ...d, ...patch } : d));
  return (
    <div className="district-container">
      <div className="district-container-label">Districts <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(up to {MAX.dist})</span></div>
      <div className="district-list-inner">
        {districts.map((d, i) => (
          <div className="district-sub-card" key={i}>
            <div className="district-sub-header"><span className="district-sub-title">District {i + 1}</span>
              <button type="button" className="btn btn-danger remove-btn" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => set(districts.filter((_, di) => di !== i))}>Remove</button></div>
            <div className="form-grid">
              <Field label="District Name" full><input type="text" placeholder="Market District" value={d.name} onChange={e => upd(i, { name: e.target.value })} /></Field>
              <Field label="Read-Aloud Description" full><AutoTextArea className="short" value={d.readAloud || ''} onChange={e => upd(i, { readAloud: e.target.value })} /></Field>
            </div>
            <div className="poi-section">
              <div className="poi-container-label" style={{ marginTop: 10 }}>Points of Interest <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(up to {MAX.poi})</span></div>
              <div className="poi-container">
                {(d.pois || []).map((p, pi) => (
                  <div className="poi-row" key={pi}>
                    <span className="poi-num">{pi + 1}.</span>
                    <input type="text" className="poi-name" placeholder="Fish Market" value={p.name} onChange={e => upd(i, { pois: d.pois.map((x, j) => j === pi ? { ...x, name: e.target.value } : x) })} />
                    <AutoTextArea className="poi-desc" style={{ minHeight: 44 }} value={p.description} onChange={e => upd(i, { pois: d.pois.map((x, j) => j === pi ? { ...x, description: e.target.value } : x) })} />
                    <button type="button" className="btn-remove-sm" onClick={() => upd(i, { pois: d.pois.filter((_, j) => j !== pi) })}>×</button>
                  </div>
                ))}
              </div>
              {(d.pois || []).length < MAX.poi && <button type="button" className="btn btn-add-sm" onClick={() => upd(i, { pois: [...(d.pois || []), { name: '', description: '' }] })}>+ Add Point of Interest</button>}
            </div>
          </div>
        ))}
      </div>
      {districts.length < MAX.dist && <button type="button" className="btn btn-add-sm" onClick={() => set([...districts, { name: '', readAloud: '', pois: [] }])}>+ Add District</button>}
    </div>
  );
}

function AddRecordMenu({ label, count, max, records, importedIds, onNew, onImport, emptyHref }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const filtered = records.filter(r => !query || (r.name || '').toLowerCase().includes(query) || (r.nickname || '').toLowerCase().includes(query) || (r.description || '').toLowerCase().includes(query) || (r.situation || '').toLowerCase().includes(query));
  const click = () => { if (count >= max) { toast(`Maximum ${max} ${label.toLowerCase()}s per session reached.`, 'error'); return; } setOpen(o => !o); };
  return (
    <div className="add-record-wrap">
      <button type="button" className="btn btn-add" onClick={click}>+ Add {label}</button>
      {open && (
        <div className="npc-picker-panel" style={{ position: 'static', marginTop: 8 }}>
          <button type="button" className="npc-picker-new-btn" onClick={() => { onNew(); setOpen(false); }}>
            <span className="npc-picker-new-icon">＋</span>
            <div><div className="npc-picker-new-label">New {label}</div><div className="npc-picker-new-sub">Start with a blank card</div></div>
          </button>
          <div className="npc-picker-or">— or import from your {label} database —</div>
          <div className="npc-picker-search-wrap"><input type="text" className="npc-picker-search" placeholder="Search by name…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="npc-picker-list">
            {!filtered.length
              ? <p className="npc-picker-empty">{records.length ? `No ${label.toLowerCase()}s match your search.` : <>No {label.toLowerCase()}s in your database yet. <a href={emptyHref} target="_blank" rel="noopener">Create one →</a></>}</p>
              : filtered.map(r => {
                  const dup = importedIds.includes(r.id);
                  return (
                    <button type="button" key={r.id} className="npc-picker-item" disabled={dup} style={dup ? { opacity: 0.5 } : undefined}
                      onClick={() => { onImport(r.id); setOpen(false); }}>
                      <span className="npc-picker-item-name">{r.name}{r.nickname ? <em className="npc-picker-item-nick"> "{r.nickname}"</em> : ''}{dup ? ' · added' : ''}</span>
                      {(r.situation || r.description) && <span className="npc-picker-item-sub">{(r.situation || r.description).slice(0, 80)}</span>}
                    </button>
                  );
                })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SessionForm() {
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const isEdit = !!editId;
  const navigate = useNavigate();
  const tagRef = useRef(null);

  const blank = { sessionNumber: '', date: '', partyLevel: '', sessionGoal: '', endState: '', openingReadAloud: '', threeOptionsPrompt: '', beatOpen: '', beatMiddle: '', beatEscalate: '', beatClose: '', sessionRecap: '', worldStateChanges: '', unresolvedThreads: '', npcStatusChanges: '', treasureRewardsLog: '', sessionNotes: '' };
  const [f, setF] = useState(blank);
  const [npcs, setNpcs] = useState([]);
  const [locations, setLocations] = useState([]);
  const [clocks, setClocks] = useState([]);
  const [encounters, setEncounters] = useState([]);
  const [initialTags, setInitialTags] = useState([]);
  const [status, setStatus] = useState('active');
  const [db, setDb] = useState({ npcs: [], locations: [], encounterPlans: [] });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [pendingData, setPendingData] = useState(null);
  const [saveNote, setSaveNote] = useState('');
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    let alive = true;
    (async () => {
      const [npcDb, locDb, encDb] = await Promise.all([
        fetch('/api/npcs').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/locations').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/encounters').then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      if (!alive) return;
      setDb({ npcs: npcDb, locations: locDb, encounterPlans: encDb });
      if (isEdit) {
        try {
          const res = await fetch(`/api/sessions/${editId}`);
          if (!res.ok) throw new Error();
          const sess = await res.json();
          if (!alive) return;
          setStatus(sess.status || 'active');
          populate(sess.data || {});
          setInitialTags((sess.data || {}).tags || []);
          document.title = `Edit Session ${editId} — D&D Session Master`;
        } catch { toast('Could not load session for editing.', 'error'); }
      } else {
        set('date', new Date().toISOString().slice(0, 10));
      }
    })();
    return () => { alive = false; };
  }, [editId, isEdit]);

  function populate(d) {
    setF({ ...blank, ...Object.fromEntries(Object.keys(blank).map(k => [k, d[k] ?? ''])) });
    setNpcs((d.npcs || []).map(newNpc));
    setLocations((d.locations || []).map(l => newLoc({ ...l, districts: (l.districts || []).map(di => ({ name: di.name || '', readAloud: di.readAloud || '', pois: (di.pointsOfInterest || []).map(p => ({ name: p.name || '', description: p.description || '' })) })) })));
    setClocks((d.factionClocks || []).map(c => ({ ...newClock(), ...c, progress: String(c.progress ?? 0), max: String(c.max ?? 8) })));
    setEncounters((d.encounters || []).map(e => ({ ...newEnc(), ...e, encounterPlanId: e.encounterPlanId || '' })));
  }

  function collect(extra) {
    const t = s => String(s ?? '').trim();
    return {
      id: isEdit ? editId : undefined, status: status === 'draft' ? 'draft' : undefined,
      ...Object.fromEntries(Object.keys(blank).map(k => [k, t(f[k])])),
      tags: tagRef.current ? tagRef.current.getTags() : [],
      linkedNpcs: npcs.filter(n => n._sourceId).map(n => n._sourceId),
      linkedLocations: locations.filter(l => l._sourceId).map(l => l._sourceId),
      npcs: npcs.map(n => ({ name: t(n.name), faction: t(n.faction), situation: t(n.situation), wants: t(n.wants), phrases: t(n.phrases), bodyLanguage: t(n.bodyLanguage), neverDoes: t(n.neverDoes), corneredLine: t(n.corneredLine), _sourceId: n._sourceId })),
      locations: locations.map(l => ({ name: t(l.name), description: t(l.description), sensoryDetail: t(l.sensoryDetail), hiddenDetail: t(l.hiddenDetail), _sourceId: l._sourceId,
        districts: l.districts.map(d => ({ name: t(d.name), readAloud: t(d.readAloud), pointsOfInterest: (d.pois || []).map(p => ({ name: t(p.name), description: t(p.description) })).filter(p => p.name || p.description) })) })),
      factionClocks: clocks.map(c => ({ factionName: t(c.factionName), goal: t(c.goal), progress: t(c.progress) || '0', max: t(c.max) || '8', completion: t(c.completion) })),
      encounters: encounters.map(e => ({ name: t(e.name), summary: t(e.summary), encounterPlanId: e.encounterPlanId || null })),
      ...extra,
    };
  }

  async function postSession(data) {
    const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const saved = await res.json();
    if (!res.ok) throw new Error(saved.error || 'Save failed');
    return saved;
  }

  async function onPreview() {
    if (!String(f.sessionNumber).trim()) { toast('Please enter a session number.', 'error'); return; }
    setBusy(true);
    try {
      const data = collect();
      const res = await fetch('/api/sessions/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Server error');
      setPendingData(data); setPreview(result); setSaveNote('');
    } catch (err) { toast('Error: ' + err.message, 'error'); } finally { setBusy(false); }
  }
  async function onSaveApp() {
    setBusy(true);
    try { const saved = await postSession(pendingData); toast('Session saved.', 'success'); navigate(`/view/${saved.id}`); }
    catch (err) { toast('Save error: ' + err.message, 'error'); setBusy(false); }
  }
  async function onSaveExport() {
    setBusy(true);
    try {
      const saved = await postSession(pendingData);
      setSaveNote('A folder picker has opened on your desktop — choose where to save the files.');
      const fr = await (await fetch('/api/sessions/save-files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: saved.markdown, pdf: saved.pdf, filename: saved.filename }) })).json();
      toast(fr.cancelled ? 'Session saved — no folder selected.' : `Saved ${saved.filename} → ${fr.path}`, 'success');
      navigate(`/view/${saved.id}`);
    } catch (err) { toast('Save error: ' + err.message, 'error'); setSaveNote(''); setBusy(false); }
  }
  async function onSaveDraft() {
    if (!String(f.sessionNumber).trim()) { toast('Please enter a session number.', 'error'); return; }
    setBusy(true);
    try { const saved = await postSession(collect({ status: 'draft' })); toast('Draft saved.', 'success'); navigate(`/view/${saved.id}`); }
    catch (err) { toast('Save error: ' + err.message, 'error'); setBusy(false); }
  }

  async function importNpc(npcId) {
    try {
      const n = await (await fetch(`/api/npcs/${encodeURIComponent(npcId)}`)).json();
      setNpcs(p => [...p, newNpc({ _sourceId: n.id, name: n.name || '', situation: n.situation || '', wants: n.wantsNeeds || '', phrases: n.commonPhrase || '', bodyLanguage: n.appearance || '', neverDoes: n.secretObstacle || '' })]);
      toast(`${n.name} added to session.`, 'success');
    } catch { toast('Could not import NPC.', 'error'); }
  }
  async function importLoc(locId) {
    try {
      const l = await (await fetch(`/api/locations/${encodeURIComponent(locId)}`)).json();
      setLocations(p => [...p, newLoc({ _sourceId: l.id, name: l.name || '', description: l.description || '', sensoryDetail: l.sensoryDetail || '', hiddenDetail: l.hiddenDetail || '',
        districts: (l.districts || []).map(d => ({ name: d.name || '', readAloud: d.readAloud || '', pois: (d.pointsOfInterest || []).map(p => ({ name: p.name || '', description: p.description || '' })) })) })]);
      toast(`${l.name} added to session.`, 'success');
    } catch { toast('Could not import Location.', 'error'); }
  }

  const updNpc = (i, patch) => setNpcs(a => a.map((x, j) => j === i ? { ...x, ...patch } : x));
  const updLoc = (i, patch) => setLocations(a => a.map((x, j) => j === i ? { ...x, ...patch } : x));
  const updClock = (i, patch) => setClocks(a => a.map((x, j) => j === i ? { ...x, ...patch } : x));
  const updEnc = (i, patch) => setEncounters(a => a.map((x, j) => j === i ? { ...x, ...patch } : x));

  const showDraftBtn = !isEdit || status === 'draft';
  const actions = (
    <>
      {showDraftBtn && <button type="button" className="btn btn-ghost" disabled={busy} onClick={onSaveDraft}>Save as Draft</button>}
      <button type="button" className="btn btn-submit" disabled={busy} onClick={onPreview}>{busy ? 'Generating…' : 'Preview Session'}</button>
      <p className="submit-note">You'll see the PDF and markdown before choosing where to save.</p>
    </>
  );

  return (
    <FormShell
      backHref={isEdit ? `/view/${editId}` : '/sessions'} backLabel={isEdit ? '← Back to Session' : '← All Sessions'} backNative
      title={isEdit ? `Edit Session ${editId}` : 'New Session Plan'}
      subtitle={isEdit ? 'Make your changes, then preview and save.' : 'Fill in the fields below, then preview your PDF before choosing where to save.'}
      sections={SECTIONS} actions={actions}
    >
      <Section num="01" title="Session Info" id="s-info">
        <Field label="Session Number *" htmlFor="sessionNumber"><input id="sessionNumber" type="number" min="1" placeholder="1" value={f.sessionNumber} onChange={e => set('sessionNumber', e.target.value)} /></Field>
        <Field label="Date *" htmlFor="date"><input id="date" type="date" value={f.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Party Level" htmlFor="partyLevel"><input id="partyLevel" type="number" min="1" max="20" placeholder="5" value={f.partyLevel} onChange={e => set('partyLevel', e.target.value)} /></Field>
        <Field label="Tags" hint="Press Enter or comma to add. Click a tag to remove." full><TagField initialTags={initialTags} tagRef={tagRef} /></Field>
      </Section>

      <Section num="02" title="Session Goal & Opening Hook" id="s-hook">
        <Field label="Session Goal" hint="What should be accomplished by the end of this session?" full><AutoTextArea className="short" value={f.sessionGoal} onChange={e => set('sessionGoal', e.target.value)} /></Field>
        <Field label="End State" hint="Where should the party be, or what should they know, when the session ends?" full><AutoTextArea className="short" value={f.endState} onChange={e => set('endState', e.target.value)} /></Field>
        <Field label="Opening Read-Aloud" hint="3–5 sentences, verbatim. Something seen, heard, smelled, and something that feels wrong." full><AutoTextArea className="tall" value={f.openingReadAloud} onChange={e => set('openingReadAloud', e.target.value)} /></Field>
        <Field label="Three-Options Prompt" hint="One sentence giving players three clear choices to kick off the session." full><AutoTextArea className="short" value={f.threeOptionsPrompt} onChange={e => set('threeOptionsPrompt', e.target.value)} /></Field>
      </Section>

      <div className="section-header" id="s-beats"><span className="section-num">03</span><h2>Session Beats</h2></div>
      <div className="card">
        <div className="beats-grid">
          {BEATS.map(([k, label, time]) => (
            <div className="beat-block" key={k}>
              <div className="beat-label">{label}</div><div className="beat-time">{time}</div>
              <AutoTextArea className="" value={f[k]} onChange={e => set(k, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <Section num="04" title="Campaign Continuity" id="s-continuity">
        {CONTINUITY.map(([k, label, hint, tall]) => (
          <Field key={k} label={label} hint={hint} full><AutoTextArea className={tall ? '' : 'short'} style={tall ? { minHeight: 120 } : undefined} value={f[k]} onChange={e => set(k, e.target.value)} /></Field>
        ))}
      </Section>

      <div className="section-header" id="s-npcs"><span className="section-num">05</span><h2>NPCs</h2></div>
      <div id="npc-list">
        {npcs.map((n, i) => (
          <div className="card npc-card" key={i}>
            <CardHead title={`NPC ${i + 1}${n._sourceId ? ' · linked' : ''}`} onRemove={() => setNpcs(a => a.filter((_, j) => j !== i))} />
            <div className="form-grid">
              <Field label="Name"><input type="text" placeholder="Mira Ashveil" value={n.name} onChange={e => updNpc(i, { name: e.target.value })} /></Field>
              <Field label="Faction / Affiliation"><input type="text" placeholder="The Ember Syndicate" value={n.faction} onChange={e => updNpc(i, { faction: e.target.value })} /></Field>
              <Field label="Current Situation" full><AutoTextArea className="short" value={n.situation} onChange={e => updNpc(i, { situation: e.target.value })} /></Field>
              <Field label="What They Want Right Now" hint="In this specific conversation, not their long-term goal." full><AutoTextArea className="short" value={n.wants} onChange={e => updNpc(i, { wants: e.target.value })} /></Field>
              <Field label="Signature Phrases / Words" hint="2–3 phrases or verbal tics they use." full><AutoTextArea className="short" value={n.phrases} onChange={e => updNpc(i, { phrases: e.target.value })} /></Field>
              <Field label="Physical Body Language Habit"><AutoTextArea className="short" value={n.bodyLanguage} onChange={e => updNpc(i, { bodyLanguage: e.target.value })} /></Field>
              <Field label="One Thing They Never Do"><AutoTextArea className="short" value={n.neverDoes} onChange={e => updNpc(i, { neverDoes: e.target.value })} /></Field>
              <Field label="If Cornered — Scripted Line" full><AutoTextArea className="short" value={n.corneredLine} onChange={e => updNpc(i, { corneredLine: e.target.value })} /></Field>
            </div>
          </div>
        ))}
      </div>
      <AddRecordMenu label="NPC" count={npcs.length} max={MAX.npc} records={db.npcs} importedIds={npcs.map(n => n._sourceId).filter(Boolean)} emptyHref="/npc/new" onNew={() => setNpcs([...npcs, newNpc()])} onImport={importNpc} />

      <div className="section-header" id="s-locations"><span className="section-num">06</span><h2>Locations</h2></div>
      <div id="location-list">
        {locations.map((l, i) => (
          <div className="card location-card" key={i}>
            <CardHead title={`Location ${i + 1}${l._sourceId ? ' · linked' : ''}`} onRemove={() => setLocations(a => a.filter((_, j) => j !== i))} />
            <div className="form-grid">
              <Field label="Name" full><input type="text" placeholder="The City of Ashford" value={l.name} onChange={e => updLoc(i, { name: e.target.value })} /></Field>
              <Field label="Brief Description" full><AutoTextArea className="short" value={l.description} onChange={e => updLoc(i, { description: e.target.value })} /></Field>
              <Field label="Sensory Detail" hint="One specific impression when players first arrive." full><AutoTextArea className="short" value={l.sensoryDetail} onChange={e => updLoc(i, { sensoryDetail: e.target.value })} /></Field>
              <Field label="Hidden Detail or Secret" full><AutoTextArea className="short" value={l.hiddenDetail} onChange={e => updLoc(i, { hiddenDetail: e.target.value })} /></Field>
            </div>
            <DistrictsEditor districts={l.districts} set={d => updLoc(i, { districts: d })} />
          </div>
        ))}
      </div>
      <AddRecordMenu label="Location" count={locations.length} max={MAX.location} records={db.locations} importedIds={locations.map(l => l._sourceId).filter(Boolean)} emptyHref="/location/new" onNew={() => setLocations([...locations, newLoc()])} onImport={importLoc} />

      <div className="section-header" id="s-clocks"><span className="section-num">07</span><h2>Faction Clocks</h2></div>
      <div id="clock-list">
        {clocks.map((c, i) => (
          <div className="card clock-card" key={i}>
            <CardHead title={`Faction Clock ${i + 1}`} onRemove={() => setClocks(a => a.filter((_, j) => j !== i))} />
            <div className="form-grid">
              <Field label="Faction Name" full><input type="text" placeholder="The Ember Syndicate" value={c.factionName} onChange={e => updClock(i, { factionName: e.target.value })} /></Field>
              <Field label="Working Toward" full><AutoTextArea className="short" value={c.goal} onChange={e => updClock(i, { goal: e.target.value })} /></Field>
              <Field label="Progress" full>
                <div className="clock-row">
                  <input type="number" className="clock-progress" min="0" value={c.progress} onChange={e => updClock(i, { progress: e.target.value })} />
                  <span className="clock-sep">out of</span>
                  <input type="number" className="clock-max" min="1" value={c.max} onChange={e => updClock(i, { max: e.target.value })} />
                  <span className="clock-sep">steps</span>
                </div>
              </Field>
              <Field label="What Happens When the Clock Completes" full><AutoTextArea className="short" value={c.completion} onChange={e => updClock(i, { completion: e.target.value })} /></Field>
            </div>
          </div>
        ))}
      </div>
      {clocks.length < MAX.clock && <button type="button" className="btn btn-add" onClick={() => setClocks([...clocks, newClock()])}>+ Add Faction Clock</button>}

      <div className="section-header" id="s-encounters"><span className="section-num">08</span><h2>Combat Encounters</h2></div>
      <div id="encounter-list">
        {encounters.map((e, i) => (
          <div className="card encounter-card" key={i}>
            <CardHead title={`Encounter ${i + 1}`} onRemove={() => setEncounters(a => a.filter((_, j) => j !== i))} />
            <div className="form-grid">
              <Field label="Encounter Name" full><input type="text" placeholder="Ambush at the Warehouse" value={e.name} onChange={ev => updEnc(i, { name: ev.target.value })} /></Field>
              <Field label="Session Summary" hint="Brief description for the session plan view. Full combat detail lives in the Encounter Plan." full><AutoTextArea className="short" value={e.summary} onChange={ev => updEnc(i, { summary: ev.target.value })} /></Field>
              <Field label="Link to Encounter Plan" hint="Optional — attach a Combat Encounter Plan for full tactical detail." full>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select style={{ flex: 1, minWidth: 200 }} value={e.encounterPlanId} onChange={ev => updEnc(i, { encounterPlanId: ev.target.value })}>
                    <option value="">— No encounter plan linked —</option>
                    {db.encounterPlans.map(p => <option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}
                  </select>
                  <a href="/encounter/new" target="_blank" rel="noopener" className="btn btn-ghost" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>+ New Plan</a>
                </div>
              </Field>
            </div>
          </div>
        ))}
      </div>
      {encounters.length < MAX.encounter && <button type="button" className="btn btn-add" onClick={() => setEncounters([...encounters, newEnc()])}>+ Add Encounter</button>}

      <Section num="09" title="Session Notes" id="s-notes">
        <Field label="Loose Notes, Reminders & Contingencies"><AutoTextArea style={{ minHeight: 130 }} value={f.sessionNotes} onChange={e => set('sessionNotes', e.target.value)} placeholder="If the party goes off-rail: …" /></Field>
      </Section>

      <PreviewModal preview={preview} title={preview ? `Session ${String(preview.filename).replace('session-', '')} — Preview` : ''}
        onClose={() => setPreview(null)} busy={busy} saveNote={saveNote} onSaveApp={onSaveApp} onSaveExport={onSaveExport} />
    </FormShell>
  );
}
