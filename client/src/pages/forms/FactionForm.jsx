import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import FormShell from '../../components/form/FormShell.jsx';
import { Section, Field, AutoTextArea, TagField } from '../../components/form/FormKit.jsx';
import { toast } from '../../lib/vanilla.js';

const MAX_CLOCKS = 3, MAX_STEPS = 8;
const REP = [['-3', '-3 Hostile'], ['-2', '-2 Distrusted'], ['-1', '-1 Cold'], ['0', '0 Neutral'], ['1', '1 Warm'], ['2', '2 Trusted'], ['3', '3 Allied']];
const SECTIONS = [
  { id: 's-identity', num: '01', label: 'Identity' },
  { id: 's-snapshot', num: '02', label: 'Snapshot' },
  { id: 's-clocks', num: '03', label: 'Faction Clocks' },
];
const clampSteps = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(1, Math.min(MAX_STEPS, n)) : 4; };
const newClock = () => ({ name: '', steps: 4, advanceTrigger: '', setbackTrigger: '', stepDescriptions: ['', '', '', ''] });

function Clocks({ clocks, setClocks }) {
  const upd = (i, patch) => setClocks(clocks.map((c, ci) => ci === i ? { ...c, ...patch } : c));
  const setSteps = (i, raw) => {
    const n = clampSteps(raw);
    const cur = clocks[i].stepDescriptions;
    upd(i, { steps: n, stepDescriptions: Array.from({ length: n }, (_, j) => cur[j] || '') });
  };
  return (
    <>
      {clocks.map((c, i) => (
        <div className="faction-clock-card" key={i}>
          <div className="district-sub-header">
            <span className="district-sub-title">Clock {i + 1}</span>
            <button type="button" className="btn btn-danger remove-btn" style={{ fontSize: 11, padding: '3px 8px' }}
              onClick={() => setClocks(clocks.filter((_, ci) => ci !== i))}>Remove</button>
          </div>
          <div className="form-grid">
            <Field label="Clock Name"><input type="text" className="faction-clock-name" placeholder="Tollgate Takeover" value={c.name} onChange={e => upd(i, { name: e.target.value })} /></Field>
            <Field label="Steps">
              <select className="faction-clock-steps-count" value={c.steps} onChange={e => setSteps(i, e.target.value)}>
                {Array.from({ length: MAX_STEPS }, (_, j) => <option key={j + 1} value={j + 1}>{j + 1}</option>)}
              </select>
            </Field>
            <Field label="What advances this clock?" full><AutoTextArea className="short" placeholder="Merchants pay protection quietly, inspectors vanish, or the party looks the other way." value={c.advanceTrigger} onChange={e => upd(i, { advanceTrigger: e.target.value })} /></Field>
            <Field label="What pushes this clock back?" full><AutoTextArea className="short" placeholder="A public scandal, a rival exposing the scheme, or the party breaking the toll network." value={c.setbackTrigger} onChange={e => upd(i, { setbackTrigger: e.target.value })} /></Field>
          </div>
          <div className="faction-clock-steps-wrap">
            <div className="district-container-label">Step Changes <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(one short paragraph per step)</span></div>
            <div className="faction-clock-steps-list">
              {c.stepDescriptions.map((step, si) => (
                <div className="faction-step-card" key={si}>
                  <div className="faction-step-head">Step {si + 1}</div>
                  <AutoTextArea className="short" placeholder="What changes in the faction once this step is reached?"
                    value={step} onChange={e => upd(i, { stepDescriptions: c.stepDescriptions.map((x, j) => j === si ? e.target.value : x) })} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
      {clocks.length < MAX_CLOCKS && <button type="button" className="btn btn-add" onClick={() => setClocks([...clocks, newClock()])}>+ Add Faction Clock</button>}
    </>
  );
}

export default function FactionForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const tagRef = useRef(null);
  const linksRef = useRef({ linkedSessions: [], linkedEncounters: [], linkedNpcs: [], linkedLocations: [] });

  const [f, setF] = useState({ name: '', origin: '', goal: '', size: '', partyReputation: '0' });
  const [clocks, setClocks] = useState([]);
  const [initialTags, setInitialTags] = useState([]);
  const [status, setStatus] = useState('active');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/factions/${id}`);
        if (!res.ok) throw new Error();
        const fa = await res.json();
        if (!alive) return;
        setStatus(fa.status || 'active');
        setF({ name: fa.name || '', origin: fa.origin || '', goal: fa.goal || '', size: fa.size ?? '', partyReputation: String(fa.partyReputation ?? 0) });
        setClocks((fa.factionClocks || []).map(c => {
          const steps = clampSteps(c.steps || (c.stepDescriptions || []).length || 4);
          return { name: c.name || '', steps, advanceTrigger: c.advanceTrigger || '', setbackTrigger: c.setbackTrigger || '',
            stepDescriptions: Array.from({ length: steps }, (_, j) => (c.stepDescriptions || [])[j] || '') };
        }));
        linksRef.current = {
          linkedSessions: [...(fa.linkedSessions || [])], linkedEncounters: [...(fa.linkedEncounters || [])],
          linkedNpcs: [...(fa.linkedNpcs || [])], linkedLocations: [...(fa.linkedLocations || [])],
        };
        setInitialTags(fa.tags || []);
        document.title = `Edit ${fa.name} — D&D Session Master`;
      } catch { toast('Could not load faction for editing.', 'error'); }
    })();
    return () => { alive = false; };
  }, [id, isEdit]);

  async function save(statusOverride) {
    if (!f.name.trim()) { toast('Name is required.', 'error'); return; }
    const body = {
      status: statusOverride || (status === 'draft' ? 'draft' : undefined),
      name: f.name.trim(), origin: f.origin.trim(), goal: f.goal.trim(), size: String(f.size).trim(),
      partyReputation: parseInt(f.partyReputation, 10) || 0,
      factionClocks: clocks.map(c => ({
        name: c.name.trim(), steps: clampSteps(c.steps), advanceTrigger: c.advanceTrigger.trim(),
        setbackTrigger: c.setbackTrigger.trim(), stepDescriptions: c.stepDescriptions.map(s => s.trim()),
      })).filter(c => c.name || c.advanceTrigger || c.setbackTrigger || c.stepDescriptions.some(Boolean)),
      ...linksRef.current,
      tags: tagRef.current ? tagRef.current.getTags() : [],
    };
    setSaving(true);
    try {
      const res = await fetch(isEdit ? `/api/factions/${id}` : '/api/factions', {
        method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      const saved = await res.json();
      navigate(`/faction/view/${saved.id}`);
    } catch (err) { toast('Save failed: ' + err.message, 'error'); setSaving(false); }
  }

  const draftLabel = (isEdit && status === 'draft') ? 'Save Draft' : 'Save Faction';
  const showDraftBtn = !isEdit || status === 'draft';
  const actions = (
    <>
      {showDraftBtn && <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => save('draft')}>Save as Draft</button>}
      <button type="button" className="btn btn-submit" disabled={saving} onClick={() => save()}>{saving ? 'Saving…' : draftLabel}</button>
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/factions')}>Cancel</button>
    </>
  );

  return (
    <FormShell
      backHref={isEdit ? `/faction/view/${id}` : '/factions'} backLabel={isEdit ? '← Back to Faction' : '← All Factions'} backNative
      title={isEdit ? 'Edit Faction' : 'New Faction'}
      subtitle={isEdit ? "Update this faction's agenda, clocks, and connected records." : 'Track the groups whose agendas keep moving even when the party is elsewhere.'}
      sections={SECTIONS} actions={actions}
    >
      <Section num="01" title="Identity" id="s-identity">
        <Field label="Name *" htmlFor="faction-name"><input id="faction-name" type="text" placeholder="The Ashen Ledger" value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Country / Region of Origin" htmlFor="faction-origin"><input id="faction-origin" type="text" placeholder="Lower Thornhaven, backed by canal merchants…" value={f.origin} onChange={e => set('origin', e.target.value)} /></Field>
        <Field label="Tags" hint="Press Enter or comma to add. Click a tag to remove." full><TagField initialTags={initialTags} tagRef={tagRef} /></Field>
      </Section>

      <Section num="02" title="Snapshot" id="s-snapshot">
        <Field label="Goal" full><AutoTextArea className="short" placeholder="Control every toll gate on the canal route before the governor realizes how much leverage has shifted." value={f.goal} onChange={e => set('goal', e.target.value)} /></Field>
        <Field label="Size" htmlFor="faction-size"><input id="faction-size" type="number" min="0" max="999999" step="1" placeholder="250" value={f.size} onChange={e => set('size', e.target.value)} /></Field>
        <Field label="Party Reputation" htmlFor="faction-rep">
          <select id="faction-rep" value={f.partyReputation} onChange={e => set('partyReputation', e.target.value)}>
            {REP.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      </Section>

      <div className="section-header" id="s-clocks"><span className="section-num">03</span><h2>Faction Clocks</h2></div>
      <div className="card">
        <p className="settings-hint" style={{ marginBottom: 14 }}>Add up to {MAX_CLOCKS} clocks. Each clock can have up to {MAX_STEPS} steps, and every step can describe how the faction changes when that threshold is reached.</p>
        <div className="faction-clock-list"><Clocks clocks={clocks} setClocks={setClocks} /></div>
      </div>
    </FormShell>
  );
}
