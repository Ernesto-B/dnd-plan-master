// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_ENEMIES = 8;
let enemyCount = 0;
let taskCount   = 0;

let pendingData      = null;
let pendingPdfB64    = null;
let pendingMarkdown  = null;
let pendingFilename  = null;
let pendingPdfBlobUrl = null;
let currentEncounterStatus = 'active';
let autosaveEnabled   = true;
let draftSaveTimer    = null;

// ─── HTML escape helper ───────────────────────────────────────────────────────
function h(str) {
  const d = document.createElement('div');
  d.textContent = String(str == null ? '' : str);
  return d.innerHTML;
}

function nonEmpty(value) {
  return String(value == null ? '' : value).trim().length > 0;
}

// ─── Sessions dropdown ────────────────────────────────────────────────────────
async function loadSessionOptions(selectedId) {
  try {
    const res = await fetch('/api/sessions');
    const sessions = await res.json();
    const sel = document.getElementById('enc-session');
    sessions.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `Session ${String(s.sessionNumber).padStart(3,'0')} — ${s.goal ? s.goal.slice(0, 50) + (s.goal.length > 50 ? '…' : '') : '(no goal)'}`;
      if (s.id === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
  } catch { /* sessions unavailable */ }
}

// ─── Enemy card ───────────────────────────────────────────────────────────────
function makeEnemyCard(n, data = {}) {
  const fl = data.frontload || {};
  const card = document.createElement('div');
  card.className = 'card enemy-card';
  card.dataset.n = n;

  card.innerHTML = `
    <div class="card-header">
      <span class="card-title">Enemy ${n}</span>
      <button type="button" class="remove-btn btn btn-ghost" style="color:var(--danger);">✕ Remove</button>
    </div>
    <div class="form-grid">
      <div class="field">
        <label>Enemy Name / Type *</label>
        <input type="text" class="enemy-name" placeholder="Harwick the Scar" value="${h(data.name || '')}">
      </div>
      <div class="field">
        <label>Role</label>
        <span class="hint">One sentence on their combat function.</span>
        <input type="text" class="enemy-role" placeholder="Lead enforcer — grapples the most dangerous PC toward the canal." value="${h(data.role || '')}">
      </div>
      <div class="field full">
        <label class="check-label puzzle-toggle-label">
          <input type="checkbox" class="enemy-is-puzzle" ${data.isPuzzle ? 'checked' : ''}>
          <strong>Puzzle Enemy</strong> — has a specific mechanic the party must discover and counter
        </label>
      </div>
    </div>
    <div class="puzzle-fields" style="display:${data.isPuzzle ? 'block' : 'none'};">
      <div class="form-grid">
        <div class="field full">
          <label>Mechanical Pressure</label>
          <span class="hint">What does this enemy do that demands a response from the party?</span>
          <textarea class="enemy-pressure" class="short" placeholder="Regenerates 10 HP at start of each turn — conventional damage alone will not kill it.">${h(data.pressure || '')}</textarea>
        </div>
        <div class="field full">
          <label>The Key</label>
          <span class="hint">What specific action or condition counters the pressure?</span>
          <textarea class="enemy-key" class="short" placeholder="Cold iron disrupts the regeneration for one round. Disarming the insignia removes the ward entirely.">${h(data.key || '')}</textarea>
        </div>
        <div class="field full">
          <label>Front-Loading Channels</label>
          <span class="hint">Choose at least two ways players can discover the key mechanic.</span>
          <div class="frontload-grid">

            <label class="check-label">
              <input type="checkbox" class="fl-lore-chk" ${fl.lore?.enabled ? 'checked' : ''}>
              <strong>Lore Check</strong>
            </label>
            <div class="fl-lore-fields" style="display:${fl.lore?.enabled ? 'grid' : 'none'}; grid-template-columns: 1fr auto 2fr; gap:8px; align-items:end; margin: 4px 0 8px 24px;">
              <div class="field">
                <label>Skill</label>
                <select class="fl-lore-skill">
                  ${['Arcana','History','Nature','Religion','Investigation','Medicine','Perception'].map(s =>
                    `<option${fl.lore?.skill === s ? ' selected' : ''}>${s}</option>`).join('')}
                </select>
              </div>
              <div class="field" style="max-width:80px;">
                <label>DC</label>
                <input type="number" class="fl-lore-dc" min="5" max="30" placeholder="14" value="${h(fl.lore?.dc || '')}">
              </div>
              <div class="field">
                <label>Information revealed</label>
                <input type="text" class="fl-lore-info" placeholder="The insignia is a ward — disarming it drops resistance." value="${h(fl.lore?.info || '')}">
              </div>
            </div>

            <label class="check-label">
              <input type="checkbox" class="fl-visual-chk" ${fl.visual?.enabled ? 'checked' : ''}>
              <strong>Visual Tell</strong>
            </label>
            <div class="fl-visual-fields" style="display:${fl.visual?.enabled ? 'block' : 'none'}; margin: 4px 0 8px 24px;">
              <div class="field">
                <label>Opening description that implies the solution</label>
                <textarea class="fl-visual-desc" class="short" placeholder="The insignia at his chest catches torchlight and pulses faintly — like something is being held in.">${h(fl.visual?.description || '')}</textarea>
              </div>
            </div>

            <label class="check-label">
              <input type="checkbox" class="fl-behaviour-chk" ${fl.behaviour?.enabled ? 'checked' : ''}>
              <strong>Behaviour Signal</strong>
            </label>
            <div class="fl-behaviour-fields" style="display:${fl.behaviour?.enabled ? 'block' : 'none'}; margin: 4px 0 8px 24px;">
              <div class="field">
                <label>What the enemy does on turn 1 that signals how they work</label>
                <textarea class="fl-behaviour-desc" class="short" placeholder="After taking a hit, Harwick visibly braces for a moment — then his wounds close. The party can see it happen.">${h(fl.behaviour?.description || '')}</textarea>
              </div>
            </div>

            <label class="check-label">
              <input type="checkbox" class="fl-init-chk" ${fl.initiative?.enabled ? 'checked' : ''}>
              <strong>Initiative / Perception Reward</strong>
            </label>
            <div class="fl-init-fields" style="display:${fl.initiative?.enabled ? 'block' : 'none'}; margin: 4px 0 8px 24px;">
              <div class="field">
                <label>One sentence for a player who rolls 17+ on initiative</label>
                <input type="text" class="fl-init-desc" placeholder="Your eye catches that his wounds are already closing — whatever that insignia is, it's keeping him standing." value="${h(fl.initiative?.description || '')}">
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>`;

  card.querySelector('.remove-btn').addEventListener('click', () => {
    card.remove();
    enemyCount--;
    const btn = document.getElementById('btn-add-enemy');
    if (enemyCount < MAX_ENEMIES) btn.style.display = '';
  });

  const puzzleChk = card.querySelector('.enemy-is-puzzle');
  const puzzleFields = card.querySelector('.puzzle-fields');
  puzzleChk.addEventListener('change', () => {
    puzzleFields.style.display = puzzleChk.checked ? 'block' : 'none';
  });

  // Front-load toggles
  [
    ['fl-lore-chk',      'fl-lore-fields'],
    ['fl-visual-chk',    'fl-visual-fields'],
    ['fl-behaviour-chk', 'fl-behaviour-fields'],
    ['fl-init-chk',      'fl-init-fields'],
  ].forEach(([chkClass, fieldsClass]) => {
    const chk = card.querySelector(`.${chkClass}`);
    const fields = card.querySelector(`.${fieldsClass}`);
    chk.addEventListener('change', () => { fields.style.display = chk.checked ? (chkClass === 'fl-lore-chk' ? 'grid' : 'block') : 'none'; });
  });

  return card;
}

function addEnemy(data = {}) {
  if (enemyCount >= MAX_ENEMIES) return;
  enemyCount++;
  const card = makeEnemyCard(enemyCount, data);
  document.getElementById('enemy-list').appendChild(card);
  if (enemyCount >= MAX_ENEMIES) document.getElementById('btn-add-enemy').style.display = 'none';
}

// ─── Natural Task row ─────────────────────────────────────────────────────────
function makeTaskRow(data = {}) {
  taskCount++;
  const row = document.createElement('div');
  row.className = 'form-grid task-row';
  row.style.cssText = 'grid-template-columns: 1.2fr 1.2fr 2fr 2fr auto; gap: 8px; margin-bottom: 8px; align-items: end;';
  row.innerHTML = `
    <div class="field">
      <label>Player</label>
      <input type="text" class="task-name" placeholder="Aldric" value="${h(data.name || '')}">
      <input type="url" class="task-url" placeholder="Character sheet URL" value="${h(data.characterUrl || '')}" title="Character sheet URL — name becomes a link in the document">
    </div>
    <div class="field">
      <label>Class / Role</label>
      <input type="text" class="task-class" placeholder="Paladin" value="${h(data.playerClass || '')}">
    </div>
    <div class="field">
      <label>Natural Task in This Encounter</label>
      <input type="text" class="task-task" placeholder="Intercept the fleeing convict OR hold the main line." value="${h(data.task || '')}">
    </div>
    <div class="field">
      <label>Ability / Feature Used</label>
      <input type="text" class="task-ability" placeholder="Sacred Weapon + speed makes credible interceptor." value="${h(data.ability || '')}">
    </div>
    <div class="field" style="padding-bottom:2px;">
      <button type="button" class="btn btn-ghost remove-btn" style="color:var(--danger);">✕</button>
    </div>`;
  row.querySelector('.remove-btn').addEventListener('click', () => { row.remove(); taskCount--; });
  return row;
}

function addTask(data = {}) {
  document.getElementById('task-list').appendChild(makeTaskRow(data));
}

// ─── Collect form data ────────────────────────────────────────────────────────
function collectFormData() {
  const g = id => (document.getElementById(id) || {}).value || '';
  const gn = name => (document.querySelector(`[name="${name}"]`) || {}).value || '';

  const enemies = [...document.querySelectorAll('.enemy-card')].map(card => {
    const isPuzzle = card.querySelector('.enemy-is-puzzle').checked;
    const fl = {};
    if (isPuzzle) {
      fl.lore = {
        enabled: card.querySelector('.fl-lore-chk').checked,
        skill:   card.querySelector('.fl-lore-skill').value,
        dc:      card.querySelector('.fl-lore-dc').value,
        info:    card.querySelector('.fl-lore-info').value,
      };
      fl.visual = {
        enabled:     card.querySelector('.fl-visual-chk').checked,
        description: card.querySelector('.fl-visual-desc').value,
      };
      fl.behaviour = {
        enabled:     card.querySelector('.fl-behaviour-chk').checked,
        description: card.querySelector('.fl-behaviour-desc').value,
      };
      fl.initiative = {
        enabled:     card.querySelector('.fl-init-chk').checked,
        description: card.querySelector('.fl-init-desc').value,
      };
    }
    return {
      name:      card.querySelector('.enemy-name').value.trim(),
      role:      card.querySelector('.enemy-role').value.trim(),
      isPuzzle,
      pressure:  isPuzzle ? card.querySelector('.enemy-pressure').value.trim() : '',
      key:       isPuzzle ? card.querySelector('.enemy-key').value.trim() : '',
      frontload: fl,
    };
  }).filter(e => e.name);

  const naturalTasks = [...document.querySelectorAll('.task-row')].map(row => ({
    name:         row.querySelector('.task-name').value.trim(),
    playerClass:  row.querySelector('.task-class').value.trim(),
    task:         row.querySelector('.task-task').value.trim(),
    ability:      row.querySelector('.task-ability').value.trim(),
    characterUrl: row.querySelector('.task-url').value.trim(),
  }));

  const chk = name => !!(document.querySelector(`[name="chk-${name}"]`) || {}).checked;

  return {
    id:                  document.getElementById('enc-name').dataset.editId || undefined,
    status:              currentEncounterStatus === 'draft' ? 'draft' : undefined,
    name:                g('enc-name'),
    sessionId:           g('enc-session') || null,
    fiction:             g('enc-fiction'),
    winCondition:        g('enc-win'),
    interestingFailure:  g('enc-fail'),
    secondaryObjective: {
      description: gn('obj-description'),
      round:       gn('obj-round'),
      initiative:  gn('obj-initiative'),
      consequence: gn('obj-consequence'),
    },
    environment: {
      layer1:        gn('env-layer1'),
      layer2trigger: gn('env-layer2trigger'),
      layer2ongoing: gn('env-layer2ongoing'),
      layer3:        gn('env-layer3'),
    },
    enemies,
    naturalTasks,
    checklist: {
      situationComplexity: chk('situationComplexity'),
      noProne:             chk('noProne'),
      noHighAC:            chk('noHighAC'),
      everyoneHasTask:     chk('everyoneHasTask'),
      discoverableRound1:  chk('discoverableRound1'),
      nonViolentPath:      chk('nonViolentPath'),
    },
    notes: g('enc-notes'),
    tags:  encTagInput.getTags(),
  };
}

function getDraftKey() {
  const editId = document.getElementById('enc-name').dataset.editId;
  return editId ? `dnd-draft-encounter:${editId}` : 'dnd-draft-encounter:new';
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

function resetEncounterFormState() {
  enemyCount = 0;
  taskCount = 0;
  document.getElementById('enemy-list').innerHTML = '';
  document.getElementById('task-list').innerHTML = '';
  document.getElementById('btn-add-enemy').style.display = '';
}

// ─── Edit mode ────────────────────────────────────────────────────────────────
async function initEditMode() {
  const editId = location.pathname.split('/').pop();
  if (!editId || location.pathname.includes('/new')) return;
  if (!location.pathname.includes('/edit/')) return;

  try {
    const res = await fetch(`/api/encounters/${editId}`);
    if (!res.ok) return;
    const enc = await res.json();
    currentEncounterStatus = enc.status || 'active';
    if (currentEncounterStatus !== 'draft') {
      document.getElementById('btn-save-draft')?.classList.add('hidden');
    }
    populateForm(enc.data, editId);
    if (window.autoResizeAll) window.autoResizeAll();
    document.getElementById('page-title').textContent = 'Edit Encounter Plan';
    document.getElementById('page-subtitle').textContent = 'Update the encounter plan, then preview and save.';
    if (currentEncounterStatus === 'draft') {
      document.getElementById('btn-submit').textContent = 'Preview Draft Changes';
      const draftBtn = document.getElementById('btn-save-draft');
      if (draftBtn) draftBtn.textContent = 'Save Draft';
    }
    const backLink = document.getElementById('form-back-link');
    if (backLink) { backLink.href = `/encounter/view/${editId}`; backLink.textContent = '← Back to Encounter'; }
  } catch { /* not in edit mode */ }
}

function populateForm(data, editId) {
  resetEncounterFormState();
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };

  document.getElementById('enc-name').value = data.name || '';
  document.getElementById('enc-name').dataset.editId = editId;
  document.getElementById('enc-fiction').value = data.fiction || '';
  document.getElementById('enc-win').value = data.winCondition || '';
  document.getElementById('enc-fail').value = data.interestingFailure || '';

  const obj = data.secondaryObjective || {};
  document.querySelector('[name="obj-description"]').value = obj.description || '';
  document.querySelector('[name="obj-round"]').value = obj.round || '';
  document.querySelector('[name="obj-initiative"]').value = obj.initiative || '';
  document.querySelector('[name="obj-consequence"]').value = obj.consequence || '';

  const env = data.environment || {};
  document.querySelector('[name="env-layer1"]').value = env.layer1 || '';
  document.querySelector('[name="env-layer2trigger"]').value = env.layer2trigger || '';
  document.querySelector('[name="env-layer2ongoing"]').value = env.layer2ongoing || '';
  document.querySelector('[name="env-layer3"]').value = env.layer3 || '';

  (data.enemies || []).forEach(e => addEnemy(e));
  (data.naturalTasks || []).forEach(t => addTask(t));

  const chk = data.checklist || {};
  Object.entries(chk).forEach(([key, val]) => {
    const el = document.querySelector(`[name="chk-${key}"]`);
    if (el) el.checked = !!val;
  });

  document.getElementById('enc-notes').value = data.notes || '';
  if (data.tags) encTagInput.setTags(data.tags);

  // Set session dropdown after sessions load
  if (data.sessionId) {
    setTimeout(() => {
      const sel = document.getElementById('enc-session');
      for (const opt of sel.options) {
        if (opt.value === data.sessionId) { opt.selected = true; break; }
      }
    }, 500);
  }
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

  document.getElementById('encounter-form').reset();
  encTagInput.setTags([]);
  populateForm(draft.data || {}, draft.data?.id);
  if (window.autoResizeAll) window.autoResizeAll();
  showToast('Draft restored.', 'success');
}

// ─── Preview modal ────────────────────────────────────────────────────────────
function showPreviewModal(markdown, pdfB64, filename) {
  pendingMarkdown = markdown;
  pendingPdfB64 = pdfB64;
  pendingFilename = filename;

  if (pendingPdfBlobUrl) URL.revokeObjectURL(pendingPdfBlobUrl);
  const bytes = Uint8Array.from(atob(pdfB64), c => c.charCodeAt(0));
  pendingPdfBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  document.getElementById('pdf-frame').src = pendingPdfBlobUrl;
  document.getElementById('md-content').innerHTML = marked.parse(markdown);
  document.getElementById('modal-title').textContent = `Preview: ${pendingFilename}`;
  document.getElementById('preview-modal').classList.remove('hidden');
}

// ─── Section nav ──────────────────────────────────────────────────────────────
function buildSectionNav() {
  const nav = document.getElementById('section-nav');
  if (!nav) return;
  const SECTIONS = [
    { id: 'es-overview',    num: '01', label: 'Overview'          },
    { id: 'es-fiction',     num: '02', label: 'Fiction & Outcome' },
    { id: 'es-objective',   num: '03', label: 'Sec. Objective'    },
    { id: 'es-environment', num: '04', label: 'Environment'       },
    { id: 'es-enemies',     num: '05', label: 'Enemies'           },
    { id: 'es-tasks',       num: '06', label: 'Natural Tasks'     },
    { id: 'es-checklist',   num: '07', label: 'Checklist'         },
    { id: 'es-notes',       num: '08', label: 'Combat Notes'      },
  ];
  const ul = document.createElement('ul');
  SECTIONS.forEach(s => {
    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.href = `#${s.id}`;
    a.className = 'toc-h2';
    a.dataset.target = s.id;
    a.innerHTML = `<span class="toc-num">${s.num}</span>${s.label}`;
    a.addEventListener('click', e => {
      e.preventDefault();
      const el = document.getElementById(s.id);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' });
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
  SECTIONS.forEach(s => { const el = document.getElementById(s.id); if (el) observer.observe(el); });
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 5000);
}

// ─── Tag input ────────────────────────────────────────────────────────────────
const encTagInput = new TagInput(document.getElementById('enc-tag-input-container'));

// ─── Init ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-add-enemy').addEventListener('click', () => addEnemy());
document.getElementById('btn-add-task').addEventListener('click', () => addTask());

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// Close modal
document.getElementById('btn-close-modal').addEventListener('click', () => {
  document.getElementById('preview-modal').classList.add('hidden');
});
document.getElementById('btn-back-edit').addEventListener('click', () => {
  document.getElementById('preview-modal').classList.add('hidden');
});

// Form submit → preview
document.getElementById('encounter-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating…';

  try {
    pendingData = collectFormData();
    const res = await fetch('/api/encounters/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingData),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Preview failed');
    pendingFilename = result.filename;
    showPreviewModal(result.markdown, result.pdf, result.filename);
  } catch (err) {
    showToast('Preview error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Preview Encounter Plan';
  }
});

// Save to App only (no folder picker)
document.getElementById('btn-save-app').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-app');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const saveRes = await fetch('/api/encounters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingData),
    });
    const saved = await saveRes.json();
    if (!saveRes.ok) throw new Error(saved.error || 'Save failed');

    clearDraft();
    document.getElementById('preview-modal').classList.add('hidden');
    showToast('Encounter plan saved. Export files from the view page any time.', 'success');
    setTimeout(() => { location.href = `/encounter/view/${saved.id}`; }, 1200);
  } catch (err) {
    showToast('Save error: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Save to App';
  }
});

