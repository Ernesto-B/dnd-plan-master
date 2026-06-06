// ─── Constants ────────────────────────────────────────────────────────────────
const MAX        = { npc: 5, location: 3, clock: 3, encounter: 3 };
const MAX_DIST   = 5;
const MAX_POI    = 5;
const counts     = { npc: 0, location: 0, clock: 0, encounter: 0 };

// Stored when preview is shown; used when user clicks "Save Files"
let pendingFormData     = null;
let pendingPdfB64       = null;
let pendingMarkdown     = null;
let pendingFilename     = null;
let pendingPdfBlobUrl   = null;
let editSessionId       = null;
let autosaveEnabled     = true;
let draftSaveTimer      = null;

// ─── Generic card management ──────────────────────────────────────────────────
function addCard(type, listId, makeFn, btnId, data = {}) {
  if (counts[type] >= MAX[type]) return null;
  counts[type]++;
  const card = makeFn(counts[type], data);

  card.querySelector('.remove-btn').addEventListener('click', () => {
    card.remove();
    counts[type]--;
    renumberCards(listId, `${type}-card`, getLabelPrefix(type));
    document.getElementById(btnId).style.display = '';
  });

  document.getElementById(listId).appendChild(card);
  if (counts[type] >= MAX[type]) document.getElementById(btnId).style.display = 'none';
  return card;
}

function getLabelPrefix(type) {
  return { npc: 'NPC', location: 'Location', clock: 'Faction Clock', encounter: 'Encounter' }[type];
}

function renumberCards(listId, cardClass, prefix) {
  document.querySelectorAll(`#${listId} .${cardClass}`).forEach((c, i) => {
    const lbl = c.querySelector('.card-title');
    if (lbl) lbl.textContent = `${prefix} ${i + 1}`;
  });
}

// ─── NPC card ─────────────────────────────────────────────────────────────────
function makeNPCCard(n, d = {}) {
  const card = document.createElement('div');
  card.className = 'card npc-card';
  if (d._sourceId) card.dataset.sourceNpcId = d._sourceId;
  card.innerHTML = `
    <div class="card-header">
      <span class="card-title">NPC ${n}</span>
      <div class="card-header-actions">
        <button type="button" class="btn btn-danger remove-btn">Remove</button>
      </div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label>Name</label>
        <input type="text" class="npc-name" placeholder="Mira Ashveil" value="${h(d.name)}">
      </div>
      <div class="field">
        <label>Faction / Affiliation</label>
        <input type="text" class="npc-faction" placeholder="The Ember Syndicate" value="${h(d.faction)}">
      </div>
      <div class="field full">
        <label>Current Situation</label>
        <textarea class="npc-situation short" placeholder="Mira is playing both sides…">${h(d.situation)}</textarea>
      </div>
      <div class="field full">
        <label>What They Want Right Now</label>
        <span class="hint">In this specific conversation, not their long-term goal.</span>
        <textarea class="npc-wants short" placeholder="She wants the party to trust her enough to share what they found.">${h(d.wants)}</textarea>
      </div>
      <div class="field full">
        <label>Signature Phrases / Words</label>
        <span class="hint">2–3 phrases or verbal tics they use.</span>
        <textarea class="npc-phrases short" placeholder='"Between you and me…" / "That\'s not entirely wrong."'>${h(d.phrases)}</textarea>
      </div>
      <div class="field">
        <label>Physical Body Language Habit</label>
        <textarea class="npc-body-language short" placeholder="Always touches her left earring when she's lying.">${h(d.bodyLanguage)}</textarea>
      </div>
      <div class="field">
        <label>One Thing They Never Do</label>
        <textarea class="npc-never-does short" placeholder="Never raises her voice, even when threatened.">${h(d.neverDoes)}</textarea>
      </div>
      <div class="field full">
        <label>If Cornered — Scripted Line</label>
        <textarea class="npc-cornered short" placeholder='"You don\'t understand what they\'ll do to my sister…"'>${h(d.corneredLine)}</textarea>
      </div>
    </div>`;
  return card;
}

