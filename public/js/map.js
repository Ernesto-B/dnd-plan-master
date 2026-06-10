(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────────
  let pins       = [];
  let locations  = [];
  let editMode   = false;
  let activePinId = null;
  let spaceDown  = false;   // Space held → temporary pan mode in edit mode

  // Zoom/pan
  let scale  = 1;
  let ox     = 0;
  let oy     = 0;
  let dragging  = false;
  let dragStart = null;
  let imgNaturalW = 0;
  let imgNaturalH = 0;

  const MIN_SCALE = 0.1;
  const MAX_SCALE = 5;

  // ── DOM refs ──────────────────────────────────────────────────────────────────
  const emptyEl     = document.getElementById('map-empty');
  const viewportEl  = document.getElementById('map-viewport');
  const canvasEl    = document.getElementById('map-canvas');
  const imgEl       = document.getElementById('map-img');
  const pinsLayer   = document.getElementById('map-pins-layer');
  const panelEl     = document.getElementById('map-panel');
  const uploadInput = document.getElementById('map-upload-input');

  const btnView    = document.getElementById('map-btn-view');
  const btnEdit    = document.getElementById('map-btn-edit');
  const btnZoomIn  = document.getElementById('map-btn-zoom-in');
  const btnZoomOut = document.getElementById('map-btn-zoom-out');
  const btnZoomFit = document.getElementById('map-btn-zoom-fit');
  const btnRemove  = document.getElementById('map-btn-remove');

  const panelTitle    = document.getElementById('map-panel-title');
  const panelClose    = document.getElementById('map-panel-close');

  // Edit form refs
  const pinEditFormEl = document.getElementById('map-pin-edit-form');
  const pinLabelInput = document.getElementById('map-pin-label');
  const pinLocSelect  = document.getElementById('map-pin-location');
  const pinSaveBtn    = document.getElementById('map-pin-save');
  const pinDeleteBtn  = document.getElementById('map-pin-delete');
  const panelGoto     = document.getElementById('map-panel-goto');
  const pinLocLink    = document.getElementById('map-pin-location-link');

  // View info refs
  const pinViewEl      = document.getElementById('map-pin-view');
  const pinInfoNameEl  = document.getElementById('map-pin-info-name');
  const pinInfoDescEl  = document.getElementById('map-pin-info-desc');
  const pinInfoTagsEl  = document.getElementById('map-pin-info-tags');
  const pinInfoLocLink = document.getElementById('map-pin-info-loc-link');
  const pinInfoEditBtn = document.getElementById('map-pin-info-edit-btn');

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => { t.className = 'toast'; }, 4000);
  }

  // ── Transform ─────────────────────────────────────────────────────────────────
  function applyTransform() {
    canvasEl.style.transform = `translate(${ox}px, ${oy}px) scale(${scale})`;
    pinsLayer.style.setProperty('--pin-scale', scale);
  }

  // In Electron, CSS height:100% on <html> resolves via 100vh which can reference
  // the outer window's layout viewport rather than the iframe's rendered viewport.
  // window.innerHeight in JS always returns the correct iframe viewport height.
  // We push that value as an inline style so the CSS flex chain uses the right reference.
  function syncViewportHeight() {
    const h = window.innerHeight + 'px';
    document.documentElement.style.height = h;
    document.body.style.height            = h;
  }
  syncViewportHeight();

  // ResizeObserver gives the post-layout box size; used as the primary source
  // for viewport dimensions in fitToViewport / zoom-center calculations.
  let vpW = 0, vpH = 0;
  const vpObserver = new ResizeObserver(([entry]) => {
    vpW = entry.contentRect.width;
    vpH = entry.contentRect.height;
  });
  vpObserver.observe(viewportEl);

  // Visible space available to the map. The map page runs inside the shell's
  // iframe, where CSS vh / height:100% — and in some Electron builds even
  // window.innerHeight — resolve against the OUTER window rather than the iframe's
  // own box. The document then lays out taller than what's actually visible, and a
  // box-based fit (ResizeObserver's vpH / clientHeight, or innerHeight) scales the
  // image too tall so its bottom is clipped at the iframe edge.
  //
  // The reliable source is the parent: window.frameElement.getBoundingClientRect()
  // gives the iframe's real rendered size, measured in the shell where vh resolves
  // correctly. Available map height = that height minus the nav+toolbar above the
  // viewport (rect.top — plain content height, always correct). We fall back to
  // window.innerHeight for direct (non-iframe) navigation, then to box metrics.
  function viewportSize() {
    const rect = viewportEl.getBoundingClientRect();

    // The quirk is vertical only (vh / height:100% chains). Horizontal layout
    // resolves correctly, so the viewport's own width is reliable and also accounts
    // for the side panel when it's open. Only the height needs the frame measurement.
    let frameH = 0;
    try {
      const fe = window.frameElement;
      if (fe) frameH = fe.getBoundingClientRect().height;
    } catch { /* cross-origin — fall through to innerHeight */ }

    const vw = rect.width || vpW || viewportEl.clientWidth;
    const vh = Math.max(0, (frameH || window.innerHeight) - rect.top)
             || vpH || viewportEl.clientHeight;
    return { vw, vh };
  }

  function currentUiScale() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim();
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  function fitToViewport() {
    if (!imgNaturalW || !imgNaturalH) return;
    const { vw, vh } = viewportSize();
    const uiScale = currentUiScale();
    const fitVw = vw / uiScale;
    const fitVh = vh / uiScale;
    if (!fitVw || fitVh <= 0) return;
    scale = Math.min(fitVw / imgNaturalW, fitVh / imgNaturalH, 1);
    ox = (fitVw - imgNaturalW * scale) / 2;
    oy = (fitVh - imgNaturalH * scale) / 2;
    applyTransform();
  }

  function zoomAround(cx, cy, factor) {
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    const ratio    = newScale / scale;
    ox = cx - ratio * (cx - ox);
    oy = cy - ratio * (cy - oy);
    scale = newScale;
    applyTransform();
  }

  // ── Render pins ───────────────────────────────────────────────────────────────
  function renderPins() {
    pinsLayer.innerHTML = pins.map(p => {
      const loc   = locations.find(l => l.id === p.locationId);
      const label = p.label || loc?.name || 'Pin';
      return `
        <div class="map-pin${p.id === activePinId ? ' active' : ''}"
             data-pin-id="${esc(p.id)}"
             style="left:${p.x}%;top:${p.y}%"
             data-tooltip="${esc(label)}">
          <svg class="map-pin-svg" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.373 0 0 5.373 0 12c0 8.25 12 24 12 24S24 20.25 24 12C24 5.373 18.627 0 12 0z"/>
            <circle cx="12" cy="12" r="4.5" class="map-pin-hole"/>
          </svg>
          <span class="map-pin-label">${esc(label)}</span>
        </div>`;
    }).join('');

    pinsLayer.querySelectorAll('.map-pin').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        openPanel(el.dataset.pinId);
      });
    });
  }

  // ── View-mode info panel ──────────────────────────────────────────────────────
  function renderViewPanel(pin) {
    const loc = locations.find(l => l.id === pin.locationId);
    if (loc) {
      pinInfoNameEl.textContent = loc.name;
      const desc = (loc.description || '').trim();
      pinInfoDescEl.textContent = desc.length > 300 ? desc.slice(0, 300) + '…' : desc;
      pinInfoDescEl.hidden = !desc;
      const tags = Array.isArray(loc.tags) ? loc.tags : [];
      pinInfoTagsEl.innerHTML = tags.map(t => `<span class="tag">${esc(t)}</span>`).join('');
      pinInfoTagsEl.hidden = !tags.length;
      pinInfoLocLink.href   = `/location/view/${encodeURIComponent(loc.id)}`;
      pinInfoLocLink.hidden = false;
    } else {
      pinInfoNameEl.textContent = pin.label || 'Unnamed pin';
      pinInfoDescEl.textContent = 'No location linked. Switch to Edit mode to connect this pin to a location entry.';
      pinInfoDescEl.hidden      = false;
      pinInfoTagsEl.hidden      = true;
      pinInfoLocLink.hidden     = true;
    }
  }

  // ── Panel open / close ────────────────────────────────────────────────────────
  function openPanel(pinId) {
    const pin = pins.find(p => p.id === pinId);
    if (!pin) return;
    activePinId = pinId;
    renderPins();

    panelTitle.textContent = pin.label || 'Pin';
    panelEl.hidden = false;
    document.body.classList.add('map-panel-open');

    if (editMode) {
      pinEditFormEl.hidden = false;
      pinViewEl.hidden     = true;
      pinLabelInput.value  = pin.label || '';
      pinLocSelect.value   = pin.locationId || '';
      const loc = locations.find(l => l.id === pin.locationId);
      panelGoto.hidden = !loc;
      if (loc) pinLocLink.href = `/location/view/${encodeURIComponent(loc.id)}`;
    } else {
      pinEditFormEl.hidden = true;
      pinViewEl.hidden     = false;
      renderViewPanel(pin);
    }
  }

  function closePanel() {
    activePinId = null;
    panelEl.hidden = true;
    document.body.classList.remove('map-panel-open');
    renderPins();
  }

  // ── Mode toggle ───────────────────────────────────────────────────────────────
  function setMode(mode) {
    editMode = mode === 'edit';
    btnView.classList.toggle('active', !editMode);
    btnEdit.classList.toggle('active',  editMode);
    viewportEl.classList.toggle('map-edit-cursor', editMode);
    // If panel is open, re-render it in the new mode
    if (activePinId) openPanel(activePinId);
    // Clear space-pan when leaving edit mode
    if (!editMode) {
      spaceDown = false;
      viewportEl.classList.remove('map-space-pan');
    }
  }

  // ── Save pins ─────────────────────────────────────────────────────────────────
  async function savePins() {
    try {
      const res = await fetch('/api/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pins }),
      });
      if (!res.ok) throw new Error();
    } catch {
      showToast('Could not save pins', 'error');
    }
  }

  // ── Location dropdown ─────────────────────────────────────────────────────────
  function populateLocSelect() {
    const opts = locations.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
    pinLocSelect.innerHTML = '<option value="">— none —</option>' + opts;
  }

  // ── Image upload (canvas downscale to keep payload small) ─────────────────────
  const MAX_UPLOAD_PX = 2400;

  function downscaleToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { naturalWidth: w, naturalHeight: h } = img;
        if (w > MAX_UPLOAD_PX || h > MAX_UPLOAD_PX) {
          const ratio = MAX_UPLOAD_PX / Math.max(w, h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  uploadInput.addEventListener('change', async () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    uploadInput.value = '';
    try {
      const dataUrl = await downscaleToDataUrl(file);
      const res = await fetch('/api/map/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) throw new Error();
      loadMapImage();
      showToast('Map uploaded');
    } catch {
      showToast('Upload failed — try a smaller image', 'error');
    }
  });

  // ── Load map image ────────────────────────────────────────────────────────────
  function loadMapImage() {
    imgEl.src = `/api/map/image?t=${Date.now()}`;
    imgEl.onload = () => {
      imgNaturalW = imgEl.naturalWidth;
      imgNaturalH = imgEl.naturalHeight;
      canvasEl.style.width  = imgNaturalW + 'px';
      canvasEl.style.height = imgNaturalH + 'px';
      emptyEl.style.display = 'none';
      viewportEl.removeAttribute('hidden'); // removing attr avoids the !important CSS rule
      btnRemove.hidden = false;
      fitToViewport();
      // Re-fit after the browser has settled layout — nav.js / icons.js mutate the
      // nav height after map.js runs, which shifts the viewport's top edge. Fit to
      // window is the intended default view, so re-running here keeps it correct.
      requestAnimationFrame(() => requestAnimationFrame(fitToViewport));
    };
    imgEl.onerror = () => {
      emptyEl.style.display = '';
      viewportEl.setAttribute('hidden', '');
      btnRemove.hidden = true;
    };
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────────
  async function init() {
    try {
      const [mapRes, locRes] = await Promise.all([
        fetch('/api/map'),
        fetch('/api/locations'),
      ]);
      const mapData = mapRes.ok ? await mapRes.json() : { pins: [] };
      const locData = locRes.ok ? await locRes.json() : [];

      pins      = Array.isArray(mapData.pins) ? mapData.pins : [];
      locations = Array.isArray(locData)       ? locData      : [];

      populateLocSelect();
      if (mapData.imageFilename) loadMapImage();
      renderPins();
    } catch {
      showToast('Could not load map data', 'error');
    }
  }

  // ── Toolbar ───────────────────────────────────────────────────────────────────
  btnView.addEventListener('click', () => setMode('view'));
  btnEdit.addEventListener('click', () => setMode('edit'));
  btnZoomIn.addEventListener('click',  () => { const { vw, vh } = viewportSize(); zoomAround(vw / 2, vh / 2, 1.25); });
  btnZoomOut.addEventListener('click', () => { const { vw, vh } = viewportSize(); zoomAround(vw / 2, vh / 2, 0.8); });
  btnZoomFit.addEventListener('click', fitToViewport);

  btnRemove.addEventListener('click', async () => {
    const pinCount = pins.length;
    const ok = await showConfirm(
      pinCount
        ? `This will delete the map image and all ${pinCount} pin${pinCount === 1 ? '' : 's'} on it. This cannot be undone.`
        : 'This will delete the map image. This cannot be undone.',
      { title: 'Remove Map', confirmLabel: 'Remove Map', danger: true }
    );
    if (!ok) return;

    try {
      const res = await fetch('/api/map', { method: 'DELETE' });
      if (!res.ok) throw new Error();

      // Reset to the empty state — clear pins, image and zoom/pan.
      closePanel();
      pins = [];
      renderPins();
      imgEl.removeAttribute('src');
      imgNaturalW = imgNaturalH = 0;
      scale = 1; ox = oy = 0;
      viewportEl.setAttribute('hidden', '');
      emptyEl.style.display = '';
      btnRemove.hidden = true;
      showToast('Map removed');
    } catch {
      showToast('Could not remove map', 'error');
    }
  });

  // ── Panel — edit actions ──────────────────────────────────────────────────────
  panelClose.addEventListener('click', closePanel);

  pinSaveBtn.addEventListener('click', async () => {
    const pin = pins.find(p => p.id === activePinId);
    if (!pin) return;
    pin.label      = pinLabelInput.value.trim();
    pin.locationId = pinLocSelect.value || null;
    const loc = locations.find(l => l.id === pin.locationId);
    panelGoto.hidden = !loc;
    if (loc) pinLocLink.href = `/location/view/${encodeURIComponent(loc.id)}`;
    panelTitle.textContent = pin.label || 'Pin';
    await savePins();
    renderPins();
    showToast('Pin saved');
  });

  pinDeleteBtn.addEventListener('click', async () => {
    pins = pins.filter(p => p.id !== activePinId);
    closePanel();
    await savePins();
    showToast('Pin removed');
  });

  pinLocSelect.addEventListener('change', () => {
    const loc = locations.find(l => l.id === pinLocSelect.value);
    panelGoto.hidden = !loc;
    if (loc) pinLocLink.href = `/location/view/${encodeURIComponent(loc.id)}`;
  });

  // ── Panel — view action (switch to edit) ──────────────────────────────────────
  pinInfoEditBtn.addEventListener('click', () => {
    setMode('edit');
  });

  // ── Canvas click — place pin (edit mode, no space held) ──────────────────────
  viewportEl.addEventListener('click', e => {
    if (!editMode) return;
    if (e.target.closest('.map-pin')) return;
    if (dragging) return;
    if (spaceDown) return; // space was used for pan

    const rect = canvasEl.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width)  * 100;
    const yPct = ((e.clientY - rect.top)  / rect.height) * 100;

    const pin = { id: genId(), x: xPct, y: yPct, label: '', locationId: null };
    pins.push(pin);
    renderPins();
    openPanel(pin.id);
    savePins();
  });

  // ── Drag to pan ───────────────────────────────────────────────────────────────
  // View mode: any drag pans. Edit mode: only pan when Space is held.
  viewportEl.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.map-pin')) return;
    if (editMode && !spaceDown) return;
    dragging  = false;
    dragStart = { x: e.clientX, y: e.clientY, ox, oy };
    canvasEl.style.willChange = 'transform';
    viewportEl.classList.add('map-dragging');
  });

  window.addEventListener('mousemove', e => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (!dragging && Math.abs(dx) + Math.abs(dy) > 4) dragging = true;
    if (!dragging) return;
    ox = dragStart.ox + dx;
    oy = dragStart.oy + dy;
    applyTransform();
  });

  window.addEventListener('mouseup', () => {
    dragStart = null;
    canvasEl.style.willChange = '';
    viewportEl.classList.remove('map-dragging');
    setTimeout(() => { dragging = false; }, 0);
  });

  // ── Scroll to zoom ────────────────────────────────────────────────────────────
  viewportEl.addEventListener('wheel', e => {
    e.preventDefault();
    const rect   = viewportEl.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAround(e.clientX - rect.left, e.clientY - rect.top, factor);
  }, { passive: false });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;

    // Space = temporary pan mode in edit mode
    if (e.code === 'Space') {
      e.preventDefault();
      if (!spaceDown) {
        spaceDown = true;
        if (editMode) viewportEl.classList.add('map-space-pan');
      }
      return;
    }

    const { vw, vh } = viewportSize();
    const cx = vw / 2;
    const cy = vh / 2;
    if (e.key === '=' || e.key === '+') zoomAround(cx, cy, 1.25);
    if (e.key === '-')                  zoomAround(cx, cy, 0.8);
    if (e.key === '0')                  fitToViewport();
    if (e.key === 'Escape')             closePanel();
    if (e.key === 'e')                  setMode(editMode ? 'view' : 'edit');
  });

  document.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      spaceDown = false;
      viewportEl.classList.remove('map-space-pan');
      // cancel drag so releasing space doesn't leave ghost drag state
      dragStart = null;
      viewportEl.classList.remove('map-dragging');
    }
  });

  // ── Touch zoom/pan ────────────────────────────────────────────────────────────
  let lastTouchDist = null;
  let lastTouchMid  = null;

  viewportEl.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      lastTouchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      lastTouchMid  = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
      canvasEl.style.willChange = 'transform';
    }
  }, { passive: true });

  viewportEl.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t0   = e.touches[0], t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const mid  = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
      const rect = viewportEl.getBoundingClientRect();
      if (lastTouchDist) {
        zoomAround(mid.x - rect.left, mid.y - rect.top, dist / lastTouchDist);
        ox += mid.x - lastTouchMid.x;
        oy += mid.y - lastTouchMid.y;
        applyTransform();
      }
      lastTouchDist = dist;
      lastTouchMid  = mid;
    }
  }, { passive: false });

  viewportEl.addEventListener('touchend', () => {
    lastTouchDist = null;
    lastTouchMid  = null;
    canvasEl.style.willChange = '';
  }, { passive: true });

  window.addEventListener('resize', () => {
    syncViewportHeight();
    if (imgNaturalW) fitToViewport();
  });

  // ── Init ──────────────────────────────────────────────────────────────────────
  init();
})();
