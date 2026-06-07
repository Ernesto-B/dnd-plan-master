(function () {
  const nav = document.querySelector('.top-nav');
  if (nav) {
    nav.querySelector('.brand')?.remove();
  }

  if (nav && !nav.querySelector('.nav-link[href="/campaign"]')) {
    const settingsLink = nav.querySelector('.nav-link[href="/settings"]');
    const link = document.createElement('a');
    link.href = '/campaign';
    link.className = 'nav-link';
    link.textContent = 'Campaign';
    if (settingsLink) nav.insertBefore(link, settingsLink);
  }

  if (nav && !nav.querySelector('.nav-history-wrap')) {
    const wrap = document.createElement('div');
    wrap.className = 'nav-history-wrap';
    wrap.setAttribute('aria-label', 'History navigation');
    wrap.innerHTML = `
      <button type="button" class="nav-history-btn" id="nav-back-btn" aria-label="Back" data-tooltip="Back (Cmd/Ctrl+[)">←</button>
      <button type="button" class="nav-history-btn" id="nav-forward-btn" aria-label="Forward" data-tooltip="Forward (Cmd/Ctrl+])">→</button>
    `;

    const sep = nav.querySelector('.nav-sep');
    if (sep) nav.insertBefore(wrap, sep);
    else nav.prepend(wrap);

    wrap.querySelector('#nav-back-btn')?.addEventListener('click', () => window.history.back());
    wrap.querySelector('#nav-forward-btn')?.addEventListener('click', () => window.history.forward());
  }

  // Campaign switcher — injected between brand and nav separator
  if (nav && !nav.querySelector('.nav-campaign-wrap')) {
    const wrap = document.createElement('div');
    wrap.className = 'nav-campaign-wrap';
    wrap.innerHTML = `
      <button class="nav-campaign-btn" id="nav-campaign-btn" title="Switch Campaign">
        <span class="nav-campaign-name" id="nav-campaign-name">…</span>
        <span class="nav-campaign-caret">▾</span>
      </button>
      <div class="nav-campaign-dropdown" id="nav-campaign-dropdown">
        <div class="nav-campaign-list" id="nav-campaign-list"></div>
        <div class="nav-campaign-footer">
          <a href="/campaigns" class="nav-campaign-manage">Manage Campaigns →</a>
        </div>
      </div>`;

    const sep = nav.querySelector('.nav-sep');
    if (sep) nav.insertBefore(wrap, sep);
    else nav.insertBefore(wrap, nav.firstChild.nextSibling);

    const btn      = nav.querySelector('#nav-campaign-btn');
    const dropdown = nav.querySelector('#nav-campaign-dropdown');
    const nameEl   = nav.querySelector('#nav-campaign-name');
    const listEl   = nav.querySelector('#nav-campaign-list');

    btn.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));

    async function loadCampaignSwitcher() {
      try {
        const res = await fetch('/api/campaigns');
        if (!res.ok) return;
        const { campaigns, activeCampaignId } = await res.json();
        const active = campaigns.find(c => c.id === activeCampaignId) || campaigns[0];
        nameEl.textContent = active?.name || 'Campaign';

        listEl.innerHTML = campaigns.map(c => `
          <button class="nav-campaign-item${c.id === activeCampaignId ? ' is-active' : ''}"
                  data-id="${escHtml(c.id)}">
            <span class="nav-campaign-item-check">${c.id === activeCampaignId ? '✓' : ''}</span>
            <span>${escHtml(c.name)}</span>
          </button>`).join('');

        listEl.querySelectorAll('.nav-campaign-item').forEach(item => {
          item.addEventListener('click', async () => {
            if (item.classList.contains('is-active')) { dropdown.classList.remove('open'); return; }
            try {
              await fetch(`/api/campaigns/${encodeURIComponent(item.dataset.id)}/switch`, { method: 'POST' });
              window.location.reload();
            } catch {}
          });
        });
      } catch {}
    }

    loadCampaignSwitcher();
  }

  // "Open Tabs" button — opens the shell window
  if (nav && !nav.querySelector('#nav-open-shell')) {
    const createWrap = nav.querySelector('.nav-create-wrap');
    const shellBtn = document.createElement('button');
    shellBtn.id = 'nav-open-shell';
    shellBtn.className = 'nav-shell-btn';
    shellBtn.title = 'Open Tabs (Cmd/Ctrl+Shift+O)';
    shellBtn.innerHTML = '⧉';
    shellBtn.addEventListener('click', () => window.open('/shell', '_blank', 'noopener'));
    if (createWrap) nav.insertBefore(shellBtn, createWrap);
    else nav.appendChild(shellBtn);
  }

  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const isEditingPage = pathname.startsWith('/form')
    || pathname.startsWith('/encounter/new')
    || pathname.startsWith('/encounter/edit/')
    || pathname.startsWith('/npc/new')
    || pathname.startsWith('/npc/edit/')
    || pathname.startsWith('/location/new')
    || pathname.startsWith('/location/edit/')
    || searchParams.has('edit');
  const activeByPath = [
    { href: '/campaign', match: pathname === '/' || pathname === '/campaign' || pathname === '/campaigns' },
    { href: '/sessions', match: pathname === '/sessions' || pathname === '/view' || pathname === '/form' || pathname.startsWith('/view/') || pathname.startsWith('/run/') },
    { href: '/encounters', match: pathname === '/encounters' || pathname.startsWith('/encounter/') },
    { href: '/npcs', match: pathname === '/npcs' || pathname.startsWith('/npc/') },
    { href: '/locations', match: pathname === '/locations' || pathname.startsWith('/location/') },
    { href: '/settings', match: pathname === '/settings' },
  ];
  const active = activeByPath.find(item => item.match);
  if (nav && active) {
    nav.querySelectorAll('.nav-link').forEach(link => link.classList.remove('nav-link-active'));
    const activeLink = nav.querySelector(`.nav-link[href="${active.href}"]`);
    if (activeLink) activeLink.classList.add('nav-link-active');
  }

  const navIcons = {
    '/sessions': 'sessions',
    '/encounters': 'encounters',
    '/npcs': 'npc',
    '/locations': 'location',
    '/campaign': 'campaign',
    '/settings': 'settings',
  };
  nav?.querySelectorAll('.nav-link').forEach(link => {
    const icon = navIcons[link.getAttribute('href')];
    if (icon) {
      link.dataset.icon = icon;
      link.dataset.iconDecorated = '0';
    }
  });

  const HELP_CONTENT = {
    sessions: {
      title: 'Sessions',
      intro: 'This is the planning hub. Each row is one session plan for one play night.',
      sections: [
        {
          title: 'Use this page for',
          bullets: [
            'Create a new session plan, then open the row to read or edit it.',
            'Use search, tags, and row actions to find old plans quickly.',
            'Treat one row as one session. Keep it focused and playable.',
          ],
        },
        {
          title: 'Connect it up',
          bullets: [
            'Link encounter plans and NPCs from the session so the rest of the app stays connected.',
            'At the end of play, fill in the Campaign Continuity section in the session form.',
            'That continuity is what powers the Campaign page rollup.',
          ],
        },
        {
          title: 'Best practice',
          bullets: [
            'Write the session goal, expected end state, and likely scenes in plain language.',
            'If a detail matters later, put it in tags or continuity instead of burying it in a long note.',
          ],
        },
      ],
    },
    'session-view': {
      title: 'Session View',
      intro: 'This page is the finished session packet. Use it at the table or before the next prep session.',
      sections: [
        {
          title: 'Use this page for',
          bullets: [
            'Read the rendered session plan without the form clutter.',
            'Use Edit Session to update the plan after the session changes.',
            'Use Export Packet or Print DM Table when you want a table-friendly handout.',
          ],
        },
        {
          title: 'Best practice',
          bullets: [
            'Keep the opening, scene beats, linked encounters, and continuity current.',
            'When the session ends, update the recap and unresolved threads first.',
          ],
        },
      ],
    },
    encounters: {
      title: 'Encounters',
      intro: 'This page stores reusable encounter plans. Think of them as scene packets, not one-off notes.',
      sections: [
        {
          title: 'Use this page for',
          bullets: [
            'Create or open encounter plans, then use search or tags to find them later.',
            'Right-click rows for quick actions like export, tag, or delete.',
            'Link encounter plans into a session when you know they belong in the next night of play.',
          ],
        },
        {
          title: 'Best practice',
          bullets: [
            'Write the fiction, win condition, failure state, and natural tasks before you add details.',
            'Make the pressure obvious, then make the solution discoverable.',
          ],
        },
      ],
    },
    'encounter-view': {
      title: 'Encounter View',
      intro: 'This is one encounter plan in its finished form.',
      sections: [
        {
          title: 'Use this page for',
          bullets: [
            'Review the encounter details without the editor noise.',
            'Open Edit Encounter to refine the plan.',
            'Use export options when you want the encounter as a PDF or file bundle.',
          ],
        },
        {
          title: 'Best practice',
          bullets: [
            'The players should be able to tell what is happening, what matters, and how to push back.',
            'If the encounter has a special mechanic, make the clue and the countermeasure visible in the plan.',
          ],
        },
      ],
    },
    npcs: {
      title: 'NPCs',
      intro: 'This page is the shared memory bank for important people in the world.',
      sections: [
        {
          title: 'Use this page for',
          bullets: [
            'Create NPC records with a current situation, wants, and a few sharp details.',
            'Use tags and search to find who matters in the current arc.',
            'Link NPCs to sessions and encounters so they stay connected to the story.',
          ],
        },
        {
          title: 'Best practice',
          bullets: [
            'Keep the current state of the NPC here, not just their backstory.',
            'Update the page whenever the party changes their situation.',
          ],
        },
      ],
    },
    locations: {
      title: 'Locations',
      intro: 'This page is the shared map index for places, districts, and sites the party can visit.',
      sections: [
        {
          title: 'Use this page for',
          bullets: [
            'Keep places organized so you can jump back to them later without digging through old notes.',
            'Use the location record to capture the details that matter at the table: what it looks like, who lives there, and what can change there.',
            'Link locations to sessions and NPCs so the world stays connected.',
          ],
        },
        {
          title: 'Best practice',
          bullets: [
            'Keep each location entry short enough to scan in seconds.',
            'Write just enough to support play, not a full encyclopedia entry.',
          ],
        },
      ],
    },
    'location-view': {
      title: 'Location View',
      intro: 'This page shows one location in detail, including its districts and linked sessions.',
      sections: [
        {
          title: 'Use this page for',
          bullets: [
            'Read the location summary, then jump back to the sessions that take place there.',
            'Use Edit Location when its districts, secrets, or general details change.',
          ],
        },
        {
          title: 'Best practice',
          bullets: [
            'Locations work best when they can change. Note what is different since the party last visited.',
          ],
        },
      ],
    },
    'npc-view': {
      title: 'NPC View',
      intro: 'This page shows one NPC in detail, including their current state and linked sessions.',
      sections: [
        {
          title: 'Use this page for',
          bullets: [
            'Read the NPC summary, then jump back to the sessions that mention them.',
            'Use Edit NPC when their situation or motivation changes.',
          ],
        },
        {
          title: 'Best practice',
          bullets: [
            'NPCs work best when they change over time. Keep the current situation honest and short.',
          ],
        },
      ],
    },
    campaign: {
      title: 'Campaign',
      intro: 'This is now the main campaign landing page: overview first, continuity and connections underneath.',
      sections: [
        {
          title: 'Use this page for',
          bullets: [
            'Start here when you open the app to get the current campaign overview, recent activity, and party context.',
            'Review open threads, world changes, NPC shifts, and rewards across sessions.',
            'See the campaign as a living ledger instead of a stack of isolated notes.',
          ],
        },
        {
          title: 'How it connects',
          bullets: [
            'After every session, update the continuity section in the session form.',
            'That update feeds this page automatically, so the campaign memory stays current.',
          ],
        },
        {
          title: 'Best practice',
          bullets: [
            'If something should matter again later, write it in continuity now instead of trusting memory.',
          ],
        },
      ],
    },
    settings: {
      title: 'Settings',
      intro: 'This page controls the global app behavior and the shared roster used by encounter planning.',
      sections: [
        {
          title: 'Use this page for',
          bullets: [
            'Set the party roster, theme, UI scale, hover preview, shortcuts, exports, imports, and backups.',
            'Changes save automatically, so you do not need to hunt for a save button.',
          ],
        },
        {
          title: 'Best practice',
          bullets: [
            'Keep the roster current, and make a backup before large imports or cleanup work.',
            'Use the UI scale to match the app to your screen instead of forcing the page to fit badly.',
          ],
        },
      ],
    },
  };

  function getHelpKey() {
    if (pathname === '/sessions' || pathname.startsWith('/view/') || pathname === '/form' || pathname.startsWith('/run/')) return 'sessions';
    if (pathname.startsWith('/encounter/view/')) return 'encounter-view';
    if (pathname.startsWith('/npc/view/')) return 'npc-view';
    if (pathname.startsWith('/location/view/')) return 'location-view';
    if (pathname === '/encounters') return 'encounters';
    if (pathname === '/npcs') return 'npcs';
    if (pathname === '/locations') return 'locations';
    if (pathname === '/' || pathname === '/campaign' || pathname === '/campaigns') return 'campaign';
    if (pathname === '/settings') return 'settings';
    return null;
  }

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderHelpContent(key) {
    const cfg = HELP_CONTENT[key];
    if (!cfg) return '';
    return `
      <div class="app-help-head">
        <div>
          <div class="app-help-kicker">Quick Guide</div>
          <h2 id="app-help-title" class="app-help-title">${escHtml(cfg.title)}</h2>
          <p class="app-help-intro">${escHtml(cfg.intro)}</p>
        </div>
      </div>
      <div class="app-help-grid">
        ${cfg.sections.map(section => `
          <section class="app-help-section">
            <h3>${escHtml(section.title)}</h3>
            <ul>${section.bullets.map(item => `<li>${escHtml(item)}</li>`).join('')}</ul>
          </section>
        `).join('')}
      </div>`;
  }

  function buildHelpOverlay() {
    if (document.getElementById('app-help-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'app-help-overlay';
    overlay.className = 'app-help-overlay hidden';
    overlay.innerHTML = `
      <div class="app-help-box" role="dialog" aria-modal="true" aria-labelledby="app-help-title">
        <div class="app-help-shell">
          <div id="app-help-content"></div>
          <div class="app-help-footer">
            <button type="button" class="btn btn-ghost" id="btn-close-app-help">Close</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeHelpOverlay();
    });
    overlay.querySelector('#btn-close-app-help').addEventListener('click', closeHelpOverlay);
  }

  function openHelpOverlay() {
    const key = getHelpKey();
    if (!key) return;
    buildHelpOverlay();
    const overlay = document.getElementById('app-help-overlay');
    const content = document.getElementById('app-help-content');
    if (!overlay || !content) return;
    content.innerHTML = renderHelpContent(key);
    overlay.classList.remove('hidden');
    overlay.querySelector('#btn-close-app-help')?.focus();
  }

  function toggleHelpOverlay() {
    const overlay = document.getElementById('app-help-overlay');
    if (overlay && !overlay.classList.contains('hidden')) {
      closeHelpOverlay();
      return;
    }
    openHelpOverlay();
  }

  function closeHelpOverlay() {
    const overlay = document.getElementById('app-help-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
  }

  if (!isEditingPage && nav) {
    const helpBtn = document.createElement('button');
    helpBtn.type = 'button';
    helpBtn.className = 'help-fab';
    helpBtn.setAttribute('aria-label', 'Page help');
    helpBtn.setAttribute('title', 'Page help');
    helpBtn.dataset.icon = 'help';
    helpBtn.dataset.iconOnly = 'true';
    helpBtn.addEventListener('click', toggleHelpOverlay);
    document.body.appendChild(helpBtn);
    document.body.classList.add('has-page-help');
    buildHelpOverlay();
  }

  const wrap = document.querySelector('.nav-create-wrap');
  const btn  = document.getElementById('nav-create-btn');
  if (wrap && btn) {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      wrap.classList.toggle('open');
    });

    document.addEventListener('click', () => wrap.classList.remove('open'));
  }

  const createIcons = {
    '/form': 'sessions',
    '/encounter/new': 'encounters',
    '/npc/new': 'npc',
    '/location/new': 'location',
  };
  nav?.querySelectorAll('.create-dropdown a').forEach(link => {
    const icon = createIcons[link.getAttribute('href')];
    if (icon) {
      link.dataset.icon = icon;
      link.dataset.iconDecorated = '0';
    }
  });

  const scrollTopBtn = document.createElement('button');
  scrollTopBtn.type = 'button';
  scrollTopBtn.className = 'scroll-top-btn';
  scrollTopBtn.setAttribute('aria-label', 'Back to top');
  scrollTopBtn.setAttribute('title', 'Back to top');
  scrollTopBtn.dataset.icon = 'up';
  scrollTopBtn.dataset.iconOnly = 'true';
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.body.appendChild(scrollTopBtn);

  const shellBtn = document.getElementById('nav-open-shell');
  if (shellBtn) {
    shellBtn.dataset.icon = 'window';
    shellBtn.dataset.iconOnly = 'true';
  }

  function updateScrollTopButton() {
    scrollTopBtn.classList.toggle('visible', window.scrollY > 320);
  }

  window.addEventListener('scroll', updateScrollTopButton, { passive: true });
  updateScrollTopButton();

  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'hover-tooltip';
  document.body.appendChild(tooltipEl);

  let tooltipTimer = null;
  let tooltipTarget = null;

  function hideTooltip() {
    if (tooltipTimer) {
      clearTimeout(tooltipTimer);
      tooltipTimer = null;
    }
    tooltipTarget = null;
    tooltipEl.classList.remove('visible');
  }

  function positionTooltip(target) {
    const rect = target.getBoundingClientRect();
    tooltipEl.style.left = `${Math.round(rect.right + 12)}px`;
    tooltipEl.style.top = `${Math.round(rect.top + (rect.height / 2))}px`;

    const tooltipRect = tooltipEl.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth - 12) {
      tooltipEl.style.left = `${Math.max(12, Math.round(rect.left - tooltipRect.width - 12))}px`;
    }
  }

  function showTooltip(target, immediate = false) {
    const text = target?.dataset?.tooltip;
    if (!text) return;
    hideTooltip();
    tooltipTarget = target;
    const open = () => {
      if (tooltipTarget !== target) return;
      tooltipEl.textContent = text;
      tooltipEl.classList.add('visible');
      positionTooltip(target);
    };
    if (immediate) open();
    else tooltipTimer = setTimeout(open, 500);
  }

  document.addEventListener('mouseover', event => {
    const target = event.target.closest('[data-tooltip]');
    if (!target) return;
    showTooltip(target, false);
  });

  document.addEventListener('mouseout', event => {
    const target = event.target.closest('[data-tooltip]');
    if (!target) return;
    if (event.relatedTarget && target.contains(event.relatedTarget)) return;
    hideTooltip();
  });

  document.addEventListener('focusin', event => {
    const target = event.target.closest('[data-tooltip]');
    if (target) showTooltip(target, true);
  });

  document.addEventListener('focusout', event => {
    const target = event.target.closest('[data-tooltip]');
    if (target) hideTooltip();
  });

  window.addEventListener('scroll', () => {
    if (tooltipTarget && tooltipEl.classList.contains('visible')) positionTooltip(tooltipTarget);
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (tooltipTarget && tooltipEl.classList.contains('visible')) positionTooltip(tooltipTarget);
  });

  document.addEventListener('keydown', event => {
    const overlay = document.getElementById('app-help-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeHelpOverlay();
    }
  }, true);
})();
