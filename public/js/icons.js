(function () {
  const ICONS = {
    home: '<path d="M4 11.5L12 4l8 7.5"></path><path d="M6.5 10.5V20h11V10.5"></path>',
    sessions: '<path d="M6 4.5h12v15H6z"></path><path d="M9 4.5v15"></path><path d="M6 9h12"></path>',
    encounters: '<path d="M12 3.5l8 3.5-8 13.5-8-13.5z"></path><path d="M12 7v11"></path><path d="M8.5 9h7"></path>',
    npc: '<circle cx="12" cy="8" r="3.2"></circle><path d="M5.5 20c1.7-3.6 4.1-5.4 6.5-5.4s4.8 1.8 6.5 5.4"></path>',
    location: '<path d="M12 20s5.5-5.1 5.5-10a5.5 5.5 0 0 0-11 0c0 4.9 5.5 10 5.5 10z"></path><circle cx="12" cy="10" r="2"></circle>',
    faction: '<path d="M5.5 4.5v15"></path><path d="M6.5 5.5c2.6 0 3.8 1.7 6.1 1.7S16.2 5.5 18.5 5.5v8c-2.3 0-3.5 1.7-5.9 1.7S9.1 13.5 6.5 13.5"></path>',
    campaign: '<path d="M4.5 7.5l7-3 8 3v9l-8 3-7-3z"></path><path d="M11.5 4.5v15"></path><path d="M4.5 7.5l7 3 8-3"></path>',
    settings: '<circle cx="12" cy="12" r="2.6"></circle><path d="M12 4.7l1 .2.5 1.8 1.1.5 1.7-.8.8.7-.8 1.8.5 1 .1.2 1.8.6.2 1-.2 1-1.8.6-.6 1.2.8 1.7-.7.8-1.8-.8-1.2.5-.6 1.8-1 .2-1-.2-.6-1.8-1.2-.5-1.8.8-.7-.8.8-1.7-.5-1.2-1.8-.6-.2-1 .2-1 1.8-.6.5-1.2-.8-1.8.8-.7 1.7.8 1.2-.5.6-1.8z"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    edit: '<path d="M4.5 19.5h4l11-11-4-4-11 11z"></path><path d="M14.5 5.5l4 4"></path>',
    print: '<path d="M7 5.5h10v4H7z"></path><path d="M6 9.5h12a2 2 0 0 1 2 2v4H16v3H8v-3H4v-4a2 2 0 0 1 2-2z"></path><path d="M8.5 16.5h7"></path>',
    export: '<path d="M12 4.5v10.5"></path><path d="M8.5 8.5L12 5l3.5 3.5"></path><path d="M5.5 15.5v4h13v-4"></path>',
    download: '<path d="M12 4.5v9"></path><path d="M8.5 10.5L12 14l3.5-3.5"></path><path d="M5.5 15.5v3h13v-3"></path>',
    delete: '<path d="M6.5 7h11"></path><path d="M9 7V5.5h6V7"></path><path d="M8 7l.6 11h6.8L16 7"></path><path d="M10.5 10.5v4M13.5 10.5v4"></path>',
    back: '<path d="M10 6l-6 6 6 6"></path><path d="M5 12h14"></path>',
    connections: '<path d="M8 12a4 4 0 1 1 8 0"></path><path d="M6 12h12"></path><path d="M8 16a4 4 0 1 0 8 0"></path>',
    run: '<path d="M8 5.5l10 6.5-10 6.5z"></path>',
    help: '<circle cx="12" cy="12" r="9"></circle><path d="M9.8 9a2.4 2.4 0 1 1 4.4 1.3c-.6.9-1.6 1.1-2.2 2.2-.2.4-.3.9-.3 1.5"></path><path d="M12 17.2h0"></path>',
    up: '<path d="M12 5l-6 6"></path><path d="M12 5l6 6"></path><path d="M12 5v14"></path>',
    window: '<rect x="4.5" y="5.5" width="15" height="13" rx="1.8"></rect><path d="M4.5 9h15"></path><path d="M8 5.5v13"></path>',
    search: '<circle cx="11" cy="11" r="5.5"></circle><path d="M15.5 15.5l4 4"></path>',
    save: '<path d="M5.5 5.5h10l3 3v10h-13z"></path><path d="M8 5.5v5h6v-5"></path><path d="M8 18v-5h8v5"></path>',
    table: '<path d="M4.5 6h15v12h-15z"></path><path d="M4.5 10h15"></path><path d="M9 6v12"></path><path d="M14 6v12"></path>',
    default: '<path d="M5 12h14"></path>',
  };

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function icon(name) {
    const key = String(name || '').toLowerCase();
    const body = ICONS[key] || ICONS.default;
    return `<svg class="app-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  function decorateElement(el) {
    if (!el || el.dataset.iconDecorated === '1') return;
    const name = el.dataset.icon;
    if (!name) return;

    const only = el.dataset.iconOnly === 'true';
    const label = el.dataset.iconLabel || el.textContent.trim();
    el.dataset.iconDecorated = '1';
    el.classList.add('iconified');
    if (only) {
      el.innerHTML = icon(name);
      return;
    }

    el.innerHTML = `${icon(name)}<span class="icon-label">${escapeHtml(label)}</span>`;
  }

  function decorate(root = document) {
    if (!root) return;
    const elements = [];
    if (root.nodeType === 1 && root.matches?.('[data-icon]')) elements.push(root);
    if (root.querySelectorAll) elements.push(...root.querySelectorAll('[data-icon]'));
    elements.forEach(decorateElement);
  }

  function startObserver() {
    const root = document.body || document.documentElement;
    if (!root) return;

    decorate(document);
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          decorate(node);
        });
      }
    });
    observer.observe(root, { childList: true, subtree: true });
  }

  window.AppIcons = { icon, decorate, decorateElement };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
})();
