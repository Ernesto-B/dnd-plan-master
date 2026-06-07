const MAX_DIST = 5;
const MAX_POI  = 5;

let editLocationId = null;
let tagInputInstance = null;

(async function () {
  const isEdit  = location.pathname.includes('/edit/');
  const pathId  = location.pathname.split('/').pop();
  editLocationId = isEdit ? pathId : null;

  if (isEdit) {
    document.getElementById('page-title').textContent = 'Edit Location';
    document.querySelector('.page-subtitle').textContent = 'Update this place\'s details.';
    const backLink = document.getElementById('form-back-link');
    if (backLink) { backLink.href = `/location/view/${pathId}`; backLink.textContent = '← Back to Location'; }
  }

  // Tag input
  const tagWrap = document.getElementById('loc-tag-input-container');
  tagInputInstance = new TagInput(tagWrap, []);

  // District add button
  const districtListEl = document.getElementById('district-list');
  const addDistBtn     = document.getElementById('btn-add-district');
  addDistBtn.addEventListener('click', () => addDistrict(districtListEl, addDistBtn));

  // Load sessions for the link dropdown
  await loadSessionOptions();

  // Populate form if editing
  if (isEdit) {
    try {
      const res = await fetch(`/api/locations/${pathId}`);
      if (!res.ok) throw new Error('Not found');
      const loc = await res.json();
      populate(loc);
      if (window.autoResizeAll) window.autoResizeAll();
    } catch {
      showToast('Could not load Location for editing.', 'error');
    }
  }

  document.getElementById('btn-save').addEventListener('click', save);
  document.getElementById('location-form').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault();
  });
})();

// ─── Districts & Points of Interest ──────────────────────────────────────────
function addDistrict(container, addBtn, d = {}) {
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

  addPoiBtn.addEventListener('click', () => addPOI(poiContainer, addPoiBtn));

  sub.querySelector('.remove-btn').addEventListener('click', () => {
    sub.remove();
    renumberDistricts(container);
    if (container.querySelectorAll('.district-sub-card').length < MAX_DIST) addBtn.style.display = '';
  });

  (d.pointsOfInterest || []).forEach(poiData => addPOI(poiContainer, addPoiBtn, poiData));

  container.appendChild(sub);
  if (container.querySelectorAll('.district-sub-card').length >= MAX_DIST) addBtn.style.display = 'none';
}

function addPOI(container, addBtn, d = {}) {
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

function collectDistricts() {
  return Array.from(document.querySelectorAll('#district-list .district-sub-card')).map(d => ({
    name:      d.querySelector('.dist-name')?.value.trim()       ?? '',
    readAloud: d.querySelector('.dist-read-aloud')?.value.trim() ?? '',
    pointsOfInterest: Array.from(d.querySelectorAll('.poi-row')).map(r => ({
      name:        r.querySelector('.poi-name')?.value.trim() ?? '',
      description: r.querySelector('.poi-desc')?.value.trim() ?? '',
    })).filter(p => p.name || p.description),
  }));
}

// ─── Linked sessions ──────────────────────────────────────────────────────────
async function loadSessionOptions() {
  const sel = document.getElementById('loc-sessions');
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

// ─── Populate / Save ──────────────────────────────────────────────────────────
function populate(loc) {
  setVal('loc-government',           loc.government || '');
  setVal('loc-population-size',      loc.populationSize || '');
  setVal('loc-population-diversity', loc.populationDiversity || '');
  setVal('loc-languages',            loc.languages || '');
  setVal('loc-resources',            loc.resources || '');
  setVal('loc-fun-fact',             loc.funFact || '');

  setVal('loc-name',        loc.name || '');
  setVal('loc-description', loc.description || '');
  setVal('loc-sensory',     loc.sensoryDetail || '');
  setVal('loc-hidden',      loc.hiddenDetail || '');

  setVal('loc-horizon', loc.onTheHorizon || '');

  const districtListEl = document.getElementById('district-list');
  const addDistBtn     = document.getElementById('btn-add-district');
  (loc.districts || []).forEach(d => addDistrict(districtListEl, addDistBtn, d));

  if (loc.tags && tagInputInstance) {
    tagInputInstance.setTags(loc.tags);
  }

  const sessionSel = document.getElementById('loc-sessions');
  (loc.linkedSessions || []).forEach(id => {
    const opt = sessionSel.querySelector(`option[value="${id}"]`);
    if (opt) opt.selected = true;
  });
}

async function save() {
  const name = document.getElementById('loc-name').value.trim();
  if (!name) {
    document.getElementById('loc-name').focus();
    showToast('Name is required.', 'error');
    return;
  }

  const sessionSel    = document.getElementById('loc-sessions');
  const linkedSessions = [...sessionSel.selectedOptions].map(o => o.value).filter(Boolean);

  const body = {
    name,
    government:          document.getElementById('loc-government').value.trim(),
    populationSize:      document.getElementById('loc-population-size').value.trim(),
    populationDiversity: document.getElementById('loc-population-diversity').value.trim(),
    languages:           document.getElementById('loc-languages').value.trim(),
    resources:           document.getElementById('loc-resources').value.trim(),
    funFact:             document.getElementById('loc-fun-fact').value.trim(),
    description:         document.getElementById('loc-description').value.trim(),
    sensoryDetail:       document.getElementById('loc-sensory').value.trim(),
    hiddenDetail:        document.getElementById('loc-hidden').value.trim(),
    districts:           collectDistricts(),
    onTheHorizon:        document.getElementById('loc-horizon').value.trim(),
    linkedSessions,
    tags: tagInputInstance ? tagInputInstance.getTags() : [],
  };

  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const url    = editLocationId ? `/api/locations/${editLocationId}` : '/api/locations';
    const method = editLocationId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
    const saved = await res.json();
    location.href = `/location/view/${saved.id}`;
  } catch (err) {
    showToast('Save failed: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Save Location';
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
