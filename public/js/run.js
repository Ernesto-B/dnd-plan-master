(async function () {
  'use strict';
  const id  = location.pathname.split('/').pop();
  const app = document.getElementById('run-app');
  const isPopout = new URLSearchParams(location.search).get('popout') === 'initiative';
  if (isPopout) document.body.classList.add('run-popout');

  // ── Fetch session ─────────────────────────────────────────────────────────────
  let session;
  try {
    const res = await fetch(`/api/sessions/${id}`);
    if (!res.ok) throw new Error();
    session = await res.json();
  } catch {
    app.innerHTML = `<div class="run-error"><p>Session not found.</p><a href="/sessions" class="btn btn-ghost">← Back</a></div>`;
    return;
  }

  const data = session.data || {};
  document.title = isPopout
    ? `⚔ Initiative — Session #${session.sessionNumber}`
    : `▶ Session #${session.sessionNumber} — Run Mode`;

  // ── Fetch party roster (for initiative quick-add), NPC/location lookup index,
  // and wiki-link index ─────────────────────────────────────────────────────────
  let partyRoster = [];
  let npcIndex = [];
  let locationIndex = [];
  try {
    const [cRes, nRes, lRes] = await Promise.all([
      fetch('/api/campaigns/active'),
      fetch('/api/npcs'),
      fetch('/api/locations'),
    ]);
    if (cRes.ok) {
      const campaign = await cRes.json();
      partyRoster = Array.isArray(campaign?.partyRoster) ? campaign.partyRoster : [];
    }
    if (nRes.ok) npcIndex = await nRes.json();
    if (lRes.ok) locationIndex = await lRes.json();
  } catch {}
  if (window.WikiLinks) WikiLinks.preload();

  // ── Persistence ───────────────────────────────────────────────────────────────
  const BEAT_KEY   = `dnd-beats-${id}`;
  const INIT_KEY   = `dnd-init-${id}`;
  const SECT_KEY   = `dnd-sect-${id}`;
  const COMBAT_KEY = `dnd-combat-${id}`;
  const NOTES_KEY  = `dnd-notes-${id}`;

  function loadJ(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
  }
  function saveJ(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  let beats     = loadJ(BEAT_KEY, { open: false, middle: false, escalate: false, close: false, times: {} });
  let init      = loadJ(INIT_KEY, { combatants: [], round: 1, activeIdx: -1 });
  let sects     = loadJ(SECT_KEY, {});
  let combatMode = loadJ(COMBAT_KEY, { active: false, selection: 'blank' });
  let notes     = loadJ(NOTES_KEY, { text: '', lastSavedAt: '' });

  // ── Util ──────────────────────────────────────────────────────────────────────
  const esc     = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const escAttr = s => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const nl      = s => esc(s).replace(/\n/g, '<br>');
  let idCounter = 0;
  const genId   = () => `${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

  function showToast(msg, type = 'success') {
    let t = document.getElementById('run-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'run-toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = `toast ${type} show`;
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(() => { t.className = 'toast'; }, 4000);
  }

  // ── Full mount ────────────────────────────────────────────────────────────────
  function mount() {
    app.innerHTML = buildPage();
    wireAll();
  }

  function buildPage() {
    if (isPopout) {
      return `
        <div class="run-popout-head">
          <span class="run-popout-title">⚔ Session #${esc(session.sessionNumber)} — Initiative</span>
        </div>
        ${buildInitCard()}
      `;
    }

    const done = ['open','middle','escalate','close'].filter(k => beats[k]).length;
    return `
      <div class="run-header">
        <a href="/view/${esc(id)}" class="run-exit">← Exit Run Mode</a>
        <div class="run-header-center">
          <span class="run-session-num">Session #${esc(session.sessionNumber)}</span>
          ${session.date ? `<span class="run-meta">${esc(session.date)}</span>` : ''}
          ${session.partyLevel ? `<span class="run-meta">Lv ${esc(session.partyLevel)}</span>` : ''}
        </div>
        <div class="run-header-right">
          <button class="run-sm-btn run-lookup-btn" id="btn-lookup-toggle" title="Quick reference for this campaign's NPCs and locations">🔍 Lookup</button>
          <button class="run-combat-toggle${combatMode.active ? ' active' : ''}" id="btn-combat-toggle">
            ${combatMode.active ? '📋 Exit Combat Mode' : '⚔ Combat Mode'}
          </button>
          ${(!combatMode.active && data.sessionGoal) ? `<div class="run-goal">${esc(data.sessionGoal)}</div>` : ''}
        </div>
      </div>

      <div class="run-body">
        ${combatMode.active ? buildCombatMode() : `
          <div class="run-top-row">
            ${buildBeatsCard(done)}
            ${buildInitCard()}
          </div>
          ${buildNotesCard()}
          ${buildAllSections()}
        `}
      </div>

      ${buildLookupPanel()}
    `;
  }

  // ── BEATS ─────────────────────────────────────────────────────────────────────
  const BEAT_DEFS = [
    { key: 'open',     label: 'Open',     time: '0–20 min',    text: data.beatOpen },
    { key: 'middle',   label: 'Middle',   time: '20–70 min',   text: data.beatMiddle },
    { key: 'escalate', label: 'Escalate', time: '70–100 min',  text: data.beatEscalate },
    { key: 'close',    label: 'Close',    time: '100–120 min', text: data.beatClose },
  ];

  function buildBeatsCard(done) {
    const rows = BEAT_DEFS.map(b => {
      const checked = beats[b.key];
      const ts = beats.times?.[b.key] || '';
      return `<div class="run-beat${checked ? ' run-beat-done' : ''}" data-beat="${b.key}">
        <button class="run-beat-cb${checked ? ' checked' : ''}" data-beat="${b.key}"></button>
        <div class="run-beat-text">
          <span class="run-beat-label">${esc(b.label)}</span>
          <span class="run-beat-time">${esc(b.time)}</span>
          ${ts ? `<span class="run-beat-ts">${esc(ts)}</span>` : ''}
          ${b.text ? `<span class="run-beat-preview">${esc(b.text.slice(0,70))}${b.text.length > 70 ? '…' : ''}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    return `<div class="run-card" id="run-beats-card">
      <div class="run-card-head">
        <span class="run-card-title">SESSION BEATS</span>
        <span class="run-progress-badge">${done}/4</span>
      </div>
      ${rows}
    </div>`;
  }

  function wireBeats() {
    app.querySelectorAll('.run-beat-cb').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.beat;
        beats[k] = !beats[k];
        if (beats[k]) {
          beats.times = beats.times || {};
          beats.times[k] = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
          if (beats.times) delete beats.times[k];
        }
        saveJ(BEAT_KEY, beats);
        const done = ['open','middle','escalate','close'].filter(k => beats[k]).length;
        const card = app.querySelector('#run-beats-card');
        if (card) { card.outerHTML = buildBeatsCard(done); wireBeats(); }
      });
    });
  }

  // ── LIVE NOTES (encounter scratchpad, promotable to the session record) ──────
  function buildNotesCard() {
    return `<div class="run-card run-notes-card" id="run-notes-card">
      <div class="run-card-head">
        <span class="run-card-title">LIVE NOTES</span>
        <button class="run-sm-btn" id="btn-notes-promote" title="Append these notes to this session's permanent Session Notes">↥ Save to Session</button>
      </div>
      <textarea id="run-notes-text" class="run-notes-textarea" placeholder="Jot quick notes as you play — twists, surprises, things to follow up on next time…">${esc(notes.text)}</textarea>
      <div class="run-notes-foot">
        <span class="run-notes-hint">${notes.lastSavedAt ? `Last saved to session ${esc(notes.lastSavedAt)}` : 'Saved locally as you type — nothing leaves this device until you promote it'}</span>
        <button class="run-sm-btn run-sm-danger" id="btn-notes-clear" title="Clear the scratchpad">Clear</button>
      </div>
    </div>`;
  }

  function wireNotes() {
    const card = app.querySelector('#run-notes-card');
    if (!card) return;
    const ta = card.querySelector('#run-notes-text');
    let saveTimer = null;

    ta?.addEventListener('input', () => {
      notes.text = ta.value;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveJ(NOTES_KEY, notes), 350);
    });

    card.querySelector('#btn-notes-clear')?.addEventListener('click', async () => {
      if (!notes.text.trim()) return;
      const ok = await showConfirm(
        'Clear your live notes? This only empties the local scratchpad — anything you already saved to the session stays in its permanent record.',
        { title: 'Clear Live Notes', confirmLabel: 'Clear' }
      );
      if (!ok) return;
      notes.text = '';
      saveJ(NOTES_KEY, notes);
      ta.value = '';
    });

    card.querySelector('#btn-notes-promote')?.addEventListener('click', async () => {
      const text = notes.text.trim();
      if (!text) return;
      const ok = await showConfirm(
        "Append these notes to this session's permanent Session Notes? This updates the saved session record (and its exported markdown/PDF).",
        { title: 'Save to Session', confirmLabel: 'Save' }
      );
      if (!ok) return;

      const btn = card.querySelector('#btn-notes-promote');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (!res.ok) throw new Error('Could not load the session record.');
        const full = await res.json();
        const fresh = { ...(full.data || {}), id: full.id || id };
        const stamp = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
        const block = `--- Live notes (${stamp}) ---\n${text}`;
        fresh.sessionNotes = fresh.sessionNotes ? `${fresh.sessionNotes}\n\n${block}` : block;

        const saveRes = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fresh),
        });
        const result = await saveRes.json();
        if (!saveRes.ok) throw new Error(result.error || 'Save failed.');

        data.sessionNotes = fresh.sessionNotes;
        notes = { text: '', lastSavedAt: stamp };
        saveJ(NOTES_KEY, notes);
        showToast('Notes saved to the session record.', 'success');
        reRenderNotes();
        const notesBody = app.querySelector('.run-section[data-section="notes"] .run-section-body');
        if (notesBody) {
          notesBody.innerHTML = `<div class="run-prose-block">${nl(data.sessionNotes)}</div>`;
        } else if (!combatMode.active) {
          // The Session Notes section didn't exist yet (session had none before) — rebuild to show it.
          mount();
        }
      } catch (err) {
        showToast(err.message || 'Failed to save notes.', 'error');
        btn.disabled = false;
        btn.textContent = '↥ Save to Session';
      }
    });
  }

  function reRenderNotes() {
    const card = app.querySelector('#run-notes-card');
    if (!card) return;
    card.outerHTML = buildNotesCard();
    wireNotes();
  }

  // ── INITIATIVE ────────────────────────────────────────────────────────────────
  const CONDITIONS = ['blinded','charmed','exhausted','frightened','grappled',
                      'incapacitated','paralyzed','poisoned','prone','restrained',
                      'stunned','unconscious'];

  function activeCombatant() {
    return init.activeIdx >= 0 ? init.combatants[init.activeIdx] : null;
  }

  function buildInitCard() {
    const sorted = [...init.combatants].sort((a,b) => b.initiative - a.initiative);
    const active = activeCombatant();

    const rows = sorted.map(c => {
      const isActive = active?.id === c.id;
      const hasHp = c.hp != null;
      const pct = hasHp ? (c.maxHp ? Math.max(0, Math.min(100, c.hp / c.maxHp * 100)) : 100) : 100;
      const hpCls = pct > 60 ? 'hp-good' : pct > 25 ? 'hp-mid' : 'hp-low';
      const conds = (c.conditions || []).map(x => `<span class="run-cond-tag">${esc(x)}</span>`).join('');

      return `<div class="run-combatant${isActive ? ' active' : ''}${c.type === 'monster' ? ' monster' : ''}" data-cid="${esc(c.id)}">
        <div class="run-combatant-row">
          <span class="run-init-num">${esc(c.initiative)}</span>
          <span class="run-combatant-name" title="Click to toggle conditions">${esc(c.name)}</span>
          ${hasHp ? `<div class="run-hp-wrap">
            <span class="run-hp-cur ${hpCls}" contenteditable="true" data-cid="${esc(c.id)}" title="Edit HP">${esc(c.hp)}</span>
            ${c.maxHp != null ? `<span class="run-hp-sep">/</span><span class="run-hp-max">${esc(c.maxHp)}</span>` : ''}
          </div>` : ''}
          ${c.ac != null ? `<span class="run-ac">⛊${esc(c.ac)}</span>` : ''}
          <button class="run-comb-edit" data-cid="${esc(c.id)}" title="Edit">✎</button>
          <button class="run-comb-del" data-cid="${esc(c.id)}" title="Remove">×</button>
        </div>
        ${conds ? `<div class="run-cond-tags">${conds}</div>` : ''}
        <div class="run-cond-panel" data-cid="${esc(c.id)}" style="display:none">
          ${CONDITIONS.map(cond => `<button class="run-cond-toggle${(c.conditions||[]).includes(cond) ? ' on' : ''}" data-cid="${esc(c.id)}" data-cond="${esc(cond)}">${esc(cond)}</button>`).join('')}
        </div>
      </div>`;
    }).join('') || '<p class="run-empty-state">No combatants. Click + Add to begin.</p>';

    const activeName = active ? esc(active.name) : 'Not started';

    const unadded = partyRoster.filter(m => m.name && !init.combatants.some(c => c.name === m.name));
    const quickAdd = partyRoster.length ? `<div class="run-party-quickadd">
      <span class="run-party-quickadd-label">Quick add:</span>
      ${unadded.length
        ? unadded.map(m => `<button class="run-party-chip" data-name="${escAttr(m.name)}" title="Add ${escAttr(m.name)} to initiative">+ ${esc(m.name)}</button>`).join('')
        : '<span class="run-party-quickadd-done">Whole party added</span>'}
    </div>` : '';

    return `<div class="run-card" id="run-init-card">
      <div class="run-card-head">
        <span class="run-card-title">INITIATIVE</span>
        <span class="run-progress-badge">Round ${esc(String(init.round))}</span>
      </div>
      <div class="run-init-toolbar">
        <button class="run-sm-btn" id="btn-ic-add">+ Add</button>
        <button class="run-sm-btn" id="btn-ic-sort">↓ Sort</button>
        <button class="run-sm-btn run-sm-danger" id="btn-ic-reset">↺ Reset</button>
        ${!isPopout ? `<button class="run-sm-btn run-init-popout-btn" id="btn-ic-popout" title="Open the initiative tracker in its own window — handy for a second monitor or TV">⤢ Pop Out</button>` : ''}
      </div>
      ${quickAdd}
      <div id="init-add-form" class="run-add-form" style="display:none">
        <input id="ia-name" class="run-add-inp" placeholder="Name" type="text">
        <input id="ia-init" class="run-add-inp" placeholder="Init" type="number" style="width:52px">
        <input id="ia-hp"   class="run-add-inp" placeholder="HP" title="Optional — leave blank to skip HP tracking" type="number" style="width:52px">
        <input id="ia-ac"   class="run-add-inp" placeholder="AC" title="Optional — leave blank to skip AC display" type="number" style="width:52px">
        <select id="ia-type" class="run-add-inp" style="width:84px">
          <option value="player">Player</option>
          <option value="monster">Monster</option>
          <option value="npc">NPC</option>
        </select>
        <button class="run-sm-btn" id="ia-ok">Add</button>
        <button class="run-sm-btn" id="ia-cancel">✕</button>
      </div>
      <div id="run-combatants">${rows}</div>
      <div class="run-init-footer">
        <button class="run-turn-btn" id="btn-prev-turn">◀ Prev</button>
        <span class="run-active-name">${activeName}</span>
        <button class="run-turn-btn run-turn-next" id="btn-next-turn">Next ▶</button>
      </div>
    </div>`;
  }

  function wireInitiative() {
    const addForm = app.querySelector('#init-add-form');
    const nameInp = app.querySelector('#ia-name');
    const initInp = app.querySelector('#ia-init');
    const hpInp   = app.querySelector('#ia-hp');
    const acInp   = app.querySelector('#ia-ac');
    const typeSel = app.querySelector('#ia-type');
    const okBtn   = app.querySelector('#ia-ok');

    function resetForm() {
      delete addForm.dataset.editingId;
      okBtn.textContent = 'Add';
      nameInp.value = '';
      initInp.value = '';
      hpInp.value = '';
      acInp.value = '';
      typeSel.value = 'player';
    }

    function openForEdit(c) {
      addForm.dataset.editingId = c.id;
      okBtn.textContent = 'Save';
      nameInp.value = c.name;
      initInp.value = c.initiative;
      hpInp.value = c.maxHp ?? '';
      acInp.value = c.ac ?? '';
      typeSel.value = c.type;
      addForm.style.display = 'flex';
      nameInp.focus();
    }

    app.querySelector('#btn-ic-popout')?.addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?popout=initiative`;
      if (window.dndApp?.openPopoutWindow) {
        // Electron app: open a real app window (not the OS default browser).
        window.dndApp.openPopoutWindow(url, { width: 420, height: 640 });
      } else {
        // Browser dev mode: a named popup window is the closest equivalent.
        const w = window.open(url, `dnd-initiative-${id}`, 'width=420,height=640,resizable=yes,scrollbars=yes');
        if (w) w.focus();
      }
    });

    app.querySelector('#btn-ic-add')?.addEventListener('click', () => {
      const willOpen = addForm.style.display === 'none';
      if (willOpen) resetForm();
      addForm.style.display = willOpen ? 'flex' : 'none';
      if (willOpen) nameInp.focus();
    });

    app.querySelector('#ia-cancel')?.addEventListener('click', () => {
      addForm.style.display = 'none';
      resetForm();
    });

    app.querySelector('#ia-ok')?.addEventListener('click', saveCombatant);
    nameInp?.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveCombatant();
    });

    function saveCombatant() {
      const name = nameInp.value.trim();
      if (!name) return;
      const hpRaw = hpInp.value.trim();
      const acRaw = acInp.value.trim();
      const hp = hpRaw === '' ? null : Math.max(0, parseInt(hpRaw) || 0);
      const ac = acRaw === '' ? null : Math.max(0, parseInt(acRaw) || 0);
      const initiative = parseInt(initInp.value) || 0;
      const type = typeSel.value;
      const editingId = addForm.dataset.editingId;

      if (editingId) {
        const c = init.combatants.find(x => x.id === editingId);
        if (c) {
          c.name = name;
          c.initiative = initiative;
          c.ac = ac;
          c.maxHp = hp;
          if (hp == null) c.hp = null;
          else if (c.hp == null) c.hp = hp;
          else c.hp = Math.min(c.hp, hp);
          c.type = type;
        }
      } else {
        init.combatants.push({
          id: genId(),
          name,
          initiative,
          hp,
          maxHp: hp,
          ac,
          type,
          conditions: [],
        });
      }

      addForm.style.display = 'none';
      resetForm();
      saveJ(INIT_KEY, init);
      reRenderInit();
    }

    app.querySelectorAll('.run-party-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        init.combatants.push({
          id: genId(),
          name: btn.dataset.name,
          initiative: 0,
          hp: null,
          maxHp: null,
          ac: null,
          type: 'player',
          conditions: [],
        });
        saveJ(INIT_KEY, init);
        reRenderInit();
      });
    });

    app.querySelectorAll('.run-comb-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = init.combatants.find(x => x.id === btn.dataset.cid);
        if (c) openForEdit(c);
      });
    });

    app.querySelector('#btn-ic-sort')?.addEventListener('click', () => {
      init.combatants.sort((a,b) => b.initiative - a.initiative || a.name.localeCompare(b.name));
      saveJ(INIT_KEY, init);
      reRenderInit();
    });

    app.querySelector('#btn-ic-reset')?.addEventListener('click', async () => {
      const ok = await showConfirm('Clear the initiative tracker?', { title: 'Reset Initiative' });
      if (!ok) return;
      init = { combatants: [], round: 1, activeIdx: -1 };
      saveJ(INIT_KEY, init);
      reRenderInit();
    });

    app.querySelector('#btn-next-turn')?.addEventListener('click', () => {
      const n = init.combatants.length;
      if (!n) return;
      init.activeIdx = (init.activeIdx + 1) % n;
      if (init.activeIdx === 0) init.round++;
      saveJ(INIT_KEY, init);
      reRenderInit();
    });

    app.querySelector('#btn-prev-turn')?.addEventListener('click', () => {
      const n = init.combatants.length;
      if (!n) return;
      if (init.activeIdx <= 0) {
        init.activeIdx = n - 1;
        if (init.round > 1) init.round--;
      } else {
        init.activeIdx--;
      }
      saveJ(INIT_KEY, init);
      reRenderInit();
    });

    app.querySelectorAll('.run-comb-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.cid;
        const idx = init.combatants.findIndex(c => c.id === cid);
        if (idx < 0) return;
        init.combatants.splice(idx, 1);
        if (init.activeIdx >= init.combatants.length)
          init.activeIdx = Math.max(-1, init.combatants.length - 1);
        saveJ(INIT_KEY, init);
        reRenderInit();
      });
    });

    // Inline HP edit
    app.querySelectorAll('.run-hp-cur').forEach(el => {
      el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
      el.addEventListener('blur', () => {
        const cid = el.dataset.cid;
        const c = init.combatants.find(c => c.id === cid);
        if (!c) return;
        c.hp = Math.max(0, parseInt(el.textContent) || 0);
        saveJ(INIT_KEY, init);
        const pct = c.maxHp ? Math.max(0, Math.min(100, c.hp / c.maxHp * 100)) : 100;
        el.className = `run-hp-cur ${pct > 60 ? 'hp-good' : pct > 25 ? 'hp-mid' : 'hp-low'}`;
      });
    });

    // Conditions panel toggle
    app.querySelectorAll('.run-combatant-name').forEach(el => {
      el.addEventListener('click', () => {
        const panel = el.closest('.run-combatant')?.querySelector('.run-cond-panel');
        if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
      });
    });

    app.querySelectorAll('.run-cond-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const { cid, cond } = btn.dataset;
        const c = init.combatants.find(c => c.id === cid);
        if (!c) return;
        c.conditions = c.conditions || [];
        const i = c.conditions.indexOf(cond);
        i < 0 ? c.conditions.push(cond) : c.conditions.splice(i, 1);
        btn.classList.toggle('on', c.conditions.includes(cond));
        saveJ(INIT_KEY, init);
        // Update tag display without full re-render
        const row = btn.closest('.run-combatant');
        let tagsDiv = row?.querySelector('.run-cond-tags');
        if (!tagsDiv) {
          tagsDiv = document.createElement('div');
          tagsDiv.className = 'run-cond-tags';
          row?.querySelector('.run-combatant-row')?.after(tagsDiv);
        }
        tagsDiv.innerHTML = c.conditions.map(x => `<span class="run-cond-tag">${esc(x)}</span>`).join('');
      });
    });
  }

  function reRenderInit() {
    const card = app.querySelector('#run-init-card');
    if (!card) return;
    card.outerHTML = buildInitCard();
    wireInitiative();
  }

  // ── COLLAPSIBLE SECTIONS ──────────────────────────────────────────────────────
  function sectionIsOpen(key, def) {
    return sects[key] !== undefined ? sects[key] : def;
  }

  function buildSection(key, title, content, defaultOpen) {
    if (!content) return '';
    const open = sectionIsOpen(key, defaultOpen);
    return `<div class="run-section${open ? ' open' : ''}" data-section="${key}">
      <div class="run-section-head">
        <span class="run-section-arrow">${open ? '▼' : '▶'}</span>
        <span class="run-section-title">${esc(title)}</span>
      </div>
      <div class="run-section-body" style="${open ? '' : 'display:none'}">
        ${content}
      </div>
    </div>`;
  }

  function buildAllSections() {
    const parts = [];

    // Opening read-aloud
    if (data.openingReadAloud || data.threeOptionsPrompt) {
      let html = '';
      if (data.openingReadAloud) html += `<div class="run-read-aloud">${nl(data.openingReadAloud)}</div>`;
      if (data.threeOptionsPrompt) html += `<div class="run-prose-block"><strong>Three Options:</strong> ${nl(data.threeOptionsPrompt)}</div>`;
      parts.push(buildSection('opening', 'Opening Read-Aloud', html, true));
    }

    // NPCs
    const npcs = data.npcs || [];
    if (npcs.length) {
      const html = npcs.map(n => `
        <div class="run-npc-card">
          <div class="run-npc-name">${esc(n.name)}${n.faction ? `<span class="run-npc-faction"> · ${esc(n.faction)}</span>` : ''}</div>
          ${n.situation ? `<div class="run-npc-row"><span class="run-npc-lbl">Situation</span> ${esc(n.situation)}</div>` : ''}
          ${n.wants     ? `<div class="run-npc-row"><span class="run-npc-lbl">Wants</span> ${esc(n.wants)}</div>` : ''}
          ${n.phrases   ? `<div class="run-npc-row run-npc-phrase"><span class="run-npc-lbl">Says</span> "${esc(n.phrases)}"</div>` : ''}
          ${n.bodyLanguage ? `<div class="run-npc-row"><span class="run-npc-lbl">Body</span> ${esc(n.bodyLanguage)}</div>` : ''}
          ${n.corneredLine ? `<div class="run-npc-row run-npc-phrase"><span class="run-npc-lbl">Cornered</span> "${esc(n.corneredLine)}"</div>` : ''}
          ${n.neverDoes ? `<div class="run-npc-row"><span class="run-npc-lbl">Never</span> ${esc(n.neverDoes)}</div>` : ''}
        </div>`).join('');
      parts.push(buildSection('npcs', `NPCs (${npcs.length})`, html, true));
    }

    // Locations
    const locs = data.locations || [];
    if (locs.length) {
      const html = locs.map(l => `
        <div class="run-location-card">
          <div class="run-npc-name">${esc(l.name)}</div>
          ${l.description  ? `<div class="run-prose-block">${nl(l.description)}</div>` : ''}
          ${l.sensoryDetail ? `<div class="run-npc-row"><span class="run-npc-lbl">Sensory</span> ${esc(l.sensoryDetail)}</div>` : ''}
          ${l.hiddenDetail  ? `<div class="run-npc-row"><span class="run-npc-lbl">Hidden</span> ${esc(l.hiddenDetail)}</div>` : ''}
          ${(l.districts||[]).filter(d=>d.name).map(d => `
            <div class="run-district">
              <div class="run-district-name">↳ ${esc(d.name)}</div>
              ${d.readAloud ? `<div class="run-prose-block small">${nl(d.readAloud)}</div>` : ''}
              ${(d.pointsOfInterest||[]).filter(p=>p.name||p.description).map(p =>
                `<div class="run-poi">• ${p.name ? `<strong>${esc(p.name)}</strong>` : ''}${p.description ? ` — ${esc(p.description)}` : ''}</div>`
              ).join('')}
            </div>`).join('')}
        </div>`).join('');
      parts.push(buildSection('locations', `Locations (${locs.length})`, html, false));
    }

    // Faction clocks
    const clocks = data.factionClocks || [];
    if (clocks.length) {
      const html = clocks.map(c => {
        const prog = parseInt(c.progress) || 0;
        const max  = parseInt(c.max) || 8;
        const pct  = Math.min(100, (prog / max) * 100);
        return `
        <div class="run-clock-card">
          <div class="run-clock-row">
            <span class="run-npc-name" style="margin:0">${esc(c.factionName)}</span>
            <span class="run-clock-count">${prog}/${max}</span>
          </div>
          <div class="run-clock-track"><div class="run-clock-fill" style="width:${pct}%"></div></div>
          ${c.goal       ? `<div class="run-npc-row"><span class="run-npc-lbl">Goal</span> ${esc(c.goal)}</div>` : ''}
          ${c.completion ? `<div class="run-npc-row"><span class="run-npc-lbl">Resolves</span> ${esc(c.completion)}</div>` : ''}
        </div>`;
      }).join('');
      parts.push(buildSection('clocks', `Faction Clocks (${clocks.length})`, html, false));
    }

    // Combat encounters
    const encs = data.encounters || [];
    if (encs.length) {
      const html = encs.map(e => `
        <div class="run-enc-card">
          <div class="run-enc-head">
            <span class="run-npc-name" style="margin:0">${esc(e.name)}</span>
            ${e.encounterPlanId ? `<a href="/encounter/view/${esc(e.encounterPlanId)}" class="run-enc-link" target="_blank">Open Plan ↗</a>` : ''}
          </div>
          ${e.summary ? `<div class="run-prose-block small">${nl(e.summary)}</div>` : ''}
        </div>`).join('');
      parts.push(buildSection('encounters', `Combat Encounters (${encs.length})`, html, false));
    }

    // Session notes
    if (data.sessionNotes) {
      parts.push(buildSection('notes', 'Session Notes', `<div class="run-prose-block">${nl(data.sessionNotes)}</div>`, true));
    }

    // Continuity recap
    const hasCont = data.sessionRecap || data.unresolvedThreads;
    if (hasCont) {
      let html = '';
      if (data.sessionRecap) html += `<div class="run-npc-row"><span class="run-npc-lbl">Recap</span> ${esc(data.sessionRecap)}</div>`;
      if (data.unresolvedThreads) html += `<div class="run-npc-row"><span class="run-npc-lbl">Threads</span> <pre class="run-pre">${esc(data.unresolvedThreads)}</pre></div>`;
      parts.push(buildSection('continuity', 'Continuity', html, false));
    }

    return parts.join('');
  }

  // ── COMBAT ENCOUNTER MODE ─────────────────────────────────────────────────────
  const combatEncounterCache = {}; // encounterPlanId -> encounter object | 'loading' | 'error'

  function combatEncounterOptions() {
    return (data.encounters || []).filter(e => e.name);
  }

  function selectedCombatEncounter() {
    if (combatMode.selection === 'blank') return null;
    const opts = combatEncounterOptions();
    return opts[parseInt(combatMode.selection)] || null;
  }

  async function loadCombatEncounter(planId) {
    if (combatEncounterCache[planId]) return;
    combatEncounterCache[planId] = 'loading';
    try {
      const res = await fetch(`/api/encounters/${encodeURIComponent(planId)}`);
      if (!res.ok) throw new Error();
      combatEncounterCache[planId] = await res.json();
    } catch {
      combatEncounterCache[planId] = 'error';
    }
    const sel = selectedCombatEncounter();
    if (combatMode.active && sel?.encounterPlanId === planId) refreshCombatContent();
  }

  function buildCombatContent() {
    const sel = selectedCombatEncounter();

    if (!sel) {
      return `<p class="run-empty-state">No encounter selected — running this fight off the cuff. Use the initiative tracker below to keep things moving.</p>`;
    }

    if (!sel.encounterPlanId) {
      return `<div class="run-combat-summary">
        <h3 class="run-npc-name">${esc(sel.name)}</h3>
        ${sel.summary ? `<div class="run-prose-block">${nl(sel.summary)}</div>` : '<p class="run-empty-state">No additional details recorded for this encounter.</p>'}
      </div>`;
    }

    const cached = combatEncounterCache[sel.encounterPlanId];
    if (!cached || cached === 'loading') {
      loadCombatEncounter(sel.encounterPlanId);
      return `<p class="run-empty-state">Loading encounter plan…</p>`;
    }
    if (cached === 'error') {
      return `<p class="run-empty-state">Couldn't load the full plan. <a href="/encounter/view/${esc(sel.encounterPlanId)}" target="_blank" class="run-enc-link">Open it directly ↗</a></p>`;
    }
    return `<div class="run-combat-full">
      <div class="run-enc-head">
        <span class="run-npc-name" style="margin:0">${esc(cached.name || sel.name)}</span>
        <a href="/encounter/view/${esc(sel.encounterPlanId)}" class="run-enc-link" target="_blank">Open Plan ↗</a>
      </div>
      <div class="markdown-body run-combat-markdown">${marked.parse(WikiLinks.preprocessMarkdown(cached.markdown || ''))}</div>
    </div>`;
  }

  function refreshCombatContent() {
    const el = app.querySelector('#run-combat-content');
    if (el) el.innerHTML = buildCombatContent();
  }

  function buildCombatMode() {
    const opts = combatEncounterOptions();
    return `<div class="run-combat-mode">
      <div class="run-card run-combat-card">
        <div class="run-card-head">
          <span class="run-card-title">COMBAT ENCOUNTER</span>
        </div>
        <div class="run-combat-toolbar">
          <label class="run-combat-picker-label" for="combat-enc-select">Encounter</label>
          <select id="combat-enc-select" class="run-add-inp" style="flex:none; min-width:240px;">
            <option value="blank"${combatMode.selection === 'blank' ? ' selected' : ''}>— Blank / Unplanned Encounter —</option>
            ${opts.map((e,i) => `<option value="${i}"${combatMode.selection === String(i) ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}
          </select>
        </div>
        <div id="run-combat-content" class="run-combat-content">${buildCombatContent()}</div>
      </div>
      ${buildInitCard()}
      ${buildNotesCard()}
    </div>`;
  }

  function wireCombatMode() {
    app.querySelector('#combat-enc-select')?.addEventListener('change', e => {
      combatMode.selection = e.target.value;
      saveJ(COMBAT_KEY, combatMode);
      refreshCombatContent();
    });
    wireInitiative();
  }

  function wireCombatToggle() {
    app.querySelector('#btn-combat-toggle')?.addEventListener('click', () => {
      combatMode.active = !combatMode.active;
      saveJ(COMBAT_KEY, combatMode);
      mount();
    });
  }

  // ── QUICK LOOKUP (NPC & location side panel) ──────────────────────────────────
  const lookupDetailCache = {}; // `${kind}:${id}` -> full record | 'loading' | 'error'

  function lookupRow(kind, item, teaser) {
    return `<div class="run-lookup-item" data-kind="${kind}" data-id="${esc(item.id)}">
      <button class="run-lookup-item-head" data-kind="${kind}" data-id="${esc(item.id)}">
        <span class="run-lookup-item-meta">
          <span class="run-lookup-item-name">${esc(item.name)}</span>
          <span class="run-lookup-item-id">${esc(item.id)}</span>
        </span>
        <span class="run-lookup-item-arrow">▸</span>
      </button>
      ${teaser ? `<div class="run-lookup-item-teaser">${esc(teaser.length > 90 ? teaser.slice(0, 90) + '…' : teaser)}</div>` : ''}
      <div class="run-lookup-item-detail" style="display:none"></div>
    </div>`;
  }

  function buildLookupResults(query) {
    const q = query.trim().toLowerCase();
    const matchNpc = n => !q || n.name.toLowerCase().includes(q) || (n.nickname || '').toLowerCase().includes(q);
    const matchLoc = l => !q || l.name.toLowerCase().includes(q);
    const npcs = npcIndex.filter(matchNpc);
    const locs = locationIndex.filter(matchLoc);

    if (!npcs.length && !locs.length) {
      return `<p class="run-empty-state">${q ? 'No NPCs or locations match.' : 'No NPCs or locations in this campaign yet.'}</p>`;
    }

    const npcHtml = npcs.map(n => lookupRow('npc', n, n.situation || n.nickname)).join('');
    const locHtml = locs.map(l => lookupRow('location', l, l.description || l.government)).join('');

    return `
      ${npcs.length ? `<div class="run-lookup-group"><div class="run-lookup-group-label">NPCs (${npcs.length})</div>${npcHtml}</div>` : ''}
      ${locs.length ? `<div class="run-lookup-group"><div class="run-lookup-group-label">Locations (${locs.length})</div>${locHtml}</div>` : ''}
    `;
  }

  function npcDetailHtml(n) {
    const rows = [
      n.situation      && ['Situation', n.situation],
      n.wantsNeeds     && ['Wants',     n.wantsNeeds],
      n.commonPhrase   && ['Says',      `"${n.commonPhrase}"`],
      n.appearance     && ['Looks',     n.appearance],
      n.secretObstacle && ['Secret',    n.secretObstacle],
    ].filter(Boolean);
    if (!rows.length) return '<p class="run-empty-state">No roleplay notes recorded for this NPC.</p>';
    return rows.map(([lbl, val]) => `<div class="run-npc-row"><span class="run-npc-lbl">${esc(lbl)}</span> ${esc(val)}</div>`).join('');
  }

  function locationDetailHtml(l) {
    const parts = [];
    if (l.description)   parts.push(`<div class="run-prose-block small">${nl(l.description)}</div>`);
    if (l.sensoryDetail) parts.push(`<div class="run-npc-row"><span class="run-npc-lbl">Sensory</span> ${esc(l.sensoryDetail)}</div>`);
    if (l.hiddenDetail)  parts.push(`<div class="run-npc-row"><span class="run-npc-lbl">Hidden</span> ${esc(l.hiddenDetail)}</div>`);
    if (!parts.length) return '<p class="run-empty-state">No details recorded for this location.</p>';
    return parts.join('');
  }

  function buildLookupPanel() {
    return `
      <div class="run-lookup-backdrop" id="run-lookup-backdrop"></div>
      <aside class="run-lookup-panel" id="run-lookup-panel">
        <div class="run-lookup-head">
          <div class="run-lookup-head-copy">
            <span class="run-card-title">QUICK LOOKUP</span>
            <span class="run-lookup-subtitle">NPCs and locations for the active campaign.</span>
          </div>
          <button class="run-lookup-close" id="btn-lookup-close" title="Close">×</button>
        </div>
        <input type="text" id="lookup-search" class="run-add-inp run-lookup-search" placeholder="Search NPCs &amp; locations…">
        <div class="run-lookup-results" id="lookup-results">${buildLookupResults('')}</div>
      </aside>
    `;
  }

  function wireLookup() {
    const panel    = app.querySelector('#run-lookup-panel');
    const backdrop = app.querySelector('#run-lookup-backdrop');
    const toggle   = app.querySelector('#btn-lookup-toggle');
    const search   = app.querySelector('#lookup-search');
    const results  = app.querySelector('#lookup-results');
    if (!panel) return;

    const openPanel  = () => { panel.classList.add('open'); backdrop.classList.add('open'); search.focus(); };
    const closePanel = () => { panel.classList.remove('open'); backdrop.classList.remove('open'); };

    toggle?.addEventListener('click', () => panel.classList.contains('open') ? closePanel() : openPanel());
    app.querySelector('#btn-lookup-close')?.addEventListener('click', closePanel);
    backdrop?.addEventListener('click', closePanel);

    function wireResultItems() {
      results.querySelectorAll('.run-lookup-item-head').forEach(head => {
        head.addEventListener('click', async () => {
          const item   = head.closest('.run-lookup-item');
          const detail = item.querySelector('.run-lookup-item-detail');
          const arrow  = head.querySelector('.run-lookup-item-arrow');
          const { kind, id: itemId } = head.dataset;
          const cacheKey = `${kind}:${itemId}`;
          const opening = detail.style.display === 'none';

          if (opening && !lookupDetailCache[cacheKey]) {
            lookupDetailCache[cacheKey] = 'loading';
            detail.innerHTML = '<p class="run-empty-state">Loading…</p>';
            detail.style.display = 'block';
            arrow.textContent = '▾';
            try {
              const res = await fetch(`/api/${kind === 'npc' ? 'npcs' : 'locations'}/${encodeURIComponent(itemId)}`);
              if (!res.ok) throw new Error();
              const full = await res.json();
              lookupDetailCache[cacheKey] = full;
            } catch {
              lookupDetailCache[cacheKey] = 'error';
            }
            const cached = lookupDetailCache[cacheKey];
            detail.innerHTML = cached === 'error'
              ? '<p class="run-empty-state">Couldn’t load details.</p>'
              : (kind === 'npc' ? npcDetailHtml(cached) : locationDetailHtml(cached));
            return;
          }

          const cached = lookupDetailCache[cacheKey];
          if (opening && cached && cached !== 'loading') {
            detail.innerHTML = cached === 'error'
              ? '<p class="run-empty-state">Couldn’t load details.</p>'
              : (kind === 'npc' ? npcDetailHtml(cached) : locationDetailHtml(cached));
          }
          detail.style.display = opening ? 'block' : 'none';
          arrow.textContent = opening ? '▾' : '▸';
        });
      });
    }

    search?.addEventListener('input', () => {
      results.innerHTML = buildLookupResults(search.value);
      wireResultItems();
    });

    wireResultItems();
  }

  function wireSections() {
    app.querySelectorAll('.run-section-head').forEach(head => {
      head.addEventListener('click', () => {
        const sec  = head.closest('.run-section');
        const key  = sec.dataset.section;
        const body = sec.querySelector('.run-section-body');
        const arr  = sec.querySelector('.run-section-arrow');
        const open = sec.classList.toggle('open');
        body.style.display = open ? '' : 'none';
        arr.textContent    = open ? '▼' : '▶';
        sects[key] = open;
        saveJ(SECT_KEY, sects);
      });
    });
  }

  // ── Wire all ──────────────────────────────────────────────────────────────────
  function wireAll() {
    if (isPopout) {
      wireInitiative();
      return;
    }
    wireCombatToggle();
    wireLookup();
    if (combatMode.active) {
      wireCombatMode();
      wireNotes();
    } else {
      wireBeats();
      wireInitiative();
      wireNotes();
      wireSections();
    }
  }

  // Keep the initiative tracker in sync across windows (main run page ⇄ pop-out).
  // The `storage` event only fires in *other* same-origin windows/tabs, so each
  // side picks up the other's edits without polling.
  window.addEventListener('storage', e => {
    if (e.key !== INIT_KEY) return;
    init = loadJ(INIT_KEY, init);
    reRenderInit();
  });

  mount();
})();
