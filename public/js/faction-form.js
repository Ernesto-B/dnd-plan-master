const MAX_CLOCKS = 3;
const MAX_CLOCK_STEPS = 8;

let editFactionId = null;
let tagInputInstance = null;
let currentFactionStatus = 'active';
let existingLinkedRecords = {
  linkedSessions: [],
  linkedEncounters: [],
  linkedNpcs: [],
  linkedLocations: [],
};

(async function () {
  const isEdit = location.pathname.includes('/edit/');
  const pathId = location.pathname.split('/').pop();
  editFactionId = isEdit ? pathId : null;

  if (isEdit) {
    document.getElementById('page-title').textContent = 'Edit Faction';
    document.querySelector('.page-subtitle').textContent = 'Update this faction’s agenda, clocks, and connected records.';
    const backLink = document.getElementById('form-back-link');
    if (backLink) {
      backLink.href = `/faction/view/${pathId}`;
      backLink.textContent = '← Back to Faction';
    }
    document.getElementById('btn-save-draft')?.classList.add('hidden');
  }

  tagInputInstance = new TagInput(document.getElementById('faction-tag-input-container'), []);

  const clockList = document.getElementById('faction-clock-list');
  const addClockBtn = document.getElementById('btn-add-clock');
  addClockBtn.addEventListener('click', () => addClock(clockList, addClockBtn));

  if (isEdit) {
    try {
      const res = await fetch(`/api/factions/${pathId}`);
      if (!res.ok) throw new Error('Not found');
      const faction = await res.json();
      currentFactionStatus = faction.status || 'active';
      if (currentFactionStatus === 'draft') {
        const saveBtn = document.getElementById('btn-save');
        const draftBtn = document.getElementById('btn-save-draft');
        if (draftBtn) draftBtn.classList.remove('hidden');
        if (saveBtn) saveBtn.textContent = 'Save Draft';
        if (draftBtn) draftBtn.textContent = 'Save Draft';
      }
      populate(faction);
      if (window.autoResizeAll) window.autoResizeAll();
    } catch {
      showToast('Could not load faction for editing.', 'error');
    }
  }

  document.getElementById('btn-save').addEventListener('click', () => save());
  document.getElementById('btn-save-draft').addEventListener('click', () => save('draft'));
  document.getElementById('faction-form').addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') event.preventDefault();
  });
})();

