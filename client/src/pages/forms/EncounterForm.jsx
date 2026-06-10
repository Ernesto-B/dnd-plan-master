import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import FormShell from '../../components/form/FormShell.jsx';
import { Section, Field, AutoTextArea, TagField } from '../../components/form/FormKit.jsx';
import { toast } from '../../lib/vanilla.js';

const MAX_ENEMIES = 8;
const LORE_SKILLS = ['Arcana', 'History', 'Nature', 'Religion', 'Investigation', 'Medicine', 'Perception'];
const SECTIONS = [
  { id: 'es-overview', num: '01', label: 'Overview' }, { id: 'es-fiction', num: '02', label: 'Fiction & Outcome' },
  { id: 'es-objective', num: '03', label: 'Sec. Objective' }, { id: 'es-environment', num: '04', label: 'Environment' },
  { id: 'es-enemies', num: '05', label: 'Enemies' }, { id: 'es-tasks', num: '06', label: 'Natural Tasks' },
  { id: 'es-checklist', num: '07', label: 'Checklist' }, { id: 'es-notes', num: '08', label: 'Combat Notes' },
];
const CHECKS = [
  ['situationComplexity', <>Difficulty comes from <strong>situation complexity</strong>, not capability degradation</>],
  ['noProne', <>No prone applied to players through environmental effects <em>(use positional threat with one round of warning)</em></>],
  ['noHighAC', <>No enemy with AC 18+ whose sole function is to be hard to hit <em>(use mobility or a puzzle mechanic)</em></>],
  ['everyoneHasTask', <>Every player has something meaningful to do on every turn</>],
  ['discoverableRound1', <>Key mechanic is discoverable within round 1 (via at least two front-loading channels)</>],
  ['nonViolentPath', <>At least one non-violent solution path exists</>],
];
const newEnemy = () => ({ name: '', role: '', isPuzzle: false, pressure: '', key: '', frontload: {
  lore: { enabled: false, skill: 'Arcana', dc: '', info: '' }, visual: { enabled: false, description: '' },
  behaviour: { enabled: false, description: '' }, initiative: { enabled: false, description: '' } } });
const newTask = (d = {}) => ({ name: d.name || '', playerClass: d.playerClass || '', task: d.task || '', ability: d.ability || '', characterUrl: d.characterUrl || '' });

