import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import FormShell from '../../components/form/FormShell.jsx';
import { Section, Field, AutoTextArea, TagField } from '../../components/form/FormKit.jsx';
import LinkedRecordPicker from '../../components/form/LinkedRecordPicker.jsx';
import { toast } from '../../lib/vanilla.js';

const MAX_DIST = 5, MAX_POI = 5;
const SECTIONS = [
  { id: 's-general', num: '01', label: 'General' },
  { id: 's-details', num: '02', label: 'Location Details' },
  { id: 's-horizon', num: '03', label: 'On the Horizon' },
  { id: 's-links', num: '04', label: 'Tags & Links' },
];

function Districts({ districts, setDistricts }) {
  const upd = (i, patch) => setDistricts(districts.map((d, di) => di === i ? { ...d, ...patch } : d));
  return (
    <div className="district-container">
      <div className="district-container-label">Districts <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(up to {MAX_DIST})</span></div>
      <div className="district-list-inner">
        {districts.map((d, i) => (
          <div className="district-sub-card" key={i}>
            <div className="district-sub-header">
              <span className="district-sub-title">District {i + 1}</span>
              <button type="button" className="btn btn-danger remove-btn" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => setDistricts(districts.filter((_, di) => di !== i))}>Remove</button>
            </div>
            <div className="form-grid">
              <div className="field full">
                <label>District Name</label>
                <input type="text" className="dist-name" placeholder="Market District" value={d.name} onChange={e => upd(i, { name: e.target.value })} />
              </div>
              <div className="field full">
                <label>Read-Aloud Description</label>
                <span className="hint">What you read to the party when they enter this district.</span>
                <AutoTextArea className="dist-read-aloud short" placeholder="As you pass through the arched gate, the smell of fresh bread fills the air…"
                  value={d.readAloud} onChange={e => upd(i, { readAloud: e.target.value })} />
              </div>
            </div>
            <div className="poi-section">
              <div className="poi-container-label" style={{ marginTop: 10 }}>Points of Interest <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(up to {MAX_POI})</span></div>
              <div className="poi-container">
                {d.pois.map((p, pi) => (
                  <div className="poi-row" key={pi}>
                    <span className="poi-num">{pi + 1}.</span>
                    <input type="text" className="poi-name" placeholder="Fish Market" value={p.name}
                      onChange={e => upd(i, { pois: d.pois.map((x, j) => j === pi ? { ...x, name: e.target.value } : x) })} />
                    <AutoTextArea className="poi-desc" placeholder="A bustling row of stalls selling fresh catch…" style={{ minHeight: 44 }}
                      value={p.description} onChange={e => upd(i, { pois: d.pois.map((x, j) => j === pi ? { ...x, description: e.target.value } : x) })} />
                    <button type="button" className="btn-remove-sm" title="Remove"
                      onClick={() => upd(i, { pois: d.pois.filter((_, j) => j !== pi) })}>×</button>
                  </div>
                ))}
              </div>
              {d.pois.length < MAX_POI && (
                <button type="button" className="btn btn-add-sm" onClick={() => upd(i, { pois: [...d.pois, { name: '', description: '' }] })}>+ Add Point of Interest</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {districts.length < MAX_DIST && (
        <button type="button" className="btn btn-add-sm" onClick={() => setDistricts([...districts, { name: '', readAloud: '', pois: [] }])}>+ Add District</button>
      )}
    </div>
  );
}

export default function LocationForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const tagRef = useRef(null);

  const [f, setF] = useState({
    name: '', government: '', populationSize: '', populationDiversity: '', languages: '', resources: '',
    funFact: '', description: '', sensoryDetail: '', hiddenDetail: '', onTheHorizon: '', linkedSessions: [],
  });
  const [districts, setDistricts] = useState([]);
  const [initialTags, setInitialTags] = useState([]);
  const [status, setStatus] = useState('active');
  const [sessionOpts, setSessionOpts] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    let alive = true;
    (async () => {
      const sessions = await fetch('/api/sessions').then(r => r.ok ? r.json() : []).catch(() => []);
      if (!alive) return;
      setSessionOpts(sessions.map(s => {
        const n = String(s.sessionNumber || '?').includes('.') ? s.sessionNumber : String(s.sessionNumber || '?').padStart(3, '0');
        return { value: s.id, label: `#${n}${s.date ? ' — ' + s.date : ''}${s.goal ? ': ' + s.goal.slice(0, 40) : ''}` };
      }));
      if (isEdit) {
        try {
          const res = await fetch(`/api/locations/${id}`);
          if (!res.ok) throw new Error();
          const loc = await res.json();
          if (!alive) return;
          setStatus(loc.status || 'active');
          setF({
            name: loc.name || '', government: loc.government || '', populationSize: loc.populationSize || '',
            populationDiversity: loc.populationDiversity || '', languages: loc.languages || '', resources: loc.resources || '',
            funFact: loc.funFact || '', description: loc.description || '', sensoryDetail: loc.sensoryDetail || '',
            hiddenDetail: loc.hiddenDetail || '', onTheHorizon: loc.onTheHorizon || '', linkedSessions: loc.linkedSessions || [],
          });
          setDistricts((loc.districts || []).map(d => ({ name: d.name || '', readAloud: d.readAloud || '', pois: (d.pointsOfInterest || []).map(p => ({ name: p.name || '', description: p.description || '' })) })));
          setInitialTags(loc.tags || []);
          document.title = `Edit ${loc.name} — D&D Session Master`;
        } catch { toast('Could not load Location for editing.', 'error'); }
      }
    })();
    return () => { alive = false; };
  }, [id, isEdit]);

  async function save(statusOverride) {
    if (!f.name.trim()) { toast('Name is required.', 'error'); return; }
    const body = {
      status: statusOverride || (status === 'draft' ? 'draft' : undefined),
      name: f.name.trim(), government: f.government.trim(), populationSize: f.populationSize.trim(),
      populationDiversity: f.populationDiversity.trim(), languages: f.languages.trim(), resources: f.resources.trim(),
      funFact: f.funFact.trim(), description: f.description.trim(), sensoryDetail: f.sensoryDetail.trim(),
      hiddenDetail: f.hiddenDetail.trim(), onTheHorizon: f.onTheHorizon.trim(), linkedSessions: f.linkedSessions,
      districts: districts.map(d => ({
        name: d.name.trim(), readAloud: d.readAloud.trim(),
        pointsOfInterest: d.pois.map(p => ({ name: p.name.trim(), description: p.description.trim() })).filter(p => p.name || p.description),
      })),
      tags: tagRef.current ? tagRef.current.getTags() : [],
    };
    setSaving(true);
    try {
      const res = await fetch(isEdit ? `/api/locations/${id}` : '/api/locations', {
        method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      const saved = await res.json();
      navigate(`/location/view/${saved.id}`);
    } catch (err) { toast('Save failed: ' + err.message, 'error'); setSaving(false); }
  }

  const draftLabel = (isEdit && status === 'draft') ? 'Save Draft' : 'Save Location';
  const showDraftBtn = !isEdit || status === 'draft';
  const actions = (
    <>
      {showDraftBtn && <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => save('draft')}>Save as Draft</button>}
      <button type="button" className="btn btn-submit" disabled={saving} onClick={() => save()}>{saving ? 'Saving…' : draftLabel}</button>
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/locations')}>Cancel</button>
    </>
  );

  return (
    <FormShell
      backHref={isEdit ? `/location/view/${id}` : '/locations'} backLabel={isEdit ? '← Back to Location' : '← All Locations'} backNative
      title={isEdit ? 'Edit Location' : 'New Location'}
      subtitle={isEdit ? "Update this place's details." : 'Build a place your players will remember.'}
      sections={SECTIONS} actions={actions}
    >
      <Section num="01" title="General" note="optional" id="s-general">
        <Field label="Government" htmlFor="loc-government"><input id="loc-government" type="text" placeholder="A council of merchant houses…" value={f.government} onChange={e => set('government', e.target.value)} /></Field>
        <Field label="Population Size" htmlFor="loc-pop"><input id="loc-pop" type="text" placeholder="Roughly 12,000" value={f.populationSize} onChange={e => set('populationSize', e.target.value)} /></Field>
        <Field label="Population Diversity" htmlFor="loc-div"><input id="loc-div" type="text" placeholder="Mostly human, with dwarf and halfling communities…" value={f.populationDiversity} onChange={e => set('populationDiversity', e.target.value)} /></Field>
        <Field label="Languages" htmlFor="loc-lang"><input id="loc-lang" type="text" placeholder="Common, Dwarvish, a river-trade pidgin" value={f.languages} onChange={e => set('languages', e.target.value)} /></Field>
        <Field label="Resources" full><AutoTextArea className="short" placeholder="River trade, salted fish, quarried stone…" value={f.resources} onChange={e => set('resources', e.target.value)} /></Field>
        <Field label="Fun Fact" full><AutoTextArea className="short" placeholder="Every bell tower rings slightly out of tune…" value={f.funFact} onChange={e => set('funFact', e.target.value)} /></Field>
      </Section>

      <div className="section-header" id="s-details"><span className="section-num">02</span><h2>Location Details</h2></div>
      <div className="card">
        <div className="form-grid">
          <Field label="Name *" full htmlFor="loc-name"><input id="loc-name" type="text" placeholder="The City of Ashford" value={f.name} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="Brief Description" full><AutoTextArea className="short" placeholder="A sprawling river city built atop three hills…" value={f.description} onChange={e => set('description', e.target.value)} /></Field>
          <Field label="Sensory Detail" hint="One specific impression when players first arrive." full><AutoTextArea className="short" placeholder="The river bells toll in a slow, tuneless rhythm…" value={f.sensoryDetail} onChange={e => set('sensoryDetail', e.target.value)} /></Field>
          <Field label="Hidden Detail or Secret" full><AutoTextArea className="short" placeholder="The canal network was built atop a buried temple…" value={f.hiddenDetail} onChange={e => set('hiddenDetail', e.target.value)} /></Field>
        </div>
        <Districts districts={districts} setDistricts={setDistricts} />
      </div>

      <Section num="03" title="On the Horizon" note="optional" id="s-horizon">
        <Field label="Idea for an Encounter" hint="A seed for something that could happen here later — a rumor, a threat, a change brewing." full>
          <AutoTextArea className="short" placeholder="The grave stirs. Something the locals buried generations ago is starting to wake." value={f.onTheHorizon} onChange={e => set('onTheHorizon', e.target.value)} />
        </Field>
      </Section>

      <Section num="04" title="Tags & Links" note="optional" id="s-links">
        <Field label="Tags" hint="Press Enter or comma to add. Click a tag to remove." full><TagField initialTags={initialTags} tagRef={tagRef} /></Field>
        <Field label="Sessions" hint="Check any sessions this location appears in." full>
          <LinkedRecordPicker options={sessionOpts} selected={f.linkedSessions} onChange={v => set('linkedSessions', v)} emptyText="No sessions yet." />
        </Field>
      </Section>
    </FormShell>
  );
}
