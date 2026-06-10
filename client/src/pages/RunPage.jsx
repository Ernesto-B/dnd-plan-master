import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast, confirmDialog, wikiPreload } from '../lib/vanilla.js';
import { renderMarkdown } from '../lib/markdown.js';

const CONDITIONS = ['blinded', 'charmed', 'exhausted', 'frightened', 'grappled', 'incapacitated', 'paralyzed', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
const BEAT_DEFS = [['open', 'Open', '0–20 min'], ['middle', 'Middle', '20–70 min'], ['escalate', 'Escalate', '70–100 min'], ['close', 'Close', '100–120 min']];
let idc = 0;
const genId = () => `${Date.now().toString(36)}-${(idc++).toString(36)}`;
const nl = s => String(s ?? '').split('\n').map((line, i) => <React.Fragment key={i}>{i ? <br /> : null}{line}</React.Fragment>);

function useLocal(key, def) {
  const [v, setV] = useState(() => { try { const r = JSON.parse(localStorage.getItem(key)); return r ?? def; } catch { return def; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

export default function RunPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const isPopout = params.get('popout') === 'initiative';

  const [session, setSession] = useState(null);
  const [error, setError] = useState(false);
  const [party, setParty] = useState([]);
  const [npcIndex, setNpcIndex] = useState([]);
  const [locIndex, setLocIndex] = useState([]);

  const [beats, setBeats] = useLocal(`dnd-beats-${id}`, { open: false, middle: false, escalate: false, close: false, times: {} });
  const [init, setInit] = useLocal(`dnd-init-${id}`, { combatants: [], round: 1, activeIdx: -1 });
  const [sects, setSects] = useLocal(`dnd-sect-${id}`, {});
  const [combat, setCombat] = useLocal(`dnd-combat-${id}`, { active: false, selection: 'blank' });
  const [notes, setNotes] = useLocal(`dnd-notes-${id}`, { text: '', lastSavedAt: '' });

  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupQ, setLookupQ] = useState('');
  const [lookupDetail, setLookupDetail] = useState({}); // `${kind}:${id}` -> {open, data}
  const [encCache, setEncCache] = useState({});
  const [addForm, setAddForm] = useState(null); // null | { editingId, name, initiative, hp, ac, type }
  const [condFor, setCondFor] = useState(null);

  useEffect(() => {
    document.body.classList.add('run-mode');
    document.body.classList.remove('has-app-chrome', 'sidebar-pinned');
    if (isPopout) document.body.classList.add('run-popout');
    return () => document.body.classList.remove('run-mode', 'run-popout');
  }, [isPopout]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (!res.ok) throw new Error();
        const s = await res.json();
        setSession(s);
        document.title = isPopout ? `⚔ Initiative — Session #${s.sessionNumber}` : `▶ Session #${s.sessionNumber} — Run Mode`;
      } catch { setError(true); return; }
      wikiPreload();
      try {
        const [c, n, l] = await Promise.all([fetch('/api/campaigns/active'), fetch('/api/npcs'), fetch('/api/locations')]);
        if (c.ok) { const camp = await c.json(); setParty(Array.isArray(camp?.partyRoster) ? camp.partyRoster : []); }
        if (n.ok) setNpcIndex(await n.json());
        if (l.ok) setLocIndex(await l.json());
      } catch {}
    })();
  }, [id, isPopout]);

  // Cross-window initiative sync (main ⇄ popout).
  useEffect(() => {
    const onStorage = e => { if (e.key === `dnd-init-${id}`) { try { setInit(JSON.parse(e.newValue)); } catch {} } };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [id, setInit]);

  // Lazy-load the selected combat encounter's full plan (markdown). Kept above
  // the early returns to satisfy the Rules of Hooks; guarded on session/combat.
  useEffect(() => {
    if (!session || !combat.active) return;
    const opts = (session.data?.encounters || []).filter(e => e.name);
    const sel = combat.selection === 'blank' ? null : (opts[parseInt(combat.selection)] || null);
    const planId = sel?.encounterPlanId;
    if (!planId || encCache[planId]) return;
    setEncCache(c => ({ ...c, [planId]: 'loading' }));
    fetch(`/api/encounters/${encodeURIComponent(planId)}`).then(r => r.ok ? r.json() : Promise.reject())
      .then(j => setEncCache(c => ({ ...c, [planId]: j }))).catch(() => setEncCache(c => ({ ...c, [planId]: 'error' })));
  }, [session, combat.active, combat.selection, encCache]);

  if (error) return <div id="run-app"><div className="run-error"><p>Session not found.</p><a href="/sessions" className="btn btn-ghost">← Back</a></div></div>;
  if (!session) return <div id="run-app"><div className="run-error"><p>Loading…</p></div></div>;
  const data = session.data || {};

  // ── Initiative ──────────────────────────────────────────────────────────────
  const sorted = [...init.combatants].sort((a, b) => b.initiative - a.initiative);
  const active = init.activeIdx >= 0 ? init.combatants[init.activeIdx] : null;
  const updCombatant = (cid, patch) => setInit(p => ({ ...p, combatants: p.combatants.map(c => c.id === cid ? { ...c, ...patch } : c) }));
  const removeCombatant = cid => setInit(p => {
    const idx = p.combatants.findIndex(c => c.id === cid); if (idx < 0) return p;
    const combatants = p.combatants.filter(c => c.id !== cid);
    let activeIdx = p.activeIdx; if (activeIdx >= combatants.length) activeIdx = Math.max(-1, combatants.length - 1);
    return { ...p, combatants, activeIdx };
  });
  const toggleCond = (cid, cond) => updCombatant(cid, (() => { const c = init.combatants.find(x => x.id === cid); const list = c.conditions || []; return { conditions: list.includes(cond) ? list.filter(x => x !== cond) : [...list, cond] }; })());
  const nextTurn = () => setInit(p => { const n = p.combatants.length; if (!n) return p; const ai = (p.activeIdx + 1) % n; return { ...p, activeIdx: ai, round: ai === 0 ? p.round + 1 : p.round }; });
  const prevTurn = () => setInit(p => { const n = p.combatants.length; if (!n) return p; if (p.activeIdx <= 0) return { ...p, activeIdx: n - 1, round: p.round > 1 ? p.round - 1 : p.round }; return { ...p, activeIdx: p.activeIdx - 1 }; });
  const sortInit = () => setInit(p => ({ ...p, combatants: [...p.combatants].sort((a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name)) }));
  const resetInit = async () => { if (await confirmDialog('Clear the initiative tracker?', { title: 'Reset Initiative' })) setInit({ combatants: [], round: 1, activeIdx: -1 }); };
  const quickAdd = name => setInit(p => ({ ...p, combatants: [...p.combatants, { id: genId(), name, initiative: 0, hp: null, maxHp: null, ac: null, type: 'player', conditions: [] }] }));
  function submitAddForm() {
    const f = addForm; if (!f.name.trim()) return;
    const hp = f.hp === '' ? null : Math.max(0, parseInt(f.hp) || 0);
    const ac = f.ac === '' ? null : Math.max(0, parseInt(f.ac) || 0);
    const patch = { name: f.name.trim(), initiative: parseInt(f.initiative) || 0, ac, maxHp: hp, type: f.type };
    if (f.editingId) {
      setInit(p => ({ ...p, combatants: p.combatants.map(c => c.id === f.editingId ? { ...c, ...patch, hp: hp == null ? null : (c.hp == null ? hp : Math.min(c.hp, hp)) } : c) }));
    } else {
      setInit(p => ({ ...p, combatants: [...p.combatants, { id: genId(), ...patch, hp, conditions: [] }] }));
    }
    setAddForm(null);
  }

  function InitCard() {
    const unadded = party.filter(m => m.name && !init.combatants.some(c => c.name === m.name));
    return (
      <div className="run-card" id="run-init-card">
        <div className="run-card-head"><span className="run-card-title">INITIATIVE</span><span className="run-progress-badge">Round {init.round}</span></div>
        <div className="run-init-toolbar">
          <button className="run-sm-btn" onClick={() => setAddForm(addForm ? null : { editingId: null, name: '', initiative: '', hp: '', ac: '', type: 'player' })}>+ Add</button>
          <button className="run-sm-btn" onClick={sortInit}>↓ Sort</button>
          <button className="run-sm-btn run-sm-danger" onClick={resetInit}>↺ Reset</button>
          {!isPopout && <button className="run-sm-btn run-init-popout-btn" title="Open the initiative tracker in its own window" onClick={openPopout}>⤢ Pop Out</button>}
        </div>
        {party.length > 0 && (
          <div className="run-party-quickadd"><span className="run-party-quickadd-label">Quick add:</span>
            {unadded.length ? unadded.map(m => <button key={m.name} className="run-party-chip" onClick={() => quickAdd(m.name)}>+ {m.name}</button>) : <span className="run-party-quickadd-done">Whole party added</span>}
          </div>
        )}
        {addForm && (
          <div className="run-add-form" style={{ display: 'flex' }}>
            <input className="run-add-inp" placeholder="Name" autoFocus value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') submitAddForm(); }} />
            <input className="run-add-inp" placeholder="Init" type="number" style={{ width: 52 }} value={addForm.initiative} onChange={e => setAddForm(f => ({ ...f, initiative: e.target.value }))} />
            <input className="run-add-inp" placeholder="HP" type="number" style={{ width: 52 }} value={addForm.hp} onChange={e => setAddForm(f => ({ ...f, hp: e.target.value }))} />
            <input className="run-add-inp" placeholder="AC" type="number" style={{ width: 52 }} value={addForm.ac} onChange={e => setAddForm(f => ({ ...f, ac: e.target.value }))} />
            <select className="run-add-inp" style={{ width: 84 }} value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}><option value="player">Player</option><option value="monster">Monster</option><option value="npc">NPC</option></select>
            <button className="run-sm-btn" onClick={submitAddForm}>{addForm.editingId ? 'Save' : 'Add'}</button>
            <button className="run-sm-btn" onClick={() => setAddForm(null)}>✕</button>
          </div>
        )}
        <div id="run-combatants">
          {sorted.length ? sorted.map(c => {
            const isActive = active?.id === c.id;
            const hasHp = c.hp != null;
            const pct = hasHp ? (c.maxHp ? Math.max(0, Math.min(100, c.hp / c.maxHp * 100)) : 100) : 100;
            const hpCls = pct > 60 ? 'hp-good' : pct > 25 ? 'hp-mid' : 'hp-low';
            return (
              <div className={`run-combatant${isActive ? ' active' : ''}${c.type === 'monster' ? ' monster' : ''}`} key={c.id}>
                <div className="run-combatant-row">
                  <span className="run-init-num">{c.initiative}</span>
                  <span className="run-combatant-name" title="Click to toggle conditions" onClick={() => setCondFor(condFor === c.id ? null : c.id)}>{c.name}</span>
                  {hasHp && <div className="run-hp-wrap">
                    <span className={`run-hp-cur ${hpCls}`} contentEditable suppressContentEditableWarning title="Edit HP"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                      onBlur={e => updCombatant(c.id, { hp: Math.max(0, parseInt(e.currentTarget.textContent) || 0) })}>{c.hp}</span>
                    {c.maxHp != null && <><span className="run-hp-sep">/</span><span className="run-hp-max">{c.maxHp}</span></>}
                  </div>}
                  {c.ac != null && <span className="run-ac">⛊{c.ac}</span>}
                  <button className="run-comb-edit" title="Edit" onClick={() => setAddForm({ editingId: c.id, name: c.name, initiative: String(c.initiative), hp: c.maxHp ?? '', ac: c.ac ?? '', type: c.type })}>✎</button>
                  <button className="run-comb-del" title="Remove" onClick={() => removeCombatant(c.id)}>×</button>
                </div>
                {(c.conditions || []).length > 0 && <div className="run-cond-tags">{c.conditions.map(x => <span className="run-cond-tag" key={x}>{x}</span>)}</div>}
                {condFor === c.id && <div className="run-cond-panel" style={{ display: 'flex' }}>{CONDITIONS.map(cond => <button key={cond} className={`run-cond-toggle${(c.conditions || []).includes(cond) ? ' on' : ''}`} onClick={() => toggleCond(c.id, cond)}>{cond}</button>)}</div>}
              </div>
            );
          }) : <p className="run-empty-state">No combatants. Click + Add to begin.</p>}
        </div>
        <div className="run-init-footer"><button className="run-turn-btn" onClick={prevTurn}>◀ Prev</button><span className="run-active-name">{active ? active.name : 'Not started'}</span><button className="run-turn-btn run-turn-next" onClick={nextTurn}>Next ▶</button></div>
      </div>
    );
  }
  function openPopout() {
    const url = `${location.origin}/run/${id}?popout=initiative`;
    if (window.dndApp?.openPopoutWindow) window.dndApp.openPopoutWindow(url, { width: 420, height: 640 });
    else { const w = window.open(url, `dnd-initiative-${id}`, 'width=420,height=640,resizable=yes,scrollbars=yes'); if (w) w.focus(); }
  }

  if (isPopout) return (
    <div id="run-app">
      <div className="run-popout-head"><span className="run-popout-title">⚔ Session #{session.sessionNumber} — Initiative</span></div>
      {InitCard()}
    </div>
  );

  // ── Beats / Notes ───────────────────────────────────────────────────────────
  const doneBeats = BEAT_DEFS.filter(([k]) => beats[k]).length;
  function toggleBeat(k) {
    setBeats(p => {
      const on = !p[k]; const times = { ...(p.times || {}) };
      if (on) times[k] = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); else delete times[k];
      return { ...p, [k]: on, times };
    });
  }
  async function clearNotes() {
    if (!notes.text.trim()) return;
    if (await confirmDialog('Clear your live notes? This only empties the local scratchpad.', { title: 'Clear Live Notes', confirmLabel: 'Clear' })) setNotes(n => ({ ...n, text: '' }));
  }
  async function promoteNotes() {
    const text = notes.text.trim(); if (!text) return;
    if (!await confirmDialog("Append these notes to this session's permanent Session Notes? This updates the saved record.", { title: 'Save to Session', confirmLabel: 'Save' })) return;
    try {
      const full = await (await fetch(`/api/sessions/${id}`)).json();
      const fresh = { ...(full.data || {}), id: full.id || id };
      const stamp = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      const block = `--- Live notes (${stamp}) ---\n${text}`;
      fresh.sessionNotes = fresh.sessionNotes ? `${fresh.sessionNotes}\n\n${block}` : block;
      const r = await (await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fresh) })).json();
      if (r.error) throw new Error(r.error);
      setSession(s => ({ ...s, data: { ...s.data, sessionNotes: fresh.sessionNotes } }));
      setNotes({ text: '', lastSavedAt: stamp });
      toast('Notes saved to the session record.', 'success');
    } catch (err) { toast(err.message || 'Failed to save notes.', 'error'); }
  }
  const NotesCard = () => (
    <div className="run-card run-notes-card">
      <div className="run-card-head"><span className="run-card-title">LIVE NOTES</span><button className="run-sm-btn" title="Append to this session's Session Notes" onClick={promoteNotes}>↥ Save to Session</button></div>
      <textarea className="run-notes-textarea" placeholder="Jot quick notes as you play…" value={notes.text} onChange={e => setNotes(n => ({ ...n, text: e.target.value }))} />
      <div className="run-notes-foot"><span className="run-notes-hint">{notes.lastSavedAt ? `Last saved to session ${notes.lastSavedAt}` : 'Saved locally as you type'}</span><button className="run-sm-btn run-sm-danger" onClick={clearNotes}>Clear</button></div>
    </div>
  );

  // ── Sections ────────────────────────────────────────────────────────────────
  const Section = ({ k, title, defaultOpen, children }) => {
    const open = sects[k] !== undefined ? sects[k] : defaultOpen;
    return (
      <div className={`run-section${open ? ' open' : ''}`}>
        <div className="run-section-head" onClick={() => setSects(s => ({ ...s, [k]: !open }))}><span className="run-section-arrow">{open ? '▼' : '▶'}</span><span className="run-section-title">{title}</span></div>
        <div className="run-section-body" style={open ? undefined : { display: 'none' }}>{children}</div>
      </div>
    );
  };
  const Row = ({ lbl, children, cls }) => <div className={`run-npc-row${cls ? ' ' + cls : ''}`}><span className="run-npc-lbl">{lbl}</span> {children}</div>;

  // ── Combat mode ─────────────────────────────────────────────────────────────
  const encOpts = (data.encounters || []).filter(e => e.name);
  const selEnc = combat.selection === 'blank' ? null : (encOpts[parseInt(combat.selection)] || null);
  function CombatContent() {
    if (!selEnc) return <p className="run-empty-state">No encounter selected — running this fight off the cuff. Use the initiative tracker below.</p>;
    if (!selEnc.encounterPlanId) return <div className="run-combat-summary"><h3 className="run-npc-name">{selEnc.name}</h3>{selEnc.summary ? <div className="run-prose-block">{nl(selEnc.summary)}</div> : <p className="run-empty-state">No additional details recorded.</p>}</div>;
    const cached = encCache[selEnc.encounterPlanId];
    if (!cached || cached === 'loading') return <p className="run-empty-state">Loading encounter plan…</p>;
    if (cached === 'error') return <p className="run-empty-state">Couldn't load the full plan. <a href={`/encounter/view/${selEnc.encounterPlanId}`} target="_blank" rel="noopener" className="run-enc-link">Open it directly ↗</a></p>;
    return <div className="run-combat-full"><div className="run-enc-head"><span className="run-npc-name" style={{ margin: 0 }}>{cached.name || selEnc.name}</span><a href={`/encounter/view/${selEnc.encounterPlanId}`} className="run-enc-link" target="_blank" rel="noopener">Open Plan ↗</a></div><div className="markdown-body run-combat-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(cached.markdown || '') }} /></div>;
  }

  // ── Lookup ──────────────────────────────────────────────────────────────────
  const q = lookupQ.trim().toLowerCase();
  const lkNpcs = npcIndex.filter(n => !q || n.name.toLowerCase().includes(q) || (n.nickname || '').toLowerCase().includes(q));
  const lkLocs = locIndex.filter(l => !q || l.name.toLowerCase().includes(q));
  async function toggleLookup(kind, item) {
    const key = `${kind}:${item.id}`;
    const cur = lookupDetail[key];
    if (cur?.open) { setLookupDetail(d => ({ ...d, [key]: { ...cur, open: false } })); return; }
    if (cur?.data) { setLookupDetail(d => ({ ...d, [key]: { ...cur, open: true } })); return; }
    setLookupDetail(d => ({ ...d, [key]: { open: true, data: null } }));
    try { const full = await (await fetch(`/api/${kind === 'npc' ? 'npcs' : 'locations'}/${encodeURIComponent(item.id)}`)).json(); setLookupDetail(d => ({ ...d, [key]: { open: true, data: full } })); }
    catch { setLookupDetail(d => ({ ...d, [key]: { open: true, data: 'error' } })); }
  }
  function LookupItem({ kind, item, teaser }) {
    const key = `${kind}:${item.id}`; const st = lookupDetail[key];
    return (
      <div className="run-lookup-item">
        <button className="run-lookup-item-head" onClick={() => toggleLookup(kind, item)}><span className="run-lookup-item-meta"><span className="run-lookup-item-name">{item.name}</span><span className="run-lookup-item-id">{item.id}</span></span><span className="run-lookup-item-arrow">{st?.open ? '▾' : '▸'}</span></button>
        {teaser && <div className="run-lookup-item-teaser">{teaser.length > 90 ? teaser.slice(0, 90) + '…' : teaser}</div>}
        {st?.open && <div className="run-lookup-item-detail" style={{ display: 'block' }}>{!st.data ? <p className="run-empty-state">Loading…</p> : st.data === 'error' ? <p className="run-empty-state">Couldn't load details.</p> : kind === 'npc' ? <NpcDetail n={st.data} /> : <LocDetail l={st.data} />}</div>}
      </div>
    );
  }
  const NpcDetail = ({ n }) => { const rows = [n.situation && ['Situation', n.situation], n.wantsNeeds && ['Wants', n.wantsNeeds], n.commonPhrase && ['Says', `"${n.commonPhrase}"`], n.appearance && ['Looks', n.appearance], n.secretObstacle && ['Secret', n.secretObstacle]].filter(Boolean); return rows.length ? rows.map(([l, v]) => <Row key={l} lbl={l}>{v}</Row>) : <p className="run-empty-state">No roleplay notes recorded.</p>; };
  const LocDetail = ({ l }) => { const parts = []; if (l.description) parts.push(<div className="run-prose-block small" key="d">{nl(l.description)}</div>); if (l.sensoryDetail) parts.push(<Row key="s" lbl="Sensory">{l.sensoryDetail}</Row>); if (l.hiddenDetail) parts.push(<Row key="h" lbl="Hidden">{l.hiddenDetail}</Row>); return parts.length ? parts : <p className="run-empty-state">No details recorded.</p>; };

  return (
    <div id="run-app">
      <div className="run-header">
        <a href={`/view/${id}`} className="run-exit">← Exit Run Mode</a>
        <div className="run-header-center"><span className="run-session-num">Session #{session.sessionNumber}</span>{session.date && <span className="run-meta">{session.date}</span>}{session.partyLevel && <span className="run-meta">Lv {session.partyLevel}</span>}</div>
        <div className="run-header-right">
          <button className="run-sm-btn run-lookup-btn" title="Quick reference for NPCs and locations" onClick={() => setLookupOpen(o => !o)}>🔍 Lookup</button>
          <button className={`run-combat-toggle${combat.active ? ' active' : ''}`} onClick={() => { setCombat(c => ({ ...c, active: !c.active })); setAddForm(null); }}>{combat.active ? '📋 Exit Combat Mode' : '⚔ Combat Mode'}</button>
          {!combat.active && data.sessionGoal && <div className="run-goal">{data.sessionGoal}</div>}
        </div>
      </div>

      <div className="run-body">
        {combat.active ? (
          <div className="run-combat-mode">
            <div className="run-card run-combat-card">
              <div className="run-card-head"><span className="run-card-title">COMBAT ENCOUNTER</span></div>
              <div className="run-combat-toolbar"><label className="run-combat-picker-label">Encounter</label>
                <select className="run-add-inp" style={{ flex: 'none', minWidth: 240 }} value={combat.selection} onChange={e => setCombat(c => ({ ...c, selection: e.target.value }))}>
                  <option value="blank">— Blank / Unplanned Encounter —</option>
                  {encOpts.map((e, i) => <option key={i} value={i}>{e.name}</option>)}
                </select>
              </div>
              <div className="run-combat-content"><CombatContent /></div>
            </div>
            {InitCard()}
            {NotesCard()}
          </div>
        ) : (
          <>
            <div className="run-top-row">
              <div className="run-card" id="run-beats-card">
                <div className="run-card-head"><span className="run-card-title">SESSION BEATS</span><span className="run-progress-badge">{doneBeats}/4</span></div>
                {BEAT_DEFS.map(([k, label, time]) => {
                  const txt = data[`beat${label}`]; const ts = beats.times?.[k];
                  return (
                    <div className={`run-beat${beats[k] ? ' run-beat-done' : ''}`} key={k}>
                      <button className={`run-beat-cb${beats[k] ? ' checked' : ''}`} onClick={() => toggleBeat(k)} />
                      <div className="run-beat-text"><span className="run-beat-label">{label}</span><span className="run-beat-time">{time}</span>{ts && <span className="run-beat-ts">{ts}</span>}{txt && <span className="run-beat-preview">{txt.slice(0, 70)}{txt.length > 70 ? '…' : ''}</span>}</div>
                    </div>
                  );
                })}
              </div>
              {InitCard()}
            </div>
            {NotesCard()}

            {(data.openingReadAloud || data.threeOptionsPrompt) && <Section k="opening" title="Opening Read-Aloud" defaultOpen>{data.openingReadAloud && <div className="run-read-aloud">{nl(data.openingReadAloud)}</div>}{data.threeOptionsPrompt && <div className="run-prose-block"><strong>Three Options:</strong> {nl(data.threeOptionsPrompt)}</div>}</Section>}
            {(data.npcs || []).length > 0 && <Section k="npcs" title={`NPCs (${data.npcs.length})`} defaultOpen>{data.npcs.map((n, i) => <div className="run-npc-card" key={i}><div className="run-npc-name">{n.name}{n.faction && <span className="run-npc-faction"> · {n.faction}</span>}</div>{n.situation && <Row lbl="Situation">{n.situation}</Row>}{n.wants && <Row lbl="Wants">{n.wants}</Row>}{n.phrases && <Row lbl="Says" cls="run-npc-phrase">"{n.phrases}"</Row>}{n.bodyLanguage && <Row lbl="Body">{n.bodyLanguage}</Row>}{n.corneredLine && <Row lbl="Cornered" cls="run-npc-phrase">"{n.corneredLine}"</Row>}{n.neverDoes && <Row lbl="Never">{n.neverDoes}</Row>}</div>)}</Section>}
            {(data.locations || []).length > 0 && <Section k="locations" title={`Locations (${data.locations.length})`}>{data.locations.map((l, i) => <div className="run-location-card" key={i}><div className="run-npc-name">{l.name}</div>{l.description && <div className="run-prose-block">{nl(l.description)}</div>}{l.sensoryDetail && <Row lbl="Sensory">{l.sensoryDetail}</Row>}{l.hiddenDetail && <Row lbl="Hidden">{l.hiddenDetail}</Row>}{(l.districts || []).filter(d => d.name).map((d, di) => <div className="run-district" key={di}><div className="run-district-name">↳ {d.name}</div>{d.readAloud && <div className="run-prose-block small">{nl(d.readAloud)}</div>}{(d.pointsOfInterest || []).filter(p => p.name || p.description).map((p, pi) => <div className="run-poi" key={pi}>• {p.name && <strong>{p.name}</strong>}{p.description && ` — ${p.description}`}</div>)}</div>)}</div>)}</Section>}
            {(data.factionClocks || []).length > 0 && <Section k="clocks" title={`Faction Clocks (${data.factionClocks.length})`}>{data.factionClocks.map((c, i) => { const prog = parseInt(c.progress) || 0, max = parseInt(c.max) || 8; return <div className="run-clock-card" key={i}><div className="run-clock-row"><span className="run-npc-name" style={{ margin: 0 }}>{c.factionName}</span><span className="run-clock-count">{prog}/{max}</span></div><div className="run-clock-track"><div className="run-clock-fill" style={{ width: `${Math.min(100, prog / max * 100)}%` }} /></div>{c.goal && <Row lbl="Goal">{c.goal}</Row>}{c.completion && <Row lbl="Resolves">{c.completion}</Row>}</div>; })}</Section>}
            {(data.encounters || []).length > 0 && <Section k="encounters" title={`Combat Encounters (${data.encounters.length})`}>{data.encounters.map((e, i) => <div className="run-enc-card" key={i}><div className="run-enc-head"><span className="run-npc-name" style={{ margin: 0 }}>{e.name}</span>{e.encounterPlanId && <a href={`/encounter/view/${e.encounterPlanId}`} className="run-enc-link" target="_blank" rel="noopener">Open Plan ↗</a>}</div>{e.summary && <div className="run-prose-block small">{nl(e.summary)}</div>}</div>)}</Section>}
            {data.sessionNotes && <Section k="notes" title="Session Notes" defaultOpen><div className="run-prose-block">{nl(data.sessionNotes)}</div></Section>}
            {(data.sessionRecap || data.unresolvedThreads) && <Section k="continuity" title="Continuity">{data.sessionRecap && <Row lbl="Recap">{data.sessionRecap}</Row>}{data.unresolvedThreads && <Row lbl="Threads"><pre className="run-pre">{data.unresolvedThreads}</pre></Row>}</Section>}
          </>
        )}
      </div>

      <div className={`run-lookup-backdrop${lookupOpen ? ' open' : ''}`} onClick={() => setLookupOpen(false)} />
      <aside className={`run-lookup-panel${lookupOpen ? ' open' : ''}`}>
        <div className="run-lookup-head"><div className="run-lookup-head-copy"><span className="run-card-title">QUICK LOOKUP</span><span className="run-lookup-subtitle">NPCs and locations for the active campaign.</span></div><button className="run-lookup-close" title="Close" onClick={() => setLookupOpen(false)}>×</button></div>
        <input type="text" className="run-add-inp run-lookup-search" placeholder="Search NPCs & locations…" value={lookupQ} onChange={e => setLookupQ(e.target.value)} />
        <div className="run-lookup-results">
          {!lkNpcs.length && !lkLocs.length ? <p className="run-empty-state">{q ? 'No NPCs or locations match.' : 'No NPCs or locations in this campaign yet.'}</p> : <>
            {lkNpcs.length > 0 && <div className="run-lookup-group"><div className="run-lookup-group-label">NPCs ({lkNpcs.length})</div>{lkNpcs.map(n => <LookupItem key={n.id} kind="npc" item={n} teaser={n.situation || n.nickname} />)}</div>}
            {lkLocs.length > 0 && <div className="run-lookup-group"><div className="run-lookup-group-label">Locations ({lkLocs.length})</div>{lkLocs.map(l => <LookupItem key={l.id} kind="location" item={l} teaser={l.description || l.government} />)}</div>}
          </>}
        </div>
      </aside>
    </div>
  );
}
