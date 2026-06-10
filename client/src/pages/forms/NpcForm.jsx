import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import FormShell from '../../components/form/FormShell.jsx';
import { Section, Field, AutoTextArea, TagField } from '../../components/form/FormKit.jsx';
import LinkedRecordPicker from '../../components/form/LinkedRecordPicker.jsx';
import { toast } from '../../lib/vanilla.js';

const SKILL = {
  perception: ['For the Perceptive', 'Perception'], insight: ['For the Insightful', 'Insight'],
  medicine: ['For the Healer', 'Medicine'], investigation: ['For the Investigator', 'Investigation'],
  arcana: ['For the Arcanist', 'Arcana'], history: ['For the Historian', 'History'],
  religion: ['For the Faithful', 'Religion'], nature: ['For the Naturalist', 'Nature'],
  persuasion: ['Under Persuasion', 'Persuasion'], deception: ['Detecting Deception', 'Deception'],
  intimidation: ['Under Intimidation', 'Intimidation'],
};
const COL1 = [['Wisdom', ['perception', 'insight', 'medicine']], ['Intelligence', ['investigation', 'arcana', 'history', 'religion', 'nature']]];
const COL2 = [['Charisma', ['persuasion', 'deception', 'intimidation']]];
const SECTIONS = [
  { id: 's-identity', num: '01', label: 'Identity' },
  { id: 's-voice', num: '02', label: 'Voice & Appearance' },
  { id: 's-skills', num: '03', label: 'Skill Triggers' },
  { id: 's-core', num: '04', label: 'Character Core' },
  { id: 's-carrying', num: '05', label: 'Carrying' },
  { id: 's-links', num: '06', label: 'Linked Plans' },
];

const blankSkills = () => Object.fromEntries(Object.keys(SKILL).map(k => [k, '']));