// ─── Location card (with nested districts) ────────────────────────────────────
function makeLocationCard(n, d = {}) {
  const card = document.createElement('div');
  card.className = 'card location-card';
  card.innerHTML = `
    <div class="card-header">
      <span class="card-title">Location ${n}</span>
      <div class="card-header-actions">
        <button type="button" class="btn btn-danger remove-btn">Remove</button>
      </div>
    </div>
    <div class="form-grid">
      <div class="field full">
        <label>Name</label>
        <input type="text" class="loc-name" placeholder="The City of Ashford" value="${h(d.name)}">
      </div>
      <div class="field full">
        <label>Brief Description</label>
        <textarea class="loc-description short" placeholder="A sprawling river city built atop three hills…">${h(d.description)}</textarea>
      </div>
      <div class="field full">
        <label>Sensory Detail</label>
        <span class="hint">One specific impression when players first arrive.</span>
        <textarea class="loc-sensory short" placeholder="The river bells toll in a slow, tuneless rhythm that echoes off the stone walls.">${h(d.sensoryDetail)}</textarea>
      </div>
      <div class="field full">
        <label>Hidden Detail or Secret</label>
        <textarea class="loc-hidden short" placeholder="The canal network was built on top of a buried temple complex.">${h(d.hiddenDetail)}</textarea>
      </div>
    </div>
    <div class="district-container">
      <div class="district-container-label">Districts <span style="font-weight:400;color:var(--muted)">(up to ${MAX_DIST})</span></div>
      <div class="district-list-inner"></div>
      <button type="button" class="btn btn-add-sm btn-add-district">+ Add District</button>
    </div>`;

  const districtListEl = card.querySelector('.district-list-inner');
  const addDistBtn     = card.querySelector('.btn-add-district');

  addDistBtn.addEventListener('click', () => addDistrict(card, districtListEl, addDistBtn));

  // Pre-fill districts if present
  (d.districts || []).forEach(districtData => {
    addDistrict(card, districtListEl, addDistBtn, districtData);
  });

  return card;
}

function addDistrict(locationCard, container, addBtn, d = {}) {
  if (container.querySelectorAll('.district-sub-card').length >= MAX_DIST) return;
  const n = container.querySelectorAll('.district-sub-card').length + 1;

  const sub = document.createElement('div');
  sub.className = 'district-sub-card';
  sub.innerHTML = `
    <div class="district-sub-header">
      <span class="district-sub-title">District ${n}</span>
      <button type="button" class="btn btn-danger remove-btn" style="font-size:11px;padding:3px 8px;">Remove</button>
    </div>
    <div class="form-grid">
      <div class="field full">
        <label>District Name</label>
        <input type="text" class="dist-name" placeholder="Market District" value="${h(d.name)}">
      </div>
      <div class="field full">
        <label>Read-Aloud Description</label>
        <span class="hint">What you read to the party when they enter this district.</span>
        <textarea class="dist-read-aloud short" placeholder="As you pass through the arched gate, the smell of fresh bread and cured leather fills the air…">${h(d.readAloud)}</textarea>
      </div>
    </div>
    <div class="poi-section">
      <div class="poi-container-label" style="margin-top:10px;">Points of Interest <span style="font-weight:400;color:var(--muted)">(up to ${MAX_POI})</span></div>
      <div class="poi-container"></div>
      <button type="button" class="btn btn-add-sm btn-add-poi">+ Add Point of Interest</button>
    </div>`;

  const poiContainer = sub.querySelector('.poi-container');
  const addPoiBtn    = sub.querySelector('.btn-add-poi');

  addPoiBtn.addEventListener('click', () => addPOI(sub, poiContainer, addPoiBtn));

  sub.querySelector('.remove-btn').addEventListener('click', () => {
    sub.remove();
    renumberDistricts(container);
    if (container.querySelectorAll('.district-sub-card').length < MAX_DIST) addBtn.style.display = '';
  });

  // Pre-fill POIs
  (d.pointsOfInterest || []).forEach(poiData => addPOI(sub, poiContainer, addPoiBtn, poiData));

  container.appendChild(sub);
  if (container.querySelectorAll('.district-sub-card').length >= MAX_DIST) addBtn.style.display = 'none';
}

