(async function () {
  'use strict';
  const id  = location.pathname.split('/').pop();
  const app = document.getElementById('run-app');

  // ── Fetch session ─────────────────────────────────────────────────────────────
  let session;
  try {
    const res = await fetch(`/api/sessions/${id}`);
    if (!res.ok) throw new Error();
    session = await res.json();
  } catch {
    app.innerHTML = `<div class="run-error"><p>Session not found.</p><a href="/" class="btn btn-ghost">← Back</a></div>`;
    return;
  }

  const data = session.data || {};
  document.title = `▶ Session #${session.sessionNumber} — Run Mode`;

  // ── Persistence ───────────────────────────────────────────────────────────────
  const BEAT_KEY  = `dnd-beats-${id}`;
  const INIT_KEY  = `dnd-init-${id}`;
  const SECT_KEY  = `dnd-sect-${id}`;

  function loadJ(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
  }
  function saveJ(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  let beats = loadJ(BEAT_KEY, { open: false, middle: false, escalate: false, close: false, times: {} });
  let init  = loadJ(INIT_KEY, { combatants: [], round: 1, activeIdx: -1 });
  let sects = loadJ(SECT_KEY, {});

  // ── Util ──────────────────────────────────────────────────────────────────────
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const nl  = s => esc(s).replace(/\n/g, '<br>');

  // ── Full mount ────────────────────────────────────────────────────────────────
  function mount() {
    app.innerHTML = buildPage();
    wireAll();
  }

  function buildPage() {
    const done = ['open','middle','escalate','close'].filter(k => beats[k]).length;
    return `
      <div class="run-header">
        <a href="/view/${esc(id)}" class="run-exit">← Exit Run Mode</a>
        <div class="run-header-center">
          <span class="run-session-num">Session #${esc(session.sessionNumber)}</span>
          ${session.date ? `<span class="run-meta">${esc(session.date)}</span>` : ''}
          ${session.partyLevel ? `<span class="run-meta">Lv ${esc(session.partyLevel)}</span>` : ''}
        </div>
        ${data.sessionGoal ? `<div class="run-goal">${esc(data.sessionGoal)}</div>` : ''}
      </div>

      <div class="run-body">
        <div class="run-top-row">
          ${buildBeatsCard(done)}
          ${buildInitCard()}
        </div>
        ${buildAllSections()}
      </div>
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
      const pct = c.maxHp ? Math.max(0, Math.min(100, c.hp / c.maxHp * 100)) : 100;
      const hpCls = pct > 60 ? 'hp-good' : pct > 25 ? 'hp-mid' : 'hp-low';
      const conds = (c.conditions || []).map(x => `<span class="run-cond-tag">${esc(x)}</span>`).join('');

      return `<div class="run-combatant${isActive ? ' active' : ''}${c.type === 'monster' ? ' monster' : ''}" data-cid="${esc(c.id)}">
        <div class="run-combatant-row">
          <span class="run-init-num">${esc(c.initiative)}</span>
          <span class="run-combatant-name" title="Click to toggle conditions">${esc(c.name)}</span>
          <div class="run-hp-wrap">
            <span class="run-hp-cur ${hpCls}" contenteditable="true" data-cid="${esc(c.id)}" title="Edit HP">${esc(c.hp)}</span>
            <span class="run-hp-sep">/</span>
            <span class="run-hp-max">${esc(c.maxHp)}</span>
          </div>
          ${c.ac ? `<span class="run-ac">⛊${esc(c.ac)}</span>` : ''}
          <button class="run-comb-del" data-cid="${esc(c.id)}" title="Remove">×</button>
        </div>
        ${conds ? `<div class="run-cond-tags">${conds}</div>` : ''}
        <div class="run-cond-panel" data-cid="${esc(c.id)}" style="display:none">
          ${CONDITIONS.map(cond => `<button class="run-cond-toggle${(c.conditions||[]).includes(cond) ? ' on' : ''}" data-cid="${esc(c.id)}" data-cond="${esc(cond)}">${esc(cond)}</button>`).join('')}
        </div>
      </div>`;
    }).join('') || '<p class="run-empty-state">No combatants. Click + Add to begin.</p>';

    const activeName = active ? esc(active.name) : 'Not started';

    return `<div class="run-card" id="run-init-card">
      <div class="run-card-head">
        <span class="run-card-title">INITIATIVE</span>
        <span class="run-progress-badge">Round ${esc(String(init.round))}</span>
      </div>
      <div class="run-init-toolbar">
        <button class="run-sm-btn" id="btn-ic-add">+ Add</button>
        <button class="run-sm-btn" id="btn-ic-sort">↓ Sort</button>
        <button class="run-sm-btn run-sm-danger" id="btn-ic-reset">↺ Reset</button>
      </div>
      <div id="init-add-form" class="run-add-form" style="display:none">
        <input id="ia-name" class="run-add-inp" placeholder="Name" type="text">
        <input id="ia-init" class="run-add-inp" placeholder="Init" type="number" style="width:52px">
        <input id="ia-hp"   class="run-add-inp" placeholder="HP"   type="number" style="width:52px">
        <input id="ia-ac"   class="run-add-inp" placeholder="AC"   type="number" style="width:52px">
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

    app.querySelector('#btn-ic-add')?.addEventListener('click', () => {
      addForm.style.display = addForm.style.display === 'none' ? 'flex' : 'none';
      app.querySelector('#ia-name')?.focus();
    });

    app.querySelector('#ia-cancel')?.addEventListener('click', () => {
      addForm.style.display = 'none';
    });

    app.querySelector('#ia-ok')?.addEventListener('click', addCombatant);
    app.querySelector('#ia-name')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') addCombatant();
    });

    function addCombatant() {
      const name = app.querySelector('#ia-name').value.trim();
      if (!name) return;
      const hp = parseInt(app.querySelector('#ia-hp').value) || 10;
      init.combatants.push({
        id:         Date.now().toString(),
        name,
        initiative: parseInt(app.querySelector('#ia-init').value) || 0,
        hp,
        maxHp:      hp,
        ac:         parseInt(app.querySelector('#ia-ac').value) || 0,
        type:       app.querySelector('#ia-type').value,
        conditions: [],
      });
      saveJ(INIT_KEY, init);
      reRenderInit();
    }

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
    wireBeats();
    wireInitiative();
    wireSections();
  }

  mount();
})();