export default function NpcForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;
  const tagRef = useRef(null);

  const [f, setF] = useState({
    name: '', nickname: '', commonPhrase: '', appearance: '',
    situation: '', wantsNeeds: '', secretObstacle: '', carrying: '',
    skills: blankSkills(), linkedSessions: [], linkedEncounters: [],
  });
  const [initialTags, setInitialTags] = useState([]);
  const [status, setStatus] = useState('active');
  const [sessionOpts, setSessionOpts] = useState([]);
  const [encounterOpts, setEncounterOpts] = useState([]);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const setSkill = (k, v) => setF(prev => ({ ...prev, skills: { ...prev.skills, [k]: v } }));

  useEffect(() => {
    let alive = true;
    (async () => {
      const [sessions, encounters] = await Promise.all([
        fetch('/api/sessions').then(r => r.ok ? r.json() : []).catch(() => []),
        fetch('/api/encounters').then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      if (!alive) return;
      setSessionOpts(sessions.map(s => {
        const n = String(s.sessionNumber || '?').includes('.') ? s.sessionNumber : String(s.sessionNumber || '?').padStart(3, '0');
        return { value: s.id, label: `#${n}${s.date ? ' — ' + s.date : ''}${s.goal ? ': ' + s.goal.slice(0, 40) : ''}` };
      }));
      setEncounterOpts(encounters.map(e => ({ value: e.id, label: e.name || e.id })));

      if (isEdit) {
        try {
          const res = await fetch(`/api/npcs/${id}`);
          if (!res.ok) throw new Error();
          const npc = await res.json();
          if (!alive) return;
          setStatus(npc.status || 'active');
          setF({
            name: npc.name || '', nickname: npc.nickname || '', commonPhrase: npc.commonPhrase || '',
            appearance: npc.appearance || '', situation: npc.situation || '', wantsNeeds: npc.wantsNeeds || '',
            secretObstacle: npc.secretObstacle || '', carrying: (npc.carrying || []).join('\n'),
            skills: { ...blankSkills(), ...(npc.skillDescriptions || {}) },
            linkedSessions: npc.linkedSessions || [], linkedEncounters: npc.linkedEncounters || [],
          });
          setInitialTags(npc.tags || []);
          document.title = `Edit ${npc.name} — D&D Session Master`;
        } catch { toast('Could not load NPC for editing.', 'error'); }
      }
    })();
    return () => { alive = false; };
  }, [id, isEdit]);

  async function save(statusOverride) {
    if (!f.name.trim()) { toast('Name is required.', 'error'); return; }
    const skillDescriptions = {};
    Object.entries(f.skills).forEach(([k, v]) => { if (v.trim()) skillDescriptions[k] = v.trim(); });
    const body = {
      status: statusOverride || (status === 'draft' ? 'draft' : undefined),
      name: f.name.trim(), nickname: f.nickname.trim(), commonPhrase: f.commonPhrase.trim(),
      appearance: f.appearance.trim(), skillDescriptions, situation: f.situation.trim(),
      wantsNeeds: f.wantsNeeds.trim(), secretObstacle: f.secretObstacle.trim(), carrying: f.carrying.trim(),
      linkedSessions: f.linkedSessions, linkedEncounters: f.linkedEncounters,
      tags: tagRef.current ? tagRef.current.getTags() : [],
    };
    setSaving(true);
    try {
      const res = await fetch(isEdit ? `/api/npcs/${id}` : '/api/npcs', {
        method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      const saved = await res.json();
      navigate(`/npc/view/${saved.id}`);
    } catch (err) { toast('Save failed: ' + err.message, 'error'); setSaving(false); }
  }

  const draftLabel = (isEdit && status === 'draft') ? 'Save Draft' : 'Save NPC';
  const showDraftBtn = !isEdit || status === 'draft';
  const actions = (
    <>
      {showDraftBtn && <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => save('draft')}>Save as Draft</button>}
      <button type="button" className="btn btn-submit" disabled={saving} onClick={() => save()}>{saving ? 'Saving…' : draftLabel}</button>
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/npcs')}>Cancel</button>
    </>
  );

  return (
    <FormShell
      backHref={isEdit ? `/npc/view/${id}` : '/npcs'} backLabel={isEdit ? '← Back to NPC' : '← All NPCs'} backNative
      title={isEdit ? 'Edit NPC' : 'New NPC'}
      subtitle={isEdit ? "Update this character's profile." : 'Build a character your players will remember.'}
      sections={SECTIONS} actions={actions}
    >
      <Section num="01" title="Identity" id="s-identity">
        <Field label="Name *" htmlFor="npc-name"><input id="npc-name" type="text" placeholder="Barrin Soot" value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Nickname / Alias" hintInline="optional" htmlFor="npc-nickname"><input id="npc-nickname" type="text" placeholder="The Sweep" value={f.nickname} onChange={e => set('nickname', e.target.value)} /></Field>
        <Field label="Tags" hint="Press Enter or comma to add. Click a tag to remove." full>
          <TagField initialTags={initialTags} tagRef={tagRef} />
        </Field>
      </Section>

      <Section num="02" title="Voice & Appearance" id="s-voice">
        <Field label="Common Phrase" hint="A signature line that captures their voice. Read it aloud when they speak." full htmlFor="npc-phrase">
          <input id="npc-phrase" type="text" placeholder='"Everyone passes through here eventually."' value={f.commonPhrase} onChange={e => set('commonPhrase', e.target.value)} />
        </Field>
        <Field label="Appearance" hintInline="verbatim" hint="Read this out loud when the players first see them. Write it as you'd say it at the table." full htmlFor="npc-appearance">
          <AutoTextArea className="medium" placeholder="A stocky, ash-stained dwarf in his middle years…" value={f.appearance} onChange={e => set('appearance', e.target.value)} />
        </Field>
      </Section>

      <div className="section-header" id="s-skills">
        <span className="section-num">03</span>
        <h2>Skill Triggers <span className="section-note" style={{ fontStyle: 'normal' }}>— DM eyes only</span></h2>
      </div>
      <div className="card">
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20, fontStyle: 'italic' }}>
          What does a character with high proficiency in each skill notice about this NPC? Leave blank if not applicable. Only the DM reads these.
        </p>
        <div className="npc-skills-grid">
          {[COL1, COL2].map((col, ci) => (
            <div className="npc-skill-group" key={ci}>
              {col.map(([group, keys]) => (
                <React.Fragment key={group}>
                  <div className="npc-skill-group-label" style={ci === 0 && group === 'Intelligence' ? { marginTop: 16 } : undefined}>{group}</div>
                  {keys.map(k => (
                    <div className="field" key={k}>
                      <label>{SKILL[k][0]} <span className="hint-inline">({SKILL[k][1]})</span></label>
                      <AutoTextArea className="short" placeholder="" value={f.skills[k]} onChange={e => setSkill(k, e.target.value)} />
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>

      <Section num="04" title="Character Core" id="s-core">
        <Field label="Situation" hint="Current circumstance relevant to the party. Brief context, not backstory." full htmlFor="npc-situation">
          <AutoTextArea className="short" placeholder="Runs the Ashen Hearth tavern in the lower docks…" value={f.situation} onChange={e => set('situation', e.target.value)} />
        </Field>
        <Field label="Wants & Needs" hintInline="super short" hint="Wants: surface desire. Needs: deeper truth." htmlFor="npc-wants">
          <AutoTextArea className="short" placeholder="Wants: to be left alone. Needs: someone to confide in." value={f.wantsNeeds} onChange={e => set('wantsNeeds', e.target.value)} />
        </Field>
        <Field label="Secret or Obstacle" hintInline="super short" hint="The one thing that complicates everything they do." htmlFor="npc-secret">
          <AutoTextArea className="short" placeholder="He owes two rival factions favors…" value={f.secretObstacle} onChange={e => set('secretObstacle', e.target.value)} />
        </Field>
      </Section>

      <Section num="05" title="Carrying" note="optional" id="s-carrying">
        <Field label="Items" hint="One item per line. These appear when the party searches or asks what they have." full htmlFor="npc-carrying">
          <AutoTextArea className="short" placeholder={'Ring of keys\nSmall folded note, blank\nCoin pouch (modest)'} value={f.carrying} onChange={e => set('carrying', e.target.value)} />
        </Field>
      </Section>

      <Section num="06" title="Linked Plans" note="optional" id="s-links">
        <Field label="Sessions" hint="Check any sessions this NPC appears in.">
          <LinkedRecordPicker options={sessionOpts} selected={f.linkedSessions} onChange={v => set('linkedSessions', v)} emptyText="No sessions yet." />
        </Field>
        <Field label="Encounter Plans" hint="Check any encounter plans this NPC belongs to.">
          <LinkedRecordPicker options={encounterOpts} selected={f.linkedEncounters} onChange={v => set('linkedEncounters', v)} emptyText="No encounter plans yet." />
        </Field>
      </Section>
    </FormShell>
  );
}