function addPOI(districtCard, container, addBtn, d = {}) {
  if (container.querySelectorAll('.poi-row').length >= MAX_POI) return;
  const n = container.querySelectorAll('.poi-row').length + 1;

  const row = document.createElement('div');
  row.className = 'poi-row';
  row.innerHTML = `
    <span class="poi-num">${n}.</span>
    <input type="text" class="poi-name" placeholder="Fish Market" value="${h(d.name)}">
    <textarea class="poi-desc" placeholder="A bustling row of stalls selling fresh catch from the river…" style="min-height:44px;">${h(d.description)}</textarea>
    <button type="button" class="btn-remove-sm remove-poi-btn" title="Remove">×</button>`;

  row.querySelector('.remove-poi-btn').addEventListener('click', () => {
    row.remove();
    renumberPOIs(container);
    if (container.querySelectorAll('.poi-row').length < MAX_POI) addBtn.style.display = '';
  });

  container.appendChild(row);
  if (container.querySelectorAll('.poi-row').length >= MAX_POI) addBtn.style.display = 'none';
}

function renumberDistricts(container) {
  container.querySelectorAll('.district-sub-card').forEach((c, i) => {
    const lbl = c.querySelector('.district-sub-title');
    if (lbl) lbl.textContent = `District ${i + 1}`;
  });
}

function renumberPOIs(container) {
  container.querySelectorAll('.poi-row').forEach((r, i) => {
    const num = r.querySelector('.poi-num');
    if (num) num.textContent = `${i + 1}.`;
  });
}

// ─── Faction Clock card ───────────────────────────────────────────────────────
function makeClockCard(n, d = {}) {
  const card = document.createElement('div');
  card.className = 'card clock-card';
  card.innerHTML = `
    <div class="card-header">
      <span class="card-title">Faction Clock ${n}</span>
      <div class="card-header-actions">
        <button type="button" class="btn btn-danger remove-btn">Remove</button>
      </div>
    </div>
    <div class="form-grid">
      <div class="field full">
        <label>Faction Name</label>
        <input type="text" class="clock-faction" placeholder="The Ember Syndicate" value="${h(d.factionName)}">
      </div>
      <div class="field full">
        <label>Working Toward</label>
        <textarea class="clock-goal short" placeholder="Smuggling the Ashstone artifact out of the city before the guard realizes it's gone.">${h(d.goal)}</textarea>
      </div>
      <div class="field full">
        <label>Progress</label>
        <div class="clock-row">
          <input type="number" class="clock-progress" min="0" value="${h(d.progress) || 0}" placeholder="3">
          <span class="clock-sep">out of</span>
          <input type="number" class="clock-max" min="1" value="${h(d.max) || 8}" placeholder="8">
          <span class="clock-sep">steps</span>
        </div>
      </div>
      <div class="field full">
        <label>What Happens When the Clock Completes</label>
        <textarea class="clock-completion short" placeholder="The artifact leaves the city. The party loses access permanently and a new Syndicate-aligned faction rises to power.">${h(d.completion)}</textarea>
      </div>
    </div>`;
  return card;
}

