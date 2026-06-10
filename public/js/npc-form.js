const SKILL_KEYS = ['perception','insight','medicine','investigation','arcana','history','religion','nature','persuasion','deception','intimidation'];

let editNpcId = null;
let tagInputInstance = null;
let currentNpcStatus = 'active';

(async function () {
  const isEdit  = location.pathname.includes('/edit/');
  const pathId  = location.pathname.split('/').pop();
  editNpcId     = isEdit ? pathId : null;

  if (isEdit) {
    document.getElementById('page-title').textContent = 'Edit NPC';
    document.querySelector('.page-subtitle').textContent = 'Update this character\'s profile.';
    const backLink = document.getElementById('form-back-link');
    if (backLink) { backLink.href = `/npc/view/${pathId}`; backLink.textContent = '← Back to NPC'; }
    document.getElementById('btn-save-draft')?.classList.add('hidden');
  }

  // Tag input
  const tagWrap = document.getElementById('npc-tag-input-container');
  tagInputInstance = new TagInput(tagWrap, []);

  // Load sessions and encounters for link dropdowns
  await Promise.all([loadSessionOptions(), loadEncounterOptions()]);

  // Populate form if editing
  if (isEdit) {
    try {
      const res = await fetch(`/api/npcs/${pathId}`);
      if (!res.ok) throw new Error('Not found');
      const npc = await res.json();
      currentNpcStatus = npc.status || 'active';
      if (currentNpcStatus === 'draft') {
        const saveBtn = document.getElementById('btn-save');
        const draftBtn = document.getElementById('btn-save-draft');
        if (draftBtn) draftBtn.classList.remove('hidden');
        if (saveBtn) saveBtn.textContent = 'Save Draft';
        if (draftBtn) draftBtn.textContent = 'Save Draft';
      }
      populate(npc);
      if (window.autoResizeAll) window.autoResizeAll();
    } catch {
      showToast('Could not load NPC for editing.', 'error');
    }
  }

  document.getElementById('btn-save').addEventListener('click', () => save());
  document.getElementById('btn-save-draft').addEventListener('click', () => save('draft'));
  document.getElementById('npc-form').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
  });
})();

async function loadSessionOptions() {
  const sel = document.getElementById('npc-sessions');
  try {
    const res = await fetch('/api/sessions');
    const sessions = await res.json();
    sel.innerHTML = sessions.length
      ? sessions.map(s => {
          const num = String(s.sessionNumber || '?').includes('.')
            ? s.sessionNumber
            : String(s.sessionNumber || '?').padStart(3, '0');
          const label = `#${num}${s.date ? ' — ' + s.date : ''}${s.goal ? ': ' + s.goal.slice(0, 40) : ''}`;
          return `<option value="${esc(s.id)}">${esc(label)}</option>`;
        }).join('')
      : '<option value="" disabled>No sessions yet</option>';
  } catch {
    sel.innerHTML = '<option value="" disabled>Could not load sessions</option>';
  }
}

async function loadEncounterOptions() {
  const sel = document.getElementById('npc-encounters');
  try {
    const res = await fetch('/api/encounters');
    const encounters = await res.json();
    sel.innerHTML = encounters.length
      ? encounters.map(e =>
          `<option value="${esc(e.id)}">${esc(e.name || e.id)}</option>`
        ).join('')
      : '<option value="" disabled>No encounter plans yet</option>';
  } catch {
    sel.innerHTML = '<option value="" disabled>Could not load encounters</option>';
  }
}

function populate(npc) {
  setVal('npc-name',       npc.name);
  setVal('npc-nickname',   npc.nickname || '');
  setVal('npc-phrase',     npc.commonPhrase || '');
  setVal('npc-appearance', npc.appearance || '');
  setVal('npc-situation',  npc.situation || '');
  setVal('npc-wants',      npc.wantsNeeds || '');
  setVal('npc-secret',     npc.secretObstacle || '');
  setVal('npc-carrying',   (npc.carrying || []).join('\n'));

  const skills = npc.skillDescriptions || {};
  SKILL_KEYS.forEach(k => {
    const el = document.getElementById(`npc-skill-${k}`);
    if (el) el.value = skills[k] || '';
  });

  if (npc.tags && tagInputInstance) {
    tagInputInstance.setTags(npc.tags);
  }

  // Select linked sessions
  const sessionSel = document.getElementById('npc-sessions');
  (npc.linkedSessions || []).forEach(id => {
    const opt = sessionSel.querySelector(`option[value="${id}"]`);
    if (opt) opt.selected = true;
  });

  // Select linked encounters
  const encSel = document.getElementById('npc-encounters');
  (npc.linkedEncounters || []).forEach(id => {
    const opt = encSel.querySelector(`option[value="${id}"]`);
    if (opt) opt.selected = true;
  });
}

async function save(statusOverride) {
  const name = document.getElementById('npc-name').value.trim();
  if (!name) {
    document.getElementById('npc-name').focus();
    showToast('Name is required.', 'error');
    return;
  }

  const skillDescriptions = {};
  SKILL_KEYS.forEach(k => {
    const el = document.getElementById(`npc-skill-${k}`);
    if (el && el.value.trim()) skillDescriptions[k] = el.value.trim();
  });

  const sessionSel  = document.getElementById('npc-sessions');
  const encSel      = document.getElementById('npc-encounters');
  const linkedSessions   = [...sessionSel.selectedOptions].map(o => o.value).filter(Boolean);
  const linkedEncounters = [...encSel.selectedOptions].map(o => o.value).filter(Boolean);

  const body = {
    status: statusOverride || (currentNpcStatus === 'draft' ? 'draft' : undefined),
    name,
    nickname:         document.getElementById('npc-nickname').value.trim(),
    commonPhrase:     document.getElementById('npc-phrase').value.trim(),
    appearance:       document.getElementById('npc-appearance').value.trim(),
    skillDescriptions,
    situation:        document.getElementById('npc-situation').value.trim(),
    wantsNeeds:       document.getElementById('npc-wants').value.trim(),
    secretObstacle:   document.getElementById('npc-secret').value.trim(),
    carrying:         document.getElementById('npc-carrying').value.trim(),
    linkedSessions,
    linkedEncounters,
    tags: tagInputInstance ? tagInputInstance.getTags() : [],
  };

  const isDraftSave = statusOverride === 'draft';
  const btn = document.getElementById(isDraftSave ? 'btn-save-draft' : 'btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const url    = editNpcId ? `/api/npcs/${editNpcId}` : '/api/npcs';
    const method = editNpcId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const saved = await res.json();
    location.href = `/npc/view/${saved.id}`;
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = isDraftSave || currentNpcStatus === 'draft' ? 'Save Draft' : 'Save NPC';
  }
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 5000);
}