// Save + Export Files (saves to app and opens folder picker)
document.getElementById('btn-save-confirm').addEventListener('click', async () => {
  const saveBtn  = document.getElementById('btn-save-confirm');
  const saveNote = document.getElementById('save-note');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const saveRes = await fetch('/api/encounters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingData),
    });
    const saved = await saveRes.json();
    if (!saveRes.ok) throw new Error(saved.error || 'Save failed');

    saveNote.textContent = 'A folder picker has opened on your desktop — choose where to save the files.';
    saveBtn.innerHTML = '<span class="spinner"></span> Waiting for folder…';

    const fileRes = await fetch('/api/encounters/save-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: pendingMarkdown, pdf: pendingPdfB64, filename: pendingFilename }),
    });
    const fileResult = await fileRes.json();
    if (!fileRes.ok) throw new Error(fileResult.error || 'File save failed');

    document.getElementById('preview-modal').classList.add('hidden');
    if (fileResult.cancelled) {
      showToast('Encounter plan saved — no folder selected. Export again from the view page.', 'success');
    } else {
      showToast(`Saved ${pendingFilename}.md and .pdf → ${fileResult.path}`, 'success');
    }
    clearDraft();
    setTimeout(() => { location.href = `/encounter/view/${saved.id}`; }, 1200);
  } catch (err) {
    showToast('Save error: ' + err.message, 'error');
    saveNote.textContent = '';
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save + Export Files…';
  }
});