function addClock(container, addBtn, clock = {}) {
  if (container.querySelectorAll('.faction-clock-card').length >= MAX_CLOCKS) return;
  const index = container.querySelectorAll('.faction-clock-card').length + 1;
  const steps = clampSteps(clock.steps || (Array.isArray(clock.stepDescriptions) ? clock.stepDescriptions.length : 4));

  const card = document.createElement('div');
  card.className = 'faction-clock-card';
  card.innerHTML = `
    <div class="district-sub-header">
      <span class="district-sub-title">Clock ${index}</span>
      <button type="button" class="btn btn-danger remove-btn" style="font-size:11px;padding:3px 8px;">Remove</button>
    </div>
    <div class="form-grid">
      <div class="field">
        <label>Clock Name</label>
        <input type="text" class="faction-clock-name" placeholder="Tollgate Takeover" value="${h(clock.name)}">
      </div>
      <div class="field">
        <label>Steps</label>
        <select class="faction-clock-steps-count">
          ${Array.from({ length: MAX_CLOCK_STEPS }, (_, i) => {
            const value = i + 1;
            return `<option value="${value}" ${value === steps ? 'selected' : ''}>${value}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="field full">
        <label>What advances this clock?</label>
        <textarea class="faction-clock-advance short" placeholder="Merchants pay protection quietly, city inspectors vanish, or the party looks the other way.">${h(clock.advanceTrigger)}</textarea>
      </div>
      <div class="field full">
        <label>What pushes this clock back?</label>
        <textarea class="faction-clock-setback short" placeholder="A public scandal, a rival faction exposing the scheme, or the party breaking the toll network.">${h(clock.setbackTrigger)}</textarea>
      </div>
    </div>
    <div class="faction-clock-steps-wrap">
      <div class="district-container-label">Step Changes <span style="font-weight:400;color:var(--muted)">(one short paragraph per step)</span></div>
      <div class="faction-clock-steps-list"></div>
    </div>
  `;

  card.querySelector('.remove-btn').addEventListener('click', () => {
    card.remove();
    renumberClocks(container);
    if (container.querySelectorAll('.faction-clock-card').length < MAX_CLOCKS) addBtn.style.display = '';
  });

  const stepsSelect = card.querySelector('.faction-clock-steps-count');
  const stepValues = Array.isArray(clock.stepDescriptions) ? clock.stepDescriptions : [];
  renderClockSteps(card, steps, stepValues);
  stepsSelect.addEventListener('change', () => {
    renderClockSteps(card, clampSteps(stepsSelect.value), collectCurrentClockSteps(card));
  });

  container.appendChild(card);
  if (container.querySelectorAll('.faction-clock-card').length >= MAX_CLOCKS) addBtn.style.display = 'none';
}

function renderClockSteps(card, count, values = []) {
  const list = card.querySelector('.faction-clock-steps-list');
  if (!list) return;
  list.innerHTML = Array.from({ length: count }, (_, index) => `
    <div class="faction-step-card">
      <div class="faction-step-head">Step ${index + 1}</div>
      <textarea class="faction-clock-step short" data-step-index="${index}" placeholder="What changes in the faction once this step is reached?">${h(values[index] || '')}</textarea>
    </div>
  `).join('');
}

function collectCurrentClockSteps(card) {
  return Array.from(card.querySelectorAll('.faction-clock-step')).map(input => input.value.trim());
}

function renumberClocks(container) {
  container.querySelectorAll('.faction-clock-card').forEach((card, index) => {
    const title = card.querySelector('.district-sub-title');
    if (title) title.textContent = `Clock ${index + 1}`;
  });
}

function collectClocks() {
  return Array.from(document.querySelectorAll('#faction-clock-list .faction-clock-card')).map(card => ({
    name: card.querySelector('.faction-clock-name')?.value.trim() || '',
    steps: clampSteps(card.querySelector('.faction-clock-steps-count')?.value),
    advanceTrigger: card.querySelector('.faction-clock-advance')?.value.trim() || '',
    setbackTrigger: card.querySelector('.faction-clock-setback')?.value.trim() || '',
    stepDescriptions: Array.from(card.querySelectorAll('.faction-clock-step')).map(input => input.value.trim()),
  })).filter(clock => clock.name || clock.advanceTrigger || clock.setbackTrigger || clock.stepDescriptions.some(Boolean));
}

function clampSteps(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.max(1, Math.min(MAX_CLOCK_STEPS, parsed));
}

function populate(faction) {
  setVal('faction-name', faction.name || '');
  setVal('faction-origin', faction.origin || '');
  setVal('faction-goal', faction.goal || '');
  setVal('faction-size', faction.size ?? '');
  setVal('faction-reputation', faction.partyReputation ?? 0);
  existingLinkedRecords = {
    linkedSessions: [...(faction.linkedSessions || [])],
    linkedEncounters: [...(faction.linkedEncounters || [])],
    linkedNpcs: [...(faction.linkedNpcs || [])],
    linkedLocations: [...(faction.linkedLocations || [])],
  };

  if (faction.tags && tagInputInstance) {
    tagInputInstance.setTags(faction.tags);
  }

  const clockList = document.getElementById('faction-clock-list');
  const addClockBtn = document.getElementById('btn-add-clock');
  (faction.factionClocks || []).forEach(clock => addClock(clockList, addClockBtn, clock));
}

async function save(statusOverride) {
  const name = document.getElementById('faction-name').value.trim();
  if (!name) {
    document.getElementById('faction-name').focus();
    showToast('Name is required.', 'error');
    return;
  }

  const body = {
    status: statusOverride || (currentFactionStatus === 'draft' ? 'draft' : undefined),
    name,
    origin: document.getElementById('faction-origin').value.trim(),
    goal: document.getElementById('faction-goal').value.trim(),
    size: document.getElementById('faction-size').value.trim(),
    partyReputation: Number.parseInt(document.getElementById('faction-reputation').value, 10) || 0,
    factionClocks: collectClocks(),
    linkedSessions: [...(existingLinkedRecords.linkedSessions || [])],
    linkedEncounters: [...(existingLinkedRecords.linkedEncounters || [])],
    linkedNpcs: [...(existingLinkedRecords.linkedNpcs || [])],
    linkedLocations: [...(existingLinkedRecords.linkedLocations || [])],
    tags: tagInputInstance ? tagInputInstance.getTags() : [],
  };

  const isDraftSave = statusOverride === 'draft';
  const btn = document.getElementById(isDraftSave ? 'btn-save-draft' : 'btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const url = editFactionId ? `/api/factions/${editFactionId}` : '/api/factions';
    const method = editFactionId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const saved = await res.json();
    location.href = `/faction/view/${saved.id}`;
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = isDraftSave || currentFactionStatus === 'draft' ? 'Save Draft' : 'Save Faction';
  }
}

function setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function h(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