// ─── Combat Encounter card ────────────────────────────────────────────────────
function makeEncounterCard(n, d = {}) {
  const card = document.createElement('div');
  card.className = 'card encounter-card';
  card.innerHTML = `
    <div class="card-header">
      <span class="card-title">Encounter ${n}</span>
      <button type="button" class="btn btn-danger remove-btn">Remove</button>
    </div>
    <div class="form-grid">
      <div class="field full">
        <label>Encounter Name</label>
        <input type="text" class="enc-name" placeholder="Ambush at the Warehouse" value="${h(d.name)}">
      </div>
      <div class="field full">
        <label>Session Summary</label>
        <span class="hint">Brief description for the session plan view. Full combat detail lives in the Encounter Plan.</span>
        <textarea class="enc-summary short" placeholder="Two guild enforcers tail the party and force a confrontation in the Dockside market. Harwick the Scar leads — grappler, does not surrender.">${h(d.summary)}</textarea>
      </div>
      <div class="field full">
        <label>Link to Encounter Plan</label>
        <span class="hint">Optional — attach a Combat Encounter Plan for full tactical detail.</span>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <select class="enc-plan-select" style="flex:1; min-width:200px;">
            <option value="">— No encounter plan linked —</option>
          </select>
          <a href="/encounter/new" target="_blank" class="btn btn-ghost" style="white-space:nowrap; font-size:12px;">+ New Plan</a>
        </div>
      </div>
    </div>`;

  // Async-populate encounter plan dropdown
  fetch('/api/encounters').then(r => r.json()).then(plans => {
    const sel = card.querySelector('.enc-plan-select');
    plans.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.id} — ${p.name}`;
      if (p.id === d.encounterPlanId) opt.selected = true;
      sel.appendChild(opt);
    });
  }).catch(() => {});

  return card;
}

// ─── HTML-escape helper for pre-fill values ───────────────────────────────────
function h(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nonEmpty(value) {
  return String(value == null ? '' : value).trim().length > 0;
}

function extractNPCCard(card) {
  return {
    name:         card.querySelector('.npc-name')?.value.trim() ?? '',
    faction:      card.querySelector('.npc-faction')?.value.trim() ?? '',
    situation:    card.querySelector('.npc-situation')?.value.trim() ?? '',
    wants:        card.querySelector('.npc-wants')?.value.trim() ?? '',
    phrases:      card.querySelector('.npc-phrases')?.value.trim() ?? '',
    bodyLanguage: card.querySelector('.npc-body-language')?.value.trim() ?? '',
    neverDoes:    card.querySelector('.npc-never-does')?.value.trim() ?? '',
    corneredLine: card.querySelector('.npc-cornered')?.value.trim() ?? '',
    _sourceId:    card.dataset.sourceNpcId || undefined,
  };
}

function extractLocationCard(card) {
  return {
    name:          card.querySelector('.loc-name')?.value.trim() ?? '',
    description:   card.querySelector('.loc-description')?.value.trim() ?? '',
    sensoryDetail: card.querySelector('.loc-sensory')?.value.trim() ?? '',
    hiddenDetail:  card.querySelector('.loc-hidden')?.value.trim() ?? '',
    districts:     collectDistricts(card),
  };
}

function extractClockCard(card) {
  return {
    factionName: card.querySelector('.clock-faction')?.value.trim() ?? '',
    goal:        card.querySelector('.clock-goal')?.value.trim() ?? '',
    progress:    card.querySelector('.clock-progress')?.value.trim() ?? '0',
    max:         card.querySelector('.clock-max')?.value.trim() ?? '8',
    completion:  card.querySelector('.clock-completion')?.value.trim() ?? '',
  };
}

// ─── Tag input ────────────────────────────────────────────────────────────────
const tagInput = new TagInput(document.getElementById('tag-input-container'));

// ─── Wire up Add buttons ──────────────────────────────────────────────────────
document.getElementById('btn-add-npc').addEventListener('click', () => openNpcPicker());

document.getElementById('btn-add-location').addEventListener('click', () =>
  addCard('location', 'location-list', makeLocationCard, 'btn-add-location'));

document.getElementById('btn-add-clock').addEventListener('click', () =>
  addCard('clock', 'clock-list', makeClockCard, 'btn-add-clock'));

document.getElementById('btn-add-encounter').addEventListener('click', () =>
  addCard('encounter', 'encounter-list', makeEncounterCard, 'btn-add-encounter'));

// ─── Collect form data ────────────────────────────────────────────────────────
function v(id) { return (document.getElementById(id)?.value ?? '').trim(); }

function collectFormData() {
  return {
    id:                 editSessionId || undefined,
    sessionNumber:      v('sessionNumber'),
    date:               v('date'),
    partyLevel:         v('partyLevel'),
    sessionGoal:        v('sessionGoal'),
    endState:           v('endState'),
    openingReadAloud:   v('openingReadAloud'),
    threeOptionsPrompt: v('threeOptionsPrompt'),
    beatOpen:           v('beatOpen'),
    beatMiddle:         v('beatMiddle'),
    beatEscalate:       v('beatEscalate'),
    beatClose:          v('beatClose'),
    sessionRecap:       v('sessionRecap'),
    worldStateChanges:  v('worldStateChanges'),
    unresolvedThreads:  v('unresolvedThreads'),
    npcStatusChanges:   v('npcStatusChanges'),
    treasureRewardsLog: v('treasureRewardsLog'),
    sessionNotes:       v('sessionNotes'),
    tags:               tagInput.getTags(),
    linkedNpcs:         Array.from(document.querySelectorAll('.npc-card[data-source-npc-id]')).map(c => c.dataset.sourceNpcId).filter(Boolean),
    npcs:               collectNPCs(),
    locations:          collectLocations(),
    factionClocks:      collectClocks(),
    encounters:         collectEncounters(),
  };
}

function collectNPCs() {
  return Array.from(document.querySelectorAll('.npc-card')).map(extractNPCCard);
}

function collectLocations() {
  return Array.from(document.querySelectorAll('.location-card')).map(extractLocationCard);
}

function collectDistricts(locationCard) {
  return Array.from(locationCard.querySelectorAll('.district-sub-card')).map(d => ({
    name:      d.querySelector('.dist-name')?.value.trim()       ?? '',
    readAloud: d.querySelector('.dist-read-aloud')?.value.trim() ?? '',
    pointsOfInterest: collectPOIs(d),
  }));
}

function collectPOIs(districtCard) {
  return Array.from(districtCard.querySelectorAll('.poi-row')).map(r => ({
    name:        r.querySelector('.poi-name')?.value.trim() ?? '',
    description: r.querySelector('.poi-desc')?.value.trim() ?? '',
  })).filter(p => p.name || p.description);
}

function collectClocks() {
  return Array.from(document.querySelectorAll('.clock-card')).map(extractClockCard);
}

function collectEncounters() {
  return Array.from(document.querySelectorAll('.encounter-card')).map(c => ({
    name:           c.querySelector('.enc-name')?.value.trim()        ?? '',
    summary:        c.querySelector('.enc-summary')?.value.trim()     ?? '',
    encounterPlanId: c.querySelector('.enc-plan-select')?.value || null,
  }));
}

function getDraftKey() {
  return editSessionId ? `dnd-draft-session:${editSessionId}` : 'dnd-draft-session:new';
}

function clearDraft(key = getDraftKey()) {
  localStorage.removeItem(key);
}

function scheduleDraftSave() {
  if (!autosaveEnabled) return;
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(saveDraftNow, 700);
}

function saveDraftNow() {
  if (!autosaveEnabled) return;
  try {
    localStorage.setItem(getDraftKey(), JSON.stringify({
      updatedAt: new Date().toISOString(),
      data: collectFormData(),
    }));
  } catch {}
}

function resetDynamicSections() {
  counts.npc = 0;
  counts.location = 0;
  counts.clock = 0;
  counts.encounter = 0;
  document.getElementById('npc-list').innerHTML = '';
  document.getElementById('location-list').innerHTML = '';
  document.getElementById('clock-list').innerHTML = '';
  document.getElementById('encounter-list').innerHTML = '';
  ['btn-add-npc', 'btn-add-location', 'btn-add-clock', 'btn-add-encounter'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.style.display = '';
  });
}

// ─── Edit mode — pre-fill from existing session ───────────────────────────────
async function initEditMode() {
  const editId = new URLSearchParams(location.search).get('edit');
  if (!editId) return;

  document.getElementById('page-title').textContent = `Edit Session ${editId}`;
  document.getElementById('page-subtitle').textContent = 'Make your changes, then preview and save.';
  document.getElementById('btn-submit').textContent = 'Preview Changes';
  const backLink = document.getElementById('form-back-link');
  if (backLink) { backLink.href = `/view/${editId}`; backLink.textContent = '← Back to Session'; }

  let session;
  try {
    const res = await fetch(`/api/sessions/${editId}`);
    if (!res.ok) throw new Error('Not found');
    session = await res.json();
  } catch {
    showToast('Could not load session for editing.', 'error');
    return;
  }

  editSessionId = editId;
  populateForm(session.data || {});
  if (window.autoResizeAll) window.autoResizeAll();
}

function populateForm(data) {
  resetDynamicSections();
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  };

  set('sessionNumber', data.sessionNumber);
  set('date',          data.date);
  set('partyLevel',    data.partyLevel);
  set('sessionGoal',   data.sessionGoal);
  set('endState',      data.endState);
  set('openingReadAloud',   data.openingReadAloud);
  set('threeOptionsPrompt', data.threeOptionsPrompt);
  set('beatOpen',      data.beatOpen);
  set('beatMiddle',    data.beatMiddle);
  set('beatEscalate',  data.beatEscalate);
  set('beatClose',     data.beatClose);
  set('sessionRecap',  data.sessionRecap);
  set('worldStateChanges', data.worldStateChanges);
  set('unresolvedThreads', data.unresolvedThreads);
  set('npcStatusChanges', data.npcStatusChanges);
  set('treasureRewardsLog', data.treasureRewardsLog);
  set('sessionNotes',  data.sessionNotes);
  if (data.tags) tagInput.setTags(data.tags);

  // NPCs: _sourceId is stored inside each NPC's data and gets restored automatically via makeNPCCard
  (data.npcs || []).forEach(d => addCard('npc', 'npc-list', makeNPCCard, 'btn-add-npc', d));
  (data.locations || []).forEach(d => addCard('location', 'location-list', makeLocationCard, 'btn-add-location', d));
  (data.factionClocks || []).forEach(d => addCard('clock', 'clock-list', makeClockCard, 'btn-add-clock', d));
  (data.encounters || []).forEach(d => addCard('encounter', 'encounter-list', makeEncounterCard, 'btn-add-encounter', d));
}

async function restoreDraftIfAvailable() {
  const raw = localStorage.getItem(getDraftKey());
  if (!raw) return;

  let draft;
  try {
    draft = JSON.parse(raw);
  } catch {
    clearDraft();
    return;
  }

  const label = draft.updatedAt ? new Date(draft.updatedAt).toLocaleString() : 'a previous session';
  const ok = await showConfirm(`Restore autosaved draft from ${label}?`, {
    title: 'Restore Draft',
    confirmLabel: 'Restore',
  });
  if (!ok) return;

  document.getElementById('session-form').reset();
  tagInput.setTags([]);
  populateForm(draft.data || {});
  if (window.autoResizeAll) window.autoResizeAll();
  showToast('Draft restored.', 'success');
}

// ─── Preview Modal ────────────────────────────────────────────────────────────
function showPreviewModal(result) {
  const modal = document.getElementById('preview-modal');
  const num   = String(result.filename).replace('session-', '');
  document.getElementById('modal-title').textContent = `Session ${num} — Preview`;

  // Show PDF in iframe via blob URL
  if (pendingPdfBlobUrl) URL.revokeObjectURL(pendingPdfBlobUrl);
  const pdfBytes = Uint8Array.from(atob(result.pdf), c => c.charCodeAt(0));
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  pendingPdfBlobUrl = URL.createObjectURL(blob);
  document.getElementById('pdf-frame').src = pendingPdfBlobUrl;

  // Render markdown
  document.getElementById('md-content').innerHTML = marked.parse(result.markdown || '');

  // Reset to PDF tab
  switchTab('pdf');

  modal.classList.remove('hidden');
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.getElementById('tab-pdf').classList.toggle('hidden', name !== 'pdf');
  document.getElementById('tab-md').classList.toggle('hidden', name !== 'md');
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('btn-close-modal').addEventListener('click', closeModal);
document.getElementById('btn-back-edit').addEventListener('click', closeModal);

function closeModal() {
  document.getElementById('preview-modal').classList.add('hidden');
}

// ─── Form submit → generate preview ──────────────────────────────────────────
document.getElementById('session-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!v('sessionNumber')) {
    showToast('Please enter a session number.', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating…';

  pendingFormData = collectFormData();

  let result;
  try {
    const res = await fetch('/api/sessions/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingFormData),
    });
    result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Server error');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Preview Session';
    return;
  }

  pendingPdfB64    = result.pdf;
  pendingMarkdown  = result.markdown;
  pendingFilename  = result.filename;

  btn.disabled = false;
  btn.textContent = 'Preview Session';
  showPreviewModal(result);
});

// ─── Save to App only (no folder picker) ─────────────────────────────────────
document.getElementById('btn-save-app').addEventListener('click', async () => {
  if (!pendingFormData) return;

  const btn = document.getElementById('btn-save-app');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const saveRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingFormData),
    });
    const saved = await saveRes.json();
    if (!saveRes.ok) throw new Error(saved.error || 'Save failed');

    clearDraft();
    closeModal();
    showToast('Session saved. Export files from the view page any time.', 'success');
    setTimeout(() => { location.href = `/view/${saved.id}`; }, 1200);
  } catch (err) {
    showToast('Save error: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Save to App';
  }
});

// ─── Save + Export Files (saves to app and opens folder picker) ───────────────
document.getElementById('btn-save-confirm').addEventListener('click', async () => {
  if (!pendingFormData) return;

  const saveBtn  = document.getElementById('btn-save-confirm');
  const saveNote = document.getElementById('save-note');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const saveRes = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingFormData),
    });
    const saved = await saveRes.json();
    if (!saveRes.ok) throw new Error(saved.error || 'Save failed');

    saveNote.textContent = 'A folder picker has opened on your desktop — choose where to save the files.';
    saveBtn.innerHTML = '<span class="spinner"></span> Waiting for folder…';

    const fileRes = await fetch('/api/sessions/save-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: saved.markdown, pdf: saved.pdf, filename: saved.filename }),
    });
    const fileResult = await fileRes.json();
    if (!fileRes.ok) throw new Error(fileResult.error || 'File save failed');

    if (fileResult.cancelled) {
      showToast('Session saved to app — no folder selected. Export again from the view page.', 'success');
    } else {
      showToast(`Saved ${saved.filename}.md and ${saved.filename}.pdf → ${fileResult.path}`, 'success');
    }

    clearDraft();
    closeModal();
    setTimeout(() => { location.href = `/view/${saved.id}`; }, 1400);
  } catch (err) {
    showToast('Save error: ' + err.message, 'error');
    saveNote.textContent = '';
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save + Export Files…';
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 5000);
}

// ─── Section Nav ──────────────────────────────────────────────────────────────
function buildSectionNav() {
  const nav = document.getElementById('section-nav');
  if (!nav) return;

  const SECTIONS = [
    { id: 's-info',       num: '01', label: 'Session Info'      },
    { id: 's-hook',       num: '02', label: 'Goal & Hook'        },
    { id: 's-beats',      num: '03', label: 'Session Beats'      },
    { id: 's-continuity', num: '04', label: 'Continuity'         },
    { id: 's-npcs',       num: '05', label: 'NPCs'               },
    { id: 's-locations',  num: '06', label: 'Locations'          },
    { id: 's-clocks',     num: '07', label: 'Faction Clocks'     },
    { id: 's-encounters', num: '08', label: 'Combat'             },
    { id: 's-notes',      num: '09', label: 'Session Notes'      },
  ];

  const ul = document.createElement('ul');
  SECTIONS.forEach(s => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${s.id}`;
    a.className = 'toc-h2';
    a.dataset.target = s.id;
    a.innerHTML = `<span class="toc-num">${s.num}</span>${s.label}`;
    a.addEventListener('click', e => {
      e.preventDefault();
      const el = document.getElementById(s.id);
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - 72;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
    li.appendChild(a);
    ul.appendChild(li);
  });

  const title = document.createElement('p');
  title.className = 'toc-title';
  title.textContent = 'Sections';
  nav.appendChild(title);
  nav.appendChild(ul);

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        nav.querySelectorAll('a').forEach(a => a.classList.remove('toc-active'));
        const active = nav.querySelector(`a[data-target="${entry.target.id}"]`);
        if (active) active.classList.add('toc-active');
      }
    });
  }, { rootMargin: '-5% 0px -75% 0px', threshold: 0 });

  SECTIONS.forEach(s => {
    const el = document.getElementById(s.id);
    if (el) observer.observe(el);
  });
}

