(function () {
  'use strict';

  const inIframe = window !== window.parent;
  const mac      = navigator.platform.toUpperCase().includes('MAC');
  const mod      = e => mac ? e.metaKey : e.ctrlKey;
  const isEditableTarget = target => {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  };

  function openShellWindow() {
    window.open('/shell', '_blank', 'noopener');
  }

  // ── Keyboard shortcuts → parent ───────────────────────────────────────────────
  if (inIframe) {
    document.addEventListener('keydown', e => {
      if (!mod(e)) return;

      let action = null;
      if (e.key === '`')                   action = 'mru';
      if (e.shiftKey && e.key === ']')     action = 'next';
      if (e.shiftKey && e.key === '[')     action = 'prev';
      if (e.key === 't' && !e.shiftKey)    action = 'new';
      if (e.key === 'w' && !e.shiftKey)    action = 'close';
      if (e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') action = 'window';

      if (action) {
        e.preventDefault();
        window.parent.postMessage({ type: 'tab-shortcut', action }, '*');
      }
    });

    // Report title changes to parent
    const origTitle = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
    if (origTitle) {
      Object.defineProperty(document, 'title', {
        get() { return origTitle.get.call(this); },
        set(v) {
          origTitle.set.call(this, v);
          window.parent.postMessage({ type: 'tab-title', title: v }, '*');
        },
      });
    }
    // Report initial title
    window.addEventListener('load', () => {
      window.parent.postMessage({ type: 'tab-title', title: document.title }, '*');
    });

    // Intercept Ctrl/Cmd+Click links to open in new shell tab
    document.addEventListener('click', e => {
      if (!mod(e)) return;
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('#')) return;
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({ type: 'tab-open-url', url: href }, '*');
    }, true);
  } else {
    document.addEventListener('keydown', e => {
      if (!mod(e) || !e.shiftKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key.toLowerCase() !== 'o') return;
      e.preventDefault();
      openShellWindow();
    });
  }
})();
