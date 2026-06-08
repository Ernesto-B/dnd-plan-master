(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────────
  const tabs   = [];   // [{ id, url, title }]
  let mru      = [];   // tab IDs, most-recent first
  let active   = null; // active tab id

  // ── DOM refs ──────────────────────────────────────────────────────────────────
  const tabBar  = document.getElementById('shell-tabs');
  const frames  = document.getElementById('shell-frames');
  const newBtn  = document.getElementById('shell-new-tab');

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

  function shortTitle(title) {
    const t = (title || 'Loading…').replace(' — D&D Session Master', '');
    return t.length > 28 ? t.slice(0, 26) + '…' : t;
  }

  // ── Create / destroy tabs ─────────────────────────────────────────────────────
  function createTab(url = '/') {
    const id    = genId();
    const tab   = { id, url, title: 'Loading…' };
    tabs.push(tab);

    const frame = document.createElement('iframe');
    frame.id    = `f-${id}`;
    frame.className = 'shell-frame';
    frame.src   = url;
    frame.setAttribute('allow', 'same-origin');
    frames.appendChild(frame);

    frame.addEventListener('load', () => {
      try {
        const title = frame.contentDocument?.title || url;
        tab.title = title;
        tab.url   = frame.contentWindow?.location?.pathname || url;
        renderTabs();
      } catch {}
    });

    setActive(id);
    return id;
  }

  function openWindow() {
    if (window.dndApp?.openShellWindow) {
      window.dndApp.openShellWindow();
    } else {
      window.open('/shell', '_blank', 'noopener');
    }
  }

  function closeTab(id) {
    const i = tabs.findIndex(t => t.id === id);
    if (i < 0) return;
    tabs.splice(i, 1);
    mru = mru.filter(x => x !== id);
    document.getElementById(`f-${id}`)?.remove();

    if (!tabs.length) { window.close(); return; }
    if (active === id) setActive(mru[0] || tabs[0].id);
    renderTabs();
  }

  // ── Activate ──────────────────────────────────────────────────────────────────
  function setActive(id) {
    if (active !== null && active !== id) {
      mru = [active, ...mru.filter(x => x !== active)];
    }
    active = id;
    frames.querySelectorAll('.shell-frame').forEach(f => {
      f.classList.toggle('active', f.id === `f-${id}`);
    });
    renderTabs();
  }

  // ── Navigation ────────────────────────────────────────────────────────────────
  function nextTab() {
    if (tabs.length < 2) return;
    const i = tabs.findIndex(t => t.id === active);
    setActive(tabs[(i + 1) % tabs.length].id);
  }

  function prevTab() {
    if (tabs.length < 2) return;
    const i = tabs.findIndex(t => t.id === active);
    setActive(tabs[(i - 1 + tabs.length) % tabs.length].id);
  }

  function flipMru() {
    // Switch to the most-recently-used *other* tab
    const other = mru[0];
    if (other && other !== active) setActive(other);
    else if (tabs.length > 1) {
      const other2 = tabs.find(t => t.id !== active);
      if (other2) setActive(other2.id);
    }
  }

  // ── Render tab bar ────────────────────────────────────────────────────────────
  function renderTabs() {
    tabBar.innerHTML = tabs.map(t => `
      <div class="shell-tab${t.id === active ? ' active' : ''}" data-id="${esc(t.id)}" title="${esc(t.title)}">
        <span class="shell-tab-title">${esc(shortTitle(t.title))}</span>
        <button class="shell-tab-close" data-id="${esc(t.id)}">×</button>
      </div>`).join('');

    tabBar.querySelectorAll('.shell-tab').forEach(el => {
      el.addEventListener('click', e => {
        if (!e.target.classList.contains('shell-tab-close')) setActive(el.dataset.id);
      });
    });

    tabBar.querySelectorAll('.shell-tab-close').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); closeTab(btn.dataset.id); });
    });

    // Update window title to active tab
    const activeTab = tabs.find(t => t.id === active);
    document.title = activeTab ? shortTitle(activeTab.title) : 'D&D Session Master';
  }

  // ── postMessage from iframes ──────────────────────────────────────────────────
  window.addEventListener('message', e => {
    const { type, action, url, title } = e.data || {};

    // Identify sender frame
    let senderId = null;
    frames.querySelectorAll('.shell-frame').forEach(f => {
      try { if (f.contentWindow === e.source) senderId = f.id.replace('f-', ''); } catch {}
    });

    if (type === 'tab-shortcut') {
      if (action === 'mru')  flipMru();
      if (action === 'next') nextTab();
      if (action === 'prev') prevTab();
      if (action === 'new')  createTab('/');
      if (action === 'close') closeTab(active);
      if (action === 'window') openWindow();
    }

    if (type === 'tab-title' && senderId) {
      const tab = tabs.find(t => t.id === senderId);
      if (tab) { tab.title = title; renderTabs(); }
    }

    if (type === 'tab-open-url') {
      createTab(url || '/');
    }

    if (type === 'tab-navigate' && senderId) {
      const tab = tabs.find(t => t.id === senderId);
      if (tab) tab.url = url || tab.url;
    }
  });

  // ── Shell-level keyboard shortcuts ────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    const mac = navigator.platform.toUpperCase().includes('MAC');
    const mod = mac ? e.metaKey : e.ctrlKey;
    if (!mod) return;

    if (e.key === '`')                        { e.preventDefault(); flipMru();     }
    if (e.shiftKey && e.key === ']')          { e.preventDefault(); nextTab();     }
    if (e.shiftKey && e.key === '[')          { e.preventDefault(); prevTab();     }
    if (e.key === 't' && !e.shiftKey)         { e.preventDefault(); createTab('/'); }
    if (e.key === 'w' && !e.shiftKey)         { e.preventDefault(); closeTab(active); }
    if (e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      openWindow();
    }
  });

  // ── New tab button ────────────────────────────────────────────────────────────
  newBtn.addEventListener('click', () => createTab('/'));

  const newWindowBtn = document.getElementById('shell-new-window');
  newWindowBtn?.addEventListener('click', openWindow);

  // ── Boot ──────────────────────────────────────────────────────────────────────
  createTab('/');
})();