function EnemyCard({ n, enemy, update, remove }) {
  const fl = enemy.frontload;
  const setFl = (ch, patch) => update({ frontload: { ...fl, [ch]: { ...fl[ch], ...patch } } });
  return (
    <div className="card enemy-card">
      <div className="card-header"><span className="card-title">Enemy {n}</span>
        <button type="button" className="remove-btn btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={remove}>✕ Remove</button></div>
      <div className="form-grid">
        <Field label="Enemy Name / Type *"><input type="text" placeholder="Harwick the Scar" value={enemy.name} onChange={e => update({ name: e.target.value })} /></Field>
        <Field label="Role" hint="One sentence on their combat function."><input type="text" placeholder="Lead enforcer — grapples the most dangerous PC toward the canal." value={enemy.role} onChange={e => update({ role: e.target.value })} /></Field>
        <div className="field full">
          <label className="check-label puzzle-toggle-label">
            <input type="checkbox" checked={enemy.isPuzzle} onChange={e => update({ isPuzzle: e.target.checked })} />
            <strong>Puzzle Enemy</strong> — has a specific mechanic the party must discover and counter
          </label>
        </div>
      </div>
      {enemy.isPuzzle && (
        <div className="puzzle-fields">
          <div className="form-grid">
            <Field label="Mechanical Pressure" hint="What does this enemy do that demands a response?" full><AutoTextArea className="short" placeholder="Regenerates 10 HP at start of each turn…" value={enemy.pressure} onChange={e => update({ pressure: e.target.value })} /></Field>
            <Field label="The Key" hint="What specific action or condition counters the pressure?" full><AutoTextArea className="short" placeholder="Cold iron disrupts the regeneration for one round…" value={enemy.key} onChange={e => update({ key: e.target.value })} /></Field>
            <div className="field full">
              <label>Front-Loading Channels</label>
              <span className="hint">Choose at least two ways players can discover the key mechanic.</span>
              <div className="frontload-grid">
                <label className="check-label"><input type="checkbox" checked={fl.lore.enabled} onChange={e => setFl('lore', { enabled: e.target.checked })} /><strong>Lore Check</strong></label>
                {fl.lore.enabled && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 2fr', gap: 8, alignItems: 'end', margin: '4px 0 8px 24px' }}>
                    <Field label="Skill"><select value={fl.lore.skill} onChange={e => setFl('lore', { skill: e.target.value })}>{LORE_SKILLS.map(s => <option key={s}>{s}</option>)}</select></Field>
                    <Field label="DC"><input type="number" min="5" max="30" style={{ maxWidth: 80 }} placeholder="14" value={fl.lore.dc} onChange={e => setFl('lore', { dc: e.target.value })} /></Field>
                    <Field label="Information revealed"><input type="text" placeholder="The insignia is a ward…" value={fl.lore.info} onChange={e => setFl('lore', { info: e.target.value })} /></Field>
                  </div>
                )}
                <label className="check-label"><input type="checkbox" checked={fl.visual.enabled} onChange={e => setFl('visual', { enabled: e.target.checked })} /><strong>Visual Tell</strong></label>
                {fl.visual.enabled && <div style={{ margin: '4px 0 8px 24px' }}><Field label="Opening description that implies the solution"><AutoTextArea className="short" value={fl.visual.description} onChange={e => setFl('visual', { description: e.target.value })} /></Field></div>}
                <label className="check-label"><input type="checkbox" checked={fl.behaviour.enabled} onChange={e => setFl('behaviour', { enabled: e.target.checked })} /><strong>Behaviour Signal</strong></label>
                {fl.behaviour.enabled && <div style={{ margin: '4px 0 8px 24px' }}><Field label="What the enemy does on turn 1 that signals how they work"><AutoTextArea className="short" value={fl.behaviour.description} onChange={e => setFl('behaviour', { description: e.target.value })} /></Field></div>}
                <label className="check-label"><input type="checkbox" checked={fl.initiative.enabled} onChange={e => setFl('initiative', { enabled: e.target.checked })} /><strong>Initiative / Perception Reward</strong></label>
                {fl.initiative.enabled && <div style={{ margin: '4px 0 8px 24px' }}><Field label="One sentence for a player who rolls 17+ on initiative"><input type="text" value={fl.initiative.description} onChange={e => setFl('initiative', { description: e.target.value })} /></Field></div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EncounterForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const tagRef = useRef(null);

  const [f, setF] = useState({
    name: '', sessionId: '', fiction: '', winCondition: '', interestingFailure: '',
    objDescription: '', objRound: '', objInitiative: '', objConsequence: '',
    envLayer1: '', envLayer2trigger: '', envLayer2ongoing: '', envLayer3: '', notes: '',
  });
  const [checklist, setChecklist] = useState(Object.fromEntries(CHECKS.map(([k]) => [k, false])));
  const [enemies, setEnemies] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [sessionOpts, setSessionOpts] = useState([]);
  const [initialTags, setInitialTags] = useState([]);
  const [status, setStatus] = useState('active');
  const [busy, setBusy] = useState(false);

  // Preview modal
  const [preview, setPreview] = useState(null); // { markdown, pdf, filename }
  const [pendingData, setPendingData] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [tab, setTab] = useState('pdf');
  const [saveNote, setSaveNote] = useState('');

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const updEnemy = (i, patch) => setEnemies(es => es.map((e, ei) => ei === i ? { ...e, ...patch } : e));
  const updTask = (i, patch) => setTasks(ts => ts.map((t, ti) => ti === i ? { ...t, ...patch } : t));

  useEffect(() => {
    let alive = true;
    (async () => {
      const [sessions, settings] = await Promise.all([
        fetch('/api/sessions').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/settings').then(r => r.ok ? r.json() : {}).catch(() => ({})),
      ]);
      if (!alive) return;
      setSessionOpts(sessions.map(s => ({ value: s.id, label: `Session ${String(s.sessionNumber).padStart(3, '0')} — ${s.goal ? s.goal.slice(0, 50) : '(no goal)'}` })));
      if (isEdit) {
        try {
          const res = await fetch(`/api/encounters/${id}`);
          if (!res.ok) throw new Error();
          const enc = await res.json();
          if (!alive) return;
          setStatus(enc.status || 'active');
          populate(enc.data || {});
          setInitialTags((enc.data || {}).tags || []);
          document.title = `Edit ${enc.name || 'Encounter'} — D&D Session Master`;
        } catch { toast('Could not load encounter for editing.', 'error'); }
      } else {
        setTasks((settings.party || []).map(p => newTask({ name: p.name, playerClass: p.playerClass, characterUrl: p.characterUrl })));
      }
    })();
    return () => { alive = false; };
  }, [id, isEdit]);

  function populate(d) {
    const o = d.secondaryObjective || {}, e = d.environment || {};
    setF({
      name: d.name || '', sessionId: d.sessionId || '', fiction: d.fiction || '', winCondition: d.winCondition || '',
      interestingFailure: d.interestingFailure || '', objDescription: o.description || '', objRound: o.round || '',
      objInitiative: o.initiative || '', objConsequence: o.consequence || '', envLayer1: e.layer1 || '',
      envLayer2trigger: e.layer2trigger || '', envLayer2ongoing: e.layer2ongoing || '', envLayer3: e.layer3 || '', notes: d.notes || '',
    });
    setChecklist({ ...Object.fromEntries(CHECKS.map(([k]) => [k, false])), ...(d.checklist || {}) });
    setEnemies((d.enemies || []).map(en => ({ ...newEnemy(), ...en, frontload: { ...newEnemy().frontload, ...(en.frontload || {}) } })));
    setTasks((d.naturalTasks || []).map(newTask));
  }

  function collect() {
    return {
      id: isEdit ? id : undefined,
      status: status === 'draft' ? 'draft' : undefined,
      name: f.name, sessionId: f.sessionId || null, fiction: f.fiction, winCondition: f.winCondition,
      interestingFailure: f.interestingFailure,
      secondaryObjective: { description: f.objDescription, round: f.objRound, initiative: f.objInitiative, consequence: f.objConsequence },
      environment: { layer1: f.envLayer1, layer2trigger: f.envLayer2trigger, layer2ongoing: f.envLayer2ongoing, layer3: f.envLayer3 },
      enemies: enemies.map(e => ({
        name: e.name.trim(), role: e.role.trim(), isPuzzle: e.isPuzzle,
        pressure: e.isPuzzle ? e.pressure.trim() : '', key: e.isPuzzle ? e.key.trim() : '',
        frontload: e.isPuzzle ? e.frontload : {},
      })).filter(e => e.name),
      naturalTasks: tasks.map(t => ({ name: t.name.trim(), playerClass: t.playerClass.trim(), task: t.task.trim(), ability: t.ability.trim(), characterUrl: t.characterUrl.trim() })),
      checklist, notes: f.notes, tags: tagRef.current ? tagRef.current.getTags() : [],
    };
  }

  // PDF blob for the preview iframe.
  useEffect(() => {
    if (!preview?.pdf) { setPdfUrl(''); return; }
    const bytes = Uint8Array.from(atob(preview.pdf), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);

  async function onPreview() {
    if (!f.name.trim()) { toast('Encounter name is required.', 'error'); return; }
    setBusy(true);
    try {
      const data = collect();
      const res = await fetch('/api/encounters/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Preview failed');
      setPendingData(data); setPreview(result); setTab('pdf'); setSaveNote('');
    } catch (err) { toast('Preview error: ' + err.message, 'error'); } finally { setBusy(false); }
  }

  async function postEncounter(data) {
    const res = await fetch('/api/encounters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const saved = await res.json();
    if (!res.ok) throw new Error(saved.error || 'Save failed');
    return saved;
  }

  async function onSaveToApp() {
    setBusy(true);
    try { const saved = await postEncounter(pendingData); toast('Encounter plan saved.', 'success'); navigate(`/encounter/view/${saved.id}`); }
    catch (err) { toast('Save error: ' + err.message, 'error'); setBusy(false); }
  }

  async function onSaveExport() {
    setBusy(true);
    try {
      const saved = await postEncounter(pendingData);
      setSaveNote('A folder picker has opened on your desktop — choose where to save the files.');
      const fileRes = await fetch('/api/encounters/save-files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: preview.markdown, pdf: preview.pdf, filename: preview.filename }) });
      const fr = await fileRes.json();
      if (!fileRes.ok) throw new Error(fr.error || 'File save failed');
      toast(fr.cancelled ? 'Encounter saved — no folder selected.' : `Saved ${preview.filename}.md and .pdf → ${fr.path}`, 'success');
      navigate(`/encounter/view/${saved.id}`);
    } catch (err) { toast('Save error: ' + err.message, 'error'); setSaveNote(''); setBusy(false); }
  }

  async function onSaveDraft() {
    if (!f.name.trim()) { toast('Encounter name is required.', 'error'); return; }
    setBusy(true);
    try { const saved = await postEncounter({ ...collect(), status: 'draft' }); toast('Draft saved.', 'success'); navigate(`/encounter/view/${saved.id}`); }
    catch (err) { toast('Save error: ' + err.message, 'error'); setBusy(false); }
  }

  const showDraftBtn = !isEdit || status === 'draft';
  const actions = (
    <>
      {showDraftBtn && <button type="button" className="btn btn-ghost" disabled={busy} onClick={onSaveDraft}>Save as Draft</button>}
      <button type="button" className="btn btn-submit" disabled={busy} onClick={onPreview}>{busy ? 'Generating…' : 'Preview Encounter Plan'}</button>
      <p className="submit-note">You'll see the PDF and markdown before choosing where to save.</p>
    </>
  );

  return (
    <FormShell
      backHref={isEdit ? `/encounter/view/${id}` : '/encounters'} backLabel={isEdit ? '← Back to Encounter' : '← All Encounters'} backNative
      title={isEdit ? 'Edit Encounter Plan' : 'New Encounter Plan'}
      subtitle={isEdit ? 'Update the encounter plan, then preview and save.' : 'Design a combat encounter using the complete 8-step framework.'}
      sections={SECTIONS} actions={actions}
    >
      <Section num="01" title="Overview" id="es-overview">
        <Field label="Encounter Name *" full htmlFor="enc-name"><input id="enc-name" type="text" placeholder="Guild Tail — Dockside Chase" value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Link to Session" hint="Optional — attach this encounter plan to a session plan." full htmlFor="enc-session">
          <select id="enc-session" value={f.sessionId} onChange={e => set('sessionId', e.target.value)}>
            <option value="">— No session linked —</option>
            {sessionOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Tags" hint="Press Enter or comma to add. Click a tag to remove." full><TagField initialTags={initialTags} tagRef={tagRef} /></Field>
      </Section>

      <Section num="02" title="Fiction & Outcome" id="es-fiction">
        <Field label="Fiction" hint="One sentence: what is actually happening here, and why?" full><AutoTextArea className="short" value={f.fiction} onChange={e => set('fiction', e.target.value)} /></Field>
        <Field label="Win Condition" hint='What does full success look like? (Not just "enemies dead.")'><AutoTextArea className="short" value={f.winCondition} onChange={e => set('winCondition', e.target.value)} /></Field>
        <Field label="Interesting Failure" hint="What opens up if they lose or partially succeed? Never a dead end."><AutoTextArea className="short" value={f.interestingFailure} onChange={e => set('interestingFailure', e.target.value)} /></Field>
      </Section>

      <Section num="03" title="Secondary Objective" id="es-objective">
        <Field label="Objective Description" hint="What must at least one player divert attention to? Urgent and meaningful." full><AutoTextArea className="short" value={f.objDescription} onChange={e => set('objDescription', e.target.value)} /></Field>
        <Field label="Resolves on Round"><input type="number" min="1" placeholder="3" style={{ maxWidth: 200 }} value={f.objRound} onChange={e => set('objRound', e.target.value)} /></Field>
        <Field label="Initiative Count"><input type="number" min="1" placeholder="5" style={{ maxWidth: 200 }} value={f.objInitiative} onChange={e => set('objInitiative', e.target.value)} /></Field>
        <Field label="Consequence if Ignored" full><AutoTextArea className="short" value={f.objConsequence} onChange={e => set('objConsequence', e.target.value)} /></Field>
      </Section>

      <Section num="04" title="Environment" id="es-environment">
        <Field label="Layer 1 — Terrain That Creates Decisions" hint="What can be used, climbed, hidden behind, destroyed, or leveraged? At least two options." full><AutoTextArea value={f.envLayer1} onChange={e => set('envLayer1', e.target.value)} /></Field>
        <Field label="Layer 2 — Threat Triggers End of Round"><input type="number" min="1" placeholder="1" style={{ maxWidth: 200 }} value={f.envLayer2trigger} onChange={e => set('envLayer2trigger', e.target.value)} /></Field>
        <Field label="Layer 2 — Ongoing Consequence" hint='Format: "Starting round X+1, [what changes each round]."' full><AutoTextArea value={f.envLayer2ongoing} onChange={e => set('envLayer2ongoing', e.target.value)} /></Field>
        <Field label="Layer 3 — Feature for Non-Damage Dealers" hint="One environmental tool useful to the player who tends to have fewer combat moments." full><AutoTextArea className="short" value={f.envLayer3} onChange={e => set('envLayer3', e.target.value)} /></Field>
      </Section>

      <div className="section-header" id="es-enemies"><span className="section-num">05</span><h2>Enemies</h2></div>
      <div id="enemy-list">
        {enemies.map((en, i) => <EnemyCard key={i} n={i + 1} enemy={en} update={patch => updEnemy(i, patch)} remove={() => setEnemies(es => es.filter((_, ei) => ei !== i))} />)}
      </div>
      {enemies.length < MAX_ENEMIES && <button type="button" className="btn btn-add" onClick={() => setEnemies([...enemies, newEnemy()])}>+ Add Enemy</button>}

      <div className="section-header" id="es-tasks"><span className="section-num">06</span><h2>Natural Tasks Per Player</h2></div>
      <div className="card">
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16, fontStyle: 'italic' }}>Pre-filled from your party roster settings. Fill in what each player specifically has to do in this encounter.</p>
        <div id="task-list">
          {tasks.map((t, i) => (
            <div className="form-grid task-row" key={i} style={{ gridTemplateColumns: '1.2fr 1.2fr 2fr 2fr auto', gap: 8, marginBottom: 8, alignItems: 'end' }}>
              <Field label="Player"><input type="text" placeholder="Aldric" value={t.name} onChange={e => updTask(i, { name: e.target.value })} /><input type="url" placeholder="Character sheet URL" value={t.characterUrl} onChange={e => updTask(i, { characterUrl: e.target.value })} /></Field>
              <Field label="Class / Role"><input type="text" placeholder="Paladin" value={t.playerClass} onChange={e => updTask(i, { playerClass: e.target.value })} /></Field>
              <Field label="Natural Task in This Encounter"><input type="text" placeholder="Intercept the fleeing convict OR hold the line." value={t.task} onChange={e => updTask(i, { task: e.target.value })} /></Field>
              <Field label="Ability / Feature Used"><input type="text" placeholder="Sacred Weapon + speed makes a credible interceptor." value={t.ability} onChange={e => updTask(i, { ability: e.target.value })} /></Field>
              <div className="field" style={{ paddingBottom: 2 }}><button type="button" className="btn btn-ghost remove-btn" style={{ color: 'var(--danger)' }} onClick={() => setTasks(ts => ts.filter((_, ti) => ti !== i))}>✕</button></div>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-add" style={{ marginTop: 8 }} onClick={() => setTasks([...tasks, newTask()])}>+ Add Player Row</button>
      </div>

      <div className="section-header" id="es-checklist"><span className="section-num">07</span><h2>Design Checklist</h2></div>
      <div className="card">
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16, fontStyle: 'italic' }}>Verify your encounter against the core design principles before finalising.</p>
        <div className="checklist-form">
          {CHECKS.map(([k, label]) => (
            <label className="check-label" key={k}><input type="checkbox" checked={checklist[k]} onChange={e => setChecklist(c => ({ ...c, [k]: e.target.checked }))} /> {label}</label>
          ))}
        </div>
      </div>

      <Section num="08" title="Combat Notes" id="es-notes">
        <Field label="Reference Notes & Contingencies"><AutoTextArea style={{ minHeight: 130 }} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="CONTINGENCY — If party tries to run: …" /></Field>
      </Section>

      {preview && createPortal(
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-box">
            <div className="modal-header"><h2>Preview: {preview.filename}</h2><button type="button" className="btn btn-ghost" onClick={() => setPreview(null)}>✕ Close</button></div>
            <div className="modal-tabs">
              <button className={`tab-btn${tab === 'pdf' ? ' active' : ''}`} onClick={() => setTab('pdf')}>PDF Preview</button>
              <button className={`tab-btn${tab === 'md' ? ' active' : ''}`} onClick={() => setTab('md')}>Markdown</button>
            </div>
            <div className="modal-content">
              <div className={`tab-panel${tab === 'pdf' ? '' : ' hidden'}`}><iframe id="pdf-frame" title="PDF Preview" src={pdfUrl} /></div>
              <div className={`tab-panel${tab === 'md' ? '' : ' hidden'}`}><div className="markdown-body" dangerouslySetInnerHTML={{ __html: marked.parse(preview.markdown || '') }} /></div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setPreview(null)}>← Keep Editing</button>
              <span className="save-note">{saveNote}</span>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={onSaveToApp}>Save to App</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={onSaveExport}>Save + Export Files…</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </FormShell>
  );
}