// ─── NPC Picker ───────────────────────────────────────────────────────────────
let allNpcs = [];

async function loadNpcDatabase() {
  try {
    const res = await fetch('/api/npcs');
    if (!res.ok) return;
    allNpcs = await res.json();
  } catch {}
}

function openNpcPicker() {
  if (counts.npc >= MAX.npc) {
    showToast(`Maximum ${MAX.npc} NPCs per session reached.`, 'error');
    return;
  }
  let picker = document.getElementById('npc-picker');
  if (!picker) picker = buildNpcPicker();
  renderNpcPickerList('');
  const btn = document.getElementById('btn-add-npc');
  const rect = btn.getBoundingClientRect();
  const vpH = window.innerHeight;
  picker.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
  picker.style.top  = rect.bottom + 8 + 300 < vpH
    ? `${rect.bottom + 8}px`
    : `${rect.top - 8 - picker.offsetHeight || rect.top - 316}px`;
  picker.hidden = false;
  picker.querySelector('.npc-picker-search').value = '';
  picker.querySelector('.npc-picker-search').focus();
}

function buildNpcPicker() {
  const picker = document.createElement('div');
  picker.id = 'npc-picker';
  picker.className = 'npc-picker-panel';
  picker.hidden = true;
  picker.innerHTML = `
    <div class="npc-picker-head">
      <span class="npc-picker-title">Add NPC</span>
      <button type="button" class="npc-picker-x" id="npc-picker-close">×</button>
    </div>
    <button type="button" class="npc-picker-new-btn" id="npc-picker-new">
      <span class="npc-picker-new-icon">＋</span>
      <div>
        <div class="npc-picker-new-label">New NPC</div>
        <div class="npc-picker-new-sub">Start with a blank card</div>
      </div>
    </button>
    <div class="npc-picker-or">— or import from your NPC database —</div>
    <div class="npc-picker-search-wrap">
      <input type="text" class="npc-picker-search" placeholder="Search by name…" autocomplete="off">
    </div>
    <div class="npc-picker-list" id="npc-picker-list"></div>
  `;
  document.body.appendChild(picker);

  picker.querySelector('#npc-picker-close').addEventListener('click', closeNpcPicker);
  picker.querySelector('#npc-picker-new').addEventListener('click', () => {
    addCard('npc', 'npc-list', makeNPCCard, 'btn-add-npc');
    closeNpcPicker();
  });
  picker.querySelector('.npc-picker-search').addEventListener('input', e => {
    renderNpcPickerList(e.target.value.trim());
  });

  document.addEventListener('click', e => {
    if (!picker.hidden && !picker.contains(e.target) && e.target.id !== 'btn-add-npc') closeNpcPicker();
  }, true);
  document.addEventListener('keydown', e => {
    if (!picker.hidden && e.key === 'Escape') closeNpcPicker();
  });
  return picker;
}

