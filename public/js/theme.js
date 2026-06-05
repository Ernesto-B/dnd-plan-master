(function () {
  var theme = 'dark';
  var uiScale = 1;

  // Synchronous fetch from the file-backed API so that settings survive Electron
  // restarts even when the dev server uses a random port (different localStorage origin).
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/settings', false); // synchronous — intentional, blocks until theme known
    xhr.send();
    if (xhr.status === 200) {
      var s = JSON.parse(xhr.responseText);
      if (s.theme)   theme   = s.theme;
      if (s.uiScale) uiScale = parseFloat(s.uiScale);
    }
  } catch (_) {
    // Fallback: localStorage (works fine in browser builds with stable port)
    theme   = localStorage.getItem('dnd-theme') || 'dark';
    uiScale = parseFloat(localStorage.getItem('dnd-ui-scale') || '1');
  }

  // Mirror into localStorage so that settings.js toggle buttons initialise correctly
  localStorage.setItem('dnd-theme', theme);
  localStorage.setItem('dnd-ui-scale', String(uiScale));

  if (!Number.isFinite(uiScale)) uiScale = 1;
  uiScale = Math.max(0.85, Math.min(1.25, uiScale));
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.setProperty('--ui-scale', String(uiScale));
})();
