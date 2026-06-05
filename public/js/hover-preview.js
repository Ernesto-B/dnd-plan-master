(function () {
  const STORAGE_ENABLED = 'dnd-hover-preview-enabled';
  const STORAGE_DELAY   = 'dnd-hover-preview-delay';
  const cache = new Map();

  const panel = document.createElement('div');
  panel.className = 'hover-preview-panel';
  document.body.appendChild(panel);

  let hoverTimer  = null;
  let currentId   = null;
  let pendingClear = false;

  function isEnabled() { return localStorage.getItem(STORAGE_ENABLED) !== 'false'; }
  function getDelay()  { return parseInt(localStorage.getItem(STORAGE_DELAY) || '500', 10); }

  window.initHoverPreview = function ({ containerId, type, apiBase }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.addEventListener('mouseover', (e) => {
      if (!isEnabled()) return;
      pendingClear = false;
      if (e.target.closest('.action-cell') || e.target.closest('.checkbox-cell')) {
        scheduleHide(); return;
      }
      const row = e.target.closest('.session-row');
      if (!row) { scheduleHide(); return; }
      if (row.dataset.id === currentId) return;
      clearHover();
      currentId = row.dataset.id;
      hoverTimer = setTimeout(() => {
        if (window.isMultiSelectMode && window.isMultiSelectMode()) return;
        showPreview(row, currentId, type, apiBase);
      }, getDelay());
    });

    container.addEventListener('mouseleave', (e) => {
      if (e.relatedTarget && panel.contains(e.relatedTarget)) return;
      clearHover();
    });

    panel.addEventListener('mouseleave', (e) => {
      if (e.relatedTarget && container.contains(e.relatedTarget)) return;
      clearHover();
    });
  };

  function scheduleHide() {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }

  function clearHover() {
    clearTimeout(hoverTimer);
    hoverTimer  = null;
    currentId   = null;
    panel.classList.remove('visible');
  }

  async function showPreview(row, id, type, apiBase) {
    panel.classList.add('visible');
    panel.innerHTML = '<div class="hp-loading">Loading…</div>';
    positionPanel(row);

    let full = cache.get(id);
    if (!full) {
      try {
        const res = await fetch(`${apiBase}/${id}`);
        if (!res.ok) throw new Error();
        full = await res.json();
        cache.set(id, full);
      } catch {
        if (id === currentId) panel.innerHTML = '<div class="hp-loading hp-error">Could not load preview.</div>';
        return;
      }
    }

    if (id !== currentId) return; // user moved away during fetch
    panel.innerHTML = type === 'session' ? buildSessionHTML(full)
                    : type === 'npc'     ? buildNpcHTML(full)
                    : buildEncounterHTML(full);
    positionPanel(row);

    panel.querySelectorAll('.hp-section-head').forEach(head => {
      head.addEventListener('click', () => {
        const body = head.nextElementSibling;
        const open = body.classList.toggle('open');
        head.querySelector('.hp-chevron').textContent = open ? '▲' : '▼';
      });
    });
  }

  // ─── Section helper ─────────────────────────────────────────────────────────
  function section(title, content, defaultOpen = false) {
    if (!content || !content.trim()) return '';
    return `
      <div class="hp-section">
        <div class="hp-section-head">
          <span class="hp-section-title">${esc(title)}</span>
          <span class="hp-chevron">${defaultOpen ? '▲' : '▼'}</span>
        </div>
        <div class="hp-section-body${defaultOpen ? ' open' : ''}">${content}</div>
      </div>`;
  }

  // ─── Session HTML ────────────────────────────────────────────────────────────
  function buildSessionHTML(session) {
    const d      = session.data || {};
    const numRaw = String(session.sessionNumber ?? '?');
    const num    = numRaw.includes('.') ? numRaw : numRaw.padStart(3, '0');
    const date   = session.date
      ? new Date(session.date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      : null;
    const meta = [date, session.partyLevel ? `Lv ${esc(String(session.partyLevel))}` : null].filter(Boolean).join(' · ');

    const parts = [];

    parts.push(`<div class="hp-header">
      <div class="hp-title">Session #${esc(num)}</div>
      ${meta ? `<div class="hp-meta">${meta}</div>` : ''}
      ${tagsHTML(session.tags)}
    </div>`);

    // Goal & Opening Hook — collapsed
    const goalParts = [
      d.sessionGoal        ? field('Goal', esc(d.sessionGoal)) : '',
      d.endState           ? field('End State', esc(d.endState)) : '',
      d.openingReadAloud   ? field('Opening Read-Aloud', `<span class="hp-readout">${esc(d.openingReadAloud)}</span>`) : '',
      d.threeOptionsPrompt ? field('Three-Options Prompt', esc(d.threeOptionsPrompt)) : '',
    ].join('');
    parts.push(section('Goal & Opening Hook', goalParts));

    // Session Beats — EXPANDED
    const beatsRows = [
      ['Open',     '0–20 min',    d.beatOpen],
      ['Middle',   '20–70 min',   d.beatMiddle],
      ['Escalate', '70–100 min',  d.beatEscalate],
      ['Close',    '100–120 min', d.beatClose],
    ].map(([label, time, text]) => `
      <div class="hp-beat">
        <div class="hp-beat-head"><span class="hp-beat-label">${esc(label)}</span><span class="hp-beat-time">${esc(time)}</span></div>
        <div class="hp-beat-body">${esc(text || '—')}</div>
      </div>`).join('');
    parts.push(section('Session Beats', `<div class="hp-beats">${beatsRows}</div>`, true));

    // Campaign Continuity — collapsed
    const contParts = [
      d.sessionRecap ? field('Recap', esc(d.sessionRecap)) : '',
      ...[ ['World-State Changes', d.worldStateChanges],
           ['Unresolved Threads',  d.unresolvedThreads],
           ['NPC Status Changes',  d.npcStatusChanges],
           ['Treasure & Rewards',  d.treasureRewardsLog],
      ].map(([label, raw]) => {
        const items = (raw || '').split('\n').map(s => s.trim()).filter(Boolean);
        return items.length ? field(label, `<ul class="hp-list">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`) : '';
      }),
    ].join('');
    parts.push(section('Campaign Continuity', contParts));

    // NPCs — collapsed
    const npcs = (d.npcs || []).filter(n => n.name);
    if (npcs.length) {
      const npcParts = npcs.map(npc => `
        <div class="hp-entity">
          <div class="hp-entity-name">${esc(npc.name)}${npc.faction ? ` <span class="hp-faction">(${esc(npc.faction)})</span>` : ''}</div>
          ${npc.situation  ? `<p><span class="hp-label">Situation:</span> ${esc(npc.situation)}</p>` : ''}
          ${npc.wants      ? `<p><span class="hp-label">Wants:</span> ${esc(npc.wants)}</p>` : ''}
          ${npc.phrases    ? `<p><span class="hp-label">Phrases:</span> <em>${esc(npc.phrases)}</em></p>` : ''}
          ${npc.neverDoes  ? `<p><span class="hp-label">Never:</span> ${esc(npc.neverDoes)}</p>` : ''}
          ${npc.corneredLine ? `<p><span class="hp-label">If Cornered:</span> <em>"${esc(npc.corneredLine)}"</em></p>` : ''}
        </div>`).join('<hr class="hp-divider">');
      parts.push(section(`NPCs (${npcs.length})`, npcParts));
    }

    // Locations — collapsed
    const locations = (d.locations || []).filter(l => l.name);
    if (locations.length) {
      const locParts = locations.map(loc => `
        <div class="hp-entity">
          <div class="hp-entity-name">${esc(loc.name)}</div>
          ${loc.description   ? `<p>${esc(loc.description)}</p>` : ''}
          ${loc.sensoryDetail ? `<p><span class="hp-label">Sensory:</span> ${esc(loc.sensoryDetail)}</p>` : ''}
          ${loc.hiddenDetail  ? `<p><span class="hp-label">Hidden:</span> ${esc(loc.hiddenDetail)}</p>` : ''}
        </div>`).join('<hr class="hp-divider">');
      parts.push(section(`Locations (${locations.length})`, locParts));
    }

    // Faction Clocks — collapsed
    const clocks = (d.factionClocks || []).filter(c => c.factionName);
    if (clocks.length) {
      const clockParts = clocks.map(clk => {
        const prog = parseInt(clk.progress) || 0;
        const max  = parseInt(clk.max) || 8;
        const pct  = Math.round((prog / max) * 100);
        return `
          <div class="hp-clock">
            <div class="hp-entity-name">${esc(clk.factionName)}</div>
            ${clk.goal ? `<p>${esc(clk.goal)}</p>` : ''}
            <div class="hp-bar-track"><div class="hp-bar-fill" style="width:${pct}%"></div></div>
            <div class="hp-bar-label">${prog} / ${max}${clk.completion ? ` — ${esc(clk.completion)}` : ''}</div>
          </div>`;
      }).join('<hr class="hp-divider">');
      parts.push(section(`Faction Clocks (${clocks.length})`, clockParts));
    }

    // Combat Encounters — collapsed
    const encs = (d.encounters || []).filter(e => e.name);
    if (encs.length) {
      const encParts = encs.map(e => `
        <div class="hp-entity">
          <div class="hp-entity-name">${esc(e.name)}</div>
          ${e.summary ? `<p>${esc(e.summary)}</p>` : ''}
        </div>`).join('<hr class="hp-divider">');
      parts.push(section(`Combat Encounters (${encs.length})`, encParts));
    }

    // Session Notes — collapsed
    if (d.sessionNotes && d.sessionNotes.trim()) {
      parts.push(section('Session Notes', `<p class="hp-notes">${esc(d.sessionNotes)}</p>`));
    }

    return parts.join('');
  }

  // ─── Encounter HTML ──────────────────────────────────────────────────────────
  function buildEncounterHTML(encounter) {
    const d = encounter.data || {};

    const parts = [];

    parts.push(`<div class="hp-header">
      <div class="hp-title">${esc(encounter.name || d.name || 'Encounter')}</div>
      <div class="hp-meta">${encounter.sessionId
        ? `Session <span style="color:var(--gold)">${esc(encounter.sessionId)}</span>`
        : 'No linked session'}</div>
      ${tagsHTML(encounter.tags)}
    </div>`);

    // Fiction & Outcome — EXPANDED
    const fictionParts = [
      d.fiction           ? field('Fiction', `<span class="hp-readout">${esc(d.fiction)}</span>`) : '',
      d.winCondition      ? field('Win Condition', esc(d.winCondition)) : '',
      d.interestingFailure? field('Interesting Failure', esc(d.interestingFailure)) : '',
    ].join('');
    parts.push(section('Fiction & Outcome', fictionParts, true));

    // Secondary Objective — collapsed
    const obj = d.secondaryObjective || {};
    if (obj.description || obj.consequence) {
      const objParts = [
        obj.description ? `<p>${esc(obj.description)}</p>` : '',
        (obj.round || obj.initiative) ? `<p><span class="hp-label">Countdown:</span> Round ${esc(obj.round || '?')}, Init ${esc(obj.initiative || '?')}</p>` : '',
        obj.consequence ? field('Consequence', esc(obj.consequence)) : '',
      ].join('');
      parts.push(section('Secondary Objective', objParts));
    }

    // Environment — collapsed
    const env = d.environment || {};
    if (env.layer1 || env.layer2trigger || env.layer2ongoing || env.layer3) {
      const envParts = [
        env.layer1         ? field('Terrain Decisions', esc(env.layer1)) : '',
        (env.layer2trigger || env.layer2ongoing) ? field('Environmental Threat',
          (env.layer2trigger ? `<p>Triggers: round ${esc(env.layer2trigger)}</p>` : '') +
          (env.layer2ongoing ? `<p>${esc(env.layer2ongoing)}</p>` : '')) : '',
        env.layer3 ? field('Non-Damage Layer', esc(env.layer3)) : '',
      ].join('');
      parts.push(section('Environment', envParts));
    }

    // Enemies — collapsed
    const enemies = (d.enemies || []).filter(e => e.name);
    if (enemies.length) {
      const enemyParts = enemies.map(en => `
        <div class="hp-entity">
          <div class="hp-entity-name">${esc(en.name)}${en.isPuzzle ? ' <span class="hp-badge">Puzzle</span>' : ''}</div>
          ${en.role    ? `<p><span class="hp-label">Role:</span> ${esc(en.role)}</p>` : ''}
          ${en.pressure? `<p><span class="hp-label">Pressure:</span> ${esc(en.pressure)}</p>` : ''}
          ${en.key     ? `<p><span class="hp-label">Key:</span> ${esc(en.key)}</p>` : ''}
        </div>`).join('<hr class="hp-divider">');
      parts.push(section(`Enemies (${enemies.length})`, enemyParts));
    }

    // Natural Tasks — collapsed
    const tasks = (d.naturalTasks || []).filter(t => t.name || t.task);
    if (tasks.length) {
      const taskHTML = `<table class="hp-table">
        <thead><tr><th>Player</th><th>Task</th><th>Ability</th></tr></thead>
        <tbody>${tasks.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(t.task)}</td><td>${esc(t.ability)}</td></tr>`).join('')}</tbody>
      </table>`;
      parts.push(section('Natural Tasks', taskHTML));
    }

    // Design Checklist — collapsed
    const chk = d.checklist || {};
    if (Object.values(chk).some(v => v !== undefined)) {
      const items = [
        [chk.situationComplexity, 'Difficulty from situation complexity'],
        [chk.noProne,             'No prone from environment'],
        [chk.noHighAC,            'No AC 18+ as sole difficulty'],
        [chk.everyoneHasTask,     'Everyone has a task every turn'],
        [chk.discoverableRound1,  'Key mechanic discoverable round 1'],
        [chk.nonViolentPath,      'Non-violent solution exists'],
      ];
      const chkHTML = `<div class="hp-checklist">${items.map(([v, l]) =>
        `<div class="hp-check-item${v ? ' checked' : ''}"><span class="hp-check-box">${v ? '✔' : '○'}</span> ${esc(l)}</div>`
      ).join('')}</div>`;
      parts.push(section('Design Checklist', chkHTML));
    }

    // Combat Notes — collapsed
    if (d.notes && d.notes.trim()) {
      parts.push(section('Combat Notes', `<p class="hp-notes">${esc(d.notes)}</p>`));
    }

    return parts.join('');
  }

  // ─── NPC HTML ────────────────────────────────────────────────────────────────
  function buildNpcHTML(npc) {
    const parts = [];

    parts.push(`<div class="hp-header">
      <div class="hp-title">${esc(npc.name)}${npc.nickname ? ` <span style="color:var(--muted);font-size:12px;">"${esc(npc.nickname)}"</span>` : ''}</div>
      ${tagsHTML(npc.tags)}
    </div>`);

    // Common phrase — expanded
    if (npc.commonPhrase) {
      parts.push(section('Signature', `<p class="hp-readout">${esc(npc.commonPhrase)}</p>`, true));
    }

    // Appearance — expanded
    if (npc.appearance) {
      parts.push(section('Appearance', `<p>${esc(npc.appearance)}</p>`, true));
    }

    // Character core — collapsed
    const coreParts = [
      npc.situation     ? field('Situation', esc(npc.situation)) : '',
      npc.wantsNeeds    ? field('Wants & Needs', esc(npc.wantsNeeds)) : '',
      npc.secretObstacle? field('Secret / Obstacle', esc(npc.secretObstacle)) : '',
    ].join('');
    parts.push(section('Character Core', coreParts));

    // Skill triggers — collapsed (only filled skills)
    const SKILL_LABELS = { perception:'Perception', insight:'Insight', medicine:'Medicine',
      investigation:'Investigation', arcana:'Arcana', history:'History',
      religion:'Religion', nature:'Nature', persuasion:'Persuasion',
      deception:'Deception', intimidation:'Intimidation' };
    const skills = npc.skillDescriptions || {};
    const skillParts = Object.entries(SKILL_LABELS)
      .filter(([k]) => skills[k] && skills[k].trim())
      .map(([k, label]) => field(label, esc(skills[k])))
      .join('');
    if (skillParts) parts.push(section('Skill Triggers', skillParts));

    // Carrying — collapsed
    if (npc.carrying && npc.carrying.length) {
      parts.push(section('Carrying', `<ul class="hp-list">${npc.carrying.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`));
    }

    return parts.join('');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function field(label, content) {
    return `<div class="hp-field"><span class="hp-label">${esc(label)}</span><div class="hp-field-body">${content}</div></div>`;
  }

  function tagsHTML(tags) {
    if (!tags || !tags.length) return '';
    return `<div class="hp-tags">${tags.map(t => `<span class="tag-chip">${esc(t)}</span>`).join(' ')}</div>`;
  }

  function positionPanel(row) {
    const rect = row.getBoundingClientRect();
    const vh   = window.innerHeight;
    const ph   = Math.min(panel.scrollHeight || 400, vh * 0.85);
    let top = rect.top + rect.height / 2 - ph / 2;
    top = Math.max(8, Math.min(top, vh - ph - 8));
    panel.style.top = `${top}px`;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  }
})();