function closeNpcPicker() {
  const picker = document.getElementById('npc-picker');
  if (picker) picker.hidden = true;
}

function renderNpcPickerList(query) {
  const list = document.getElementById('npc-picker-list');
  if (!list) return;
  const q = query.toLowerCase();
  const filtered = allNpcs.filter(n =>
    !q ||
    (n.name || '').toLowerCase().includes(q) ||
    (n.nickname || '').toLowerCase().includes(q) ||
    (n.situation || '').toLowerCase().includes(q)
  );

  if (!filtered.length) {
    list.innerHTML = `<p class="npc-picker-empty">${
      allNpcs.length
        ? 'No NPCs match your search.'
        : 'No NPCs in your database yet.<br><a href="/npc/new" target="_blank">Create one on the NPCs page →</a>'
    }</p>`;
    return;
  }

  list.innerHTML = filtered.map(n => `
    <button type="button" class="npc-picker-item" data-npc-id="${h(n.id)}">
      <span class="npc-picker-item-name">${h(n.name)}${n.nickname ? ` <em class="npc-picker-item-nick">"${h(n.nickname)}"</em>` : ''}</span>
      ${n.situation ? `<span class="npc-picker-item-sub">${h(n.situation.slice(0, 80))}${n.situation.length > 80 ? '…' : ''}</span>` : ''}
    </button>
  `).join('');

  list.querySelectorAll('.npc-picker-item').forEach(btn => {
    btn.addEventListener('click', () => importNpcFromDb(btn.dataset.npcId));
  });
}