document.getElementById('btn-save-draft').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save-draft');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    const body = { ...collectFormData(), status: 'draft' };
    const saveRes = await fetch('/api/encounters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const saved = await saveRes.json();
    if (!saveRes.ok) throw new Error(saved.error || 'Save failed');

    clearDraft();
    showToast('Draft saved.', 'success');
    setTimeout(() => { location.href = `/encounter/view/${saved.id}`; }, 900);
  } catch (err) {
    showToast('Save error: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = currentEncounterStatus === 'draft' ? 'Save Draft' : 'Save as Draft';
  }
});

// Load sessions + init
async function initEncounterFormPage() {
  let settings = {};
  try {
    const res = await fetch('/api/settings');
    if (res.ok) settings = await res.json();
  } catch {}

  autosaveEnabled = settings.autosaveEnabled !== false;
  document.getElementById('btn-save-draft')?.classList.remove('hidden');
  await loadSessionOptions(null);
  buildSectionNav();
  await initEditMode();
  await restoreDraftIfAvailable();

  if (taskCount === 0 && !location.pathname.includes('/edit/')) {
    (settings.party || []).forEach(p => addTask({ name: p.name, playerClass: p.playerClass, characterUrl: p.characterUrl || '' }));
  }

  const form = document.getElementById('encounter-form');
  form.addEventListener('input', scheduleDraftSave);
  form.addEventListener('change', scheduleDraftSave);
  document.getElementById('enc-tag-input-container').addEventListener('click', scheduleDraftSave);
  document.getElementById('enc-tag-input-container').addEventListener('keydown', scheduleDraftSave);
}

initEncounterFormPage();