async function importNpcFromDb(npcId) {
  // Prevent duplicate
  if (document.querySelector(`.npc-card[data-source-npc-id="${npcId}"]`)) {
    showToast('That NPC is already in this session.', 'error');
    return;
  }
  try {
    const res = await fetch(`/api/npcs/${encodeURIComponent(npcId)}`);
    if (!res.ok) throw new Error('NPC not found');
    const npc = await res.json();

    // Map NPC database fields → session card fields
    const d = {
      _sourceId:    npc.id,
      name:         npc.name || '',
      faction:      '',
      situation:    npc.situation || '',
      wants:        npc.wantsNeeds || '',
      phrases:      npc.commonPhrase || '',
      bodyLanguage: npc.appearance || '',
      neverDoes:    npc.secretObstacle || '',
      corneredLine: '',
    };
    addCard('npc', 'npc-list', makeNPCCard, 'btn-add-npc', d);
    closeNpcPicker();
    showToast(`${npc.name} added to session.`, 'success');
  } catch (err) {
    showToast('Could not import NPC: ' + err.message, 'error');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function initFormPage() {
  document.getElementById('date').valueAsDate = new Date();
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const settings = await res.json();
      autosaveEnabled = settings.autosaveEnabled !== false;
    }
  } catch {}

  await loadNpcDatabase();
  await initEditMode();
  buildSectionNav();
  await restoreDraftIfAvailable();

  const form = document.getElementById('session-form');
  form.addEventListener('input', scheduleDraftSave);
  form.addEventListener('change', scheduleDraftSave);
  document.getElementById('tag-input-container').addEventListener('click', scheduleDraftSave);
  document.getElementById('tag-input-container').addEventListener('keydown', scheduleDraftSave);
}

initFormPage();
