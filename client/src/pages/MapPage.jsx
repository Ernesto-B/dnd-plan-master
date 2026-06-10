import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppLink from '../components/AppLink.jsx';
import { toast, confirmDialog } from '../lib/vanilla.js';

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const MAX_UPLOAD_PX = 2400;
const PIN_ENTITY_TYPES = ['location', 'faction', 'session'];

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function formatSessionNumber(value) {
  const raw = String(value ?? '?');
  return raw.includes('.') ? raw : raw.padStart(3, '0');
}

function trimText(value) {
  return String(value || '').trim();
}

function truncate(value, max = 220) {
  const text = trimText(value);
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function normalizePin(pin = {}) {
  const entityType = PIN_ENTITY_TYPES.includes(pin.entityType)
    ? pin.entityType
    : (pin.locationId ? 'location' : '');
  const entityId = trimText(pin.entityId || (entityType === 'location' ? pin.locationId : ''));
  return {
    ...pin,
    id: trimText(pin.id) || genId(),
    x: Number(pin.x) || 0,
    y: Number(pin.y) || 0,
    label: trimText(pin.label),
    entityType,
    entityId: entityType && entityId ? entityId : '',
    locationId: entityType === 'location' && entityId ? entityId : null,
  };
}

function serializePin(pin) {
  const normalized = normalizePin(pin);
  return {
    id: normalized.id,
    x: normalized.x,
    y: normalized.y,
    label: normalized.label,
    entityType: normalized.entityType || null,
    entityId: normalized.entityId || null,
    locationId: normalized.entityType === 'location' ? normalized.entityId : null,
  };
}

function entityHref(type, id) {
  if (!id) return '';
  if (type === 'location') return `/location/view/${encodeURIComponent(id)}`;
  if (type === 'faction') return `/faction/view/${encodeURIComponent(id)}`;
  if (type === 'session') return `/view/${encodeURIComponent(id)}`;
  return '';
}

function summarizeEntity(type, entity) {
  if (!entity) return null;
  if (type === 'location') {
    return {
      type,
      typeLabel: 'Location',
      title: entity.name || 'Unnamed location',
      optionLabel: entity.name || entity.id,
      description: truncate(entity.description || 'No location description yet.'),
      meta: entity.id,
      tags: Array.isArray(entity.tags) ? entity.tags : [],
      href: entityHref(type, entity.id),
      ctaLabel: 'View Location',
    };
  }
  if (type === 'faction') {
    return {
      type,
      typeLabel: 'Faction',
      title: entity.name || 'Unnamed faction',
      optionLabel: entity.name || entity.id,
      description: truncate(entity.goal || entity.origin || 'No faction goal logged yet.'),
      meta: [entity.origin, entity.id].filter(Boolean).join(' · '),
      tags: Array.isArray(entity.tags) ? entity.tags : [],
      href: entityHref(type, entity.id),
      ctaLabel: 'View Faction',
    };
  }
  if (type === 'session') {
    const sessionLabel = `Session #${formatSessionNumber(entity.sessionNumber)}`;
    return {
      type,
      typeLabel: 'Session',
      title: sessionLabel,
      optionLabel: entity.goal ? `${sessionLabel} — ${entity.goal}` : sessionLabel,
      description: truncate(entity.goal || 'No session goal recorded yet.'),
      meta: [entity.date, entity.partyLevel ? `Lv ${entity.partyLevel}` : null, entity.id].filter(Boolean).join(' · '),
      tags: Array.isArray(entity.tags) ? entity.tags : [],
      href: entityHref(type, entity.id),
      ctaLabel: 'View Session',
    };
  }
  return null;
}

export default function MapPage() {
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  const t = useRef({ scale: 1, ox: 0, oy: 0, imgW: 0, imgH: 0 });
  const drag = useRef({ active: false, moved: false, start: null, space: false });
  const campaignId = useRef('c-default');
  const imageFilename = useRef(null);
  const hydrated = useRef(false);
  const persistTimer = useRef(null);

  const [pins, setPins] = useState([]);
  const pinsRef = useRef([]);
  const [locations, setLocations] = useState([]);
  const [factions, setFactions] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const editRef = useRef(false);
  const [activeId, setActiveId] = useState(null);
  const activeRef = useRef(null);
  const [hasImage, setHasImage] = useState(false);
  const [panelDraft, setPanelDraft] = useState({ label: '', entityType: '', entityId: '' });

  const setPinsBoth = next => {
    const normalized = (Array.isArray(next) ? next : []).map(normalizePin);
    pinsRef.current = normalized;
    setPins(normalized);
  };

  useEffect(() => { editRef.current = editMode; }, [editMode]);
  useEffect(() => { activeRef.current = activeId; }, [activeId]);

  const entityLists = useMemo(() => ({
    location: locations,
    faction: factions,
    session: sessions,
  }), [locations, factions, sessions]);

  const entityIndex = useMemo(() => {
    const map = new Map();
    for (const type of PIN_ENTITY_TYPES) {
      for (const entity of entityLists[type] || []) {
        if (!entity?.id) continue;
        map.set(`${type}:${entity.id}`, summarizeEntity(type, entity));
      }
    }
    return map;
  }, [entityLists]);

  const entityOptions = useMemo(() => (
    PIN_ENTITY_TYPES.map(type => ({
      type,
      label: type === 'location' ? 'Locations' : type === 'faction' ? 'Factions' : 'Sessions',
      items: (entityLists[type] || [])
        .map(entity => ({
          value: `${type}:${entity.id}`,
          label: summarizeEntity(type, entity)?.optionLabel || entity.id,
        })),
    })).filter(group => group.items.length > 0)
  ), [entityLists]);

  function getPinSummary(pinLike) {
    const normalized = normalizePin(pinLike);
    if (!normalized.entityType || !normalized.entityId) return null;
    return entityIndex.get(`${normalized.entityType}:${normalized.entityId}`) || null;
  }

  function getPinDisplayLabel(pinLike) {
    const normalized = normalizePin(pinLike);
    return normalized.label || getPinSummary(normalized)?.title || 'Pin';
  }

  function parseEntitySelection(value) {
    const raw = trimText(value);
    if (!raw || !raw.includes(':')) return { entityType: '', entityId: '' };
    const [entityType, ...rest] = raw.split(':');
    const entityId = rest.join(':').trim();
    if (!PIN_ENTITY_TYPES.includes(entityType) || !entityId) return { entityType: '', entityId: '' };
    return { entityType, entityId };
  }

  const storageKey = () => `dnd-map-view:${campaignId.current || 'c-default'}`;
  const persist = useCallback(() => {
    if (!hydrated.current || !imageFilename.current || !t.current.imgW) return;
    try {
      localStorage.setItem(storageKey(), JSON.stringify({
        imageFilename: imageFilename.current,
        imgNaturalW: t.current.imgW,
        imgNaturalH: t.current.imgH,
        scale: +t.current.scale.toFixed(6),
        ox: +t.current.ox.toFixed(3),
        oy: +t.current.oy.toFixed(3),
      }));
    } catch {}
  }, []);

  const schedulePersist = useCallback(() => {
    if (!hydrated.current) return;
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(persist, 120);
  }, [persist]);

  const restoreView = useCallback(() => {
    if (!imageFilename.current || !t.current.imgW) return false;
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed.imageFilename !== imageFilename.current || parsed.imgNaturalW !== t.current.imgW || parsed.imgNaturalH !== t.current.imgH) return false;
      if (![parsed.scale, parsed.ox, parsed.oy].every(Number.isFinite)) return false;
      t.current.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, parsed.scale));
      t.current.ox = parsed.ox;
      t.current.oy = parsed.oy;
      applyTransform();
      return true;
    } catch {
      return false;
    }
  }, []);

  const applyTransform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.transform = `translate(${t.current.ox}px, ${t.current.oy}px) scale(${t.current.scale})`;
    canvas.querySelector('.map-pins-layer')?.style.setProperty('--pin-scale', t.current.scale);
    schedulePersist();
  }, [schedulePersist]);

  const viewportSize = () => {
    const viewport = viewportRef.current;
    return { vw: viewport?.clientWidth || 0, vh: viewport?.clientHeight || 0 };
  };

  const fit = useCallback(() => {
    const { imgW, imgH } = t.current;
    if (!imgW || !imgH) return;
    const { vw, vh } = viewportSize();
    const pad = 12;
    const fw = Math.max(0, vw - pad * 2);
    const fh = Math.max(0, vh - pad * 2);
    if (!fw || fh <= 0) return;
    t.current.scale = Math.min(fw / imgW, fh / imgH, 1);
    t.current.ox = pad + (fw - imgW * t.current.scale) / 2;
    t.current.oy = pad + (fh - imgH * t.current.scale) / 2;
    applyTransform();
  }, [applyTransform]);

  const zoomAround = useCallback((cx, cy, factor) => {
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.current.scale * factor));
    const ratio = nextScale / t.current.scale;
    t.current.ox = cx - ratio * (cx - t.current.ox);
    t.current.oy = cy - ratio * (cy - t.current.oy);
    t.current.scale = nextScale;
    applyTransform();
  }, [applyTransform]);

  const savePins = useCallback(async list => {
    try {
      const res = await fetch('/api/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pins: (Array.isArray(list) ? list : []).map(serializePin) }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast('Could not save pins', 'error');
    }
  }, []);

  const loadImage = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    img.src = `/api/map/image?t=${Date.now()}`;
    img.onload = () => {
      t.current.imgW = img.naturalWidth;
      t.current.imgH = img.naturalHeight;
      if (canvasRef.current) {
        canvasRef.current.style.width = `${img.naturalWidth}px`;
        canvasRef.current.style.height = `${img.naturalHeight}px`;
      }
      setHasImage(true);
      hydrated.current = false;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!restoreView()) fit();
        hydrated.current = true;
        persist();
      }));
      if (!restoreView()) fit();
    };
    img.onerror = () => {
      setHasImage(false);
      hydrated.current = false;
    };
  }, [fit, persist, restoreView]);

  useEffect(() => {
    document.title = 'World Map — D&D Session Master';
    document.body.classList.add('map-route');
    (async () => {
      try {
        const [mapRes, locRes, factionRes, sessionRes] = await Promise.all([
          fetch('/api/map'),
          fetch('/api/locations'),
          fetch('/api/factions'),
          fetch('/api/sessions'),
        ]);
        const map = mapRes.ok ? await mapRes.json() : { pins: [] };
        const locs = locRes.ok ? await locRes.json() : [];
        const factionList = factionRes.ok ? await factionRes.json() : [];
        const sessionList = sessionRes.ok ? await sessionRes.json() : [];
        campaignId.current = map.campaignId || 'c-default';
        imageFilename.current = map.imageFilename || null;
        setPinsBoth(Array.isArray(map.pins) ? map.pins : []);
        setLocations(Array.isArray(locs) ? locs : []);
        setFactions(Array.isArray(factionList) ? factionList : []);
        setSessions(Array.isArray(sessionList) ? sessionList : []);
        if (map.imageFilename) loadImage();
      } catch {
        toast('Could not load map data', 'error');
      }
    })();
    return () => { document.body.classList.remove('map-route', 'map-panel-open'); };
  }, [loadImage]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = e => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      zoomAround(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    const onDown = e => {
      if (e.button !== 0 || e.target.closest('.map-pin')) return;
      if (editRef.current && !drag.current.space) return;
      drag.current.active = true;
      drag.current.moved = false;
      drag.current.start = { x: e.clientX, y: e.clientY, ox: t.current.ox, oy: t.current.oy };
      if (canvasRef.current) canvasRef.current.style.willChange = 'transform';
      vp.classList.add('map-dragging');
    };
    const onMove = e => {
      if (!drag.current.active || !drag.current.start) return;
      const dx = e.clientX - drag.current.start.x;
      const dy = e.clientY - drag.current.start.y;
      if (!drag.current.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
      if (!drag.current.moved) return;
      t.current.ox = drag.current.start.ox + dx;
      t.current.oy = drag.current.start.oy + dy;
      applyTransform();
    };
    const onUp = () => {
      drag.current.active = false;
      drag.current.start = null;
      if (canvasRef.current) canvasRef.current.style.willChange = '';
      vp.classList.remove('map-dragging');
      setTimeout(() => { drag.current.moved = false; }, 0);
    };
    let lastDist = null;
    let lastMid = null;
    const onTouchStart = e => {
      if (e.touches.length !== 2) return;
      const [a, b] = e.touches;
      lastDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      lastMid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    };
    const onTouchMove = e => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = e.touches;
      const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const mid = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
      const rect = vp.getBoundingClientRect();
      if (lastDist) {
        zoomAround(mid.x - rect.left, mid.y - rect.top, dist / lastDist);
        t.current.ox += mid.x - lastMid.x;
        t.current.oy += mid.y - lastMid.y;
        applyTransform();
      }
      lastDist = dist;
      lastMid = mid;
    };
    const onTouchEnd = () => {
      lastDist = null;
      lastMid = null;
    };
    const onKey = e => {
      if (e.target.matches('input, select, textarea')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!drag.current.space) {
          drag.current.space = true;
          if (editRef.current) vp.classList.add('map-space-pan');
        }
        return;
      }
      const { vw, vh } = viewportSize();
      if (e.key === '=' || e.key === '+') zoomAround(vw / 2, vh / 2, 1.25);
      if (e.key === '-') zoomAround(vw / 2, vh / 2, 0.8);
      if (e.key === '0') fit();
      if (e.key === 'Escape') closePanel();
      if (e.key === 'e') setEditMode(mode => !mode);
    };
    const onKeyUp = e => {
      if (e.code !== 'Space') return;
      drag.current.space = false;
      vp.classList.remove('map-space-pan');
      drag.current.start = null;
      vp.classList.remove('map-dragging');
    };
    const onResize = () => {
      if (t.current.imgW) fit();
    };

    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('mousedown', onDown);
    vp.addEventListener('touchstart', onTouchStart, { passive: true });
    vp.addEventListener('touchmove', onTouchMove, { passive: false });
    vp.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    return () => {
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('mousedown', onDown);
      vp.removeEventListener('touchstart', onTouchStart);
      vp.removeEventListener('touchmove', onTouchMove);
      vp.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
    };
  }, [applyTransform, fit, zoomAround]);

  function openPanel(pinId) {
    const pin = pinsRef.current.find(item => item.id === pinId);
    if (!pin) return;
    setActiveId(pinId);
    setPanelDraft({
      label: pin.label || '',
      entityType: pin.entityType || '',
      entityId: pin.entityId || '',
    });
    document.body.classList.add('map-panel-open');
  }

  function closePanel() {
    setActiveId(null);
    document.body.classList.remove('map-panel-open');
  }

  function onViewportClick(e) {
    if (!editRef.current || e.target.closest('.map-pin') || drag.current.moved || drag.current.space) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const pin = normalizePin({ id: genId(), x, y, label: '', entityType: '', entityId: '' });
    const next = [...pinsRef.current, pin];
    setPinsBoth(next);
    savePins(next);
    openPanel(pin.id);
  }

  async function savePin() {
    const next = pinsRef.current.map(pin => {
      if (pin.id !== activeRef.current) return pin;
      return normalizePin({
        ...pin,
        label: panelDraft.label.trim(),
        entityType: panelDraft.entityType || '',
        entityId: panelDraft.entityId || '',
        locationId: panelDraft.entityType === 'location' ? (panelDraft.entityId || '') : null,
      });
    });
    setPinsBoth(next);
    await savePins(next);
    toast('Pin saved');
  }

  async function deletePin() {
    const next = pinsRef.current.filter(pin => pin.id !== activeRef.current);
    setPinsBoth(next);
    closePanel();
    await savePins(next);
    toast('Pin removed');
  }

  function downscale(file) {
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
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await downscale(file);
      const res = await fetch('/api/map/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) throw new Error();
      const payload = await res.json().catch(() => ({}));
      imageFilename.current = payload.filename || imageFilename.current;
      hydrated.current = false;
      try { localStorage.removeItem(storageKey()); } catch {}
      loadImage();
      toast('Map uploaded');
    } catch {
      toast('Upload failed — try a smaller image', 'error');
    }
  }

  async function onRemove() {
    const count = pinsRef.current.length;
    const ok = await confirmDialog(
      count
        ? `This will delete the map image and all ${count} pin${count === 1 ? '' : 's'}. This cannot be undone.`
        : 'This will delete the map image. This cannot be undone.',
      { title: 'Remove Map', confirmLabel: 'Remove Map', danger: true },
    );
    if (!ok) return;
    try {
      const res = await fetch('/api/map', { method: 'DELETE' });
      if (!res.ok) throw new Error();
      closePanel();
      setPinsBoth([]);
      if (imgRef.current) imgRef.current.removeAttribute('src');
      t.current = { scale: 1, ox: 0, oy: 0, imgW: 0, imgH: 0 };
      imageFilename.current = null;
      hydrated.current = false;
      try { localStorage.removeItem(storageKey()); } catch {}
      setHasImage(false);
      toast('Map removed');
    } catch {
      toast('Could not remove map', 'error');
    }
  }

  const activePin = pins.find(pin => pin.id === activeId) || null;
  const activePinSummary = activePin ? getPinSummary(activePin) : null;
  const draftLinkValue = panelDraft.entityType && panelDraft.entityId ? `${panelDraft.entityType}:${panelDraft.entityId}` : '';
  const draftPinSummary = panelDraft.entityType && panelDraft.entityId
    ? entityIndex.get(`${panelDraft.entityType}:${panelDraft.entityId}`) || null
    : null;

  return (
    <div className="map-shell map-shell-chrome">
      <div className="map-toolbar">
        <div className="map-toolbar-left">
          <button className={`map-tool-btn${!editMode ? ' active' : ''}`} onClick={() => setEditMode(false)}>View</button>
          <button className={`map-tool-btn${editMode ? ' active' : ''}`} onClick={() => setEditMode(true)}>Edit</button>
        </div>
        <div className="map-toolbar-center">
          <button className="map-tool-btn icon-btn" title="Zoom in (+)" onClick={() => { const { vw, vh } = viewportSize(); zoomAround(vw / 2, vh / 2, 1.25); }}>+</button>
          <button className="map-tool-btn icon-btn" title="Zoom out (−)" onClick={() => { const { vw, vh } = viewportSize(); zoomAround(vw / 2, vh / 2, 0.8); }}>−</button>
          <button className="map-tool-btn icon-btn" title="Fit to window (0)" onClick={fit}>⊡</button>
        </div>
        <div className="map-toolbar-right">
          {hasImage && <button className="map-tool-btn" onClick={onRemove}>Remove Map</button>}
          <label className="map-upload-label">Upload Map<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onUpload} /></label>
        </div>
      </div>

      <div className="map-body">
        {!hasImage && (
          <div className="map-empty">
            <div className="map-empty-inner">
              <div className="map-empty-icon">🗺️</div>
              <h2 className="map-empty-title">No map uploaded yet</h2>
              <p className="map-empty-sub">Click <strong>Upload Map</strong> in the toolbar to add your world map image.</p>
              <label className="btn btn-primary">Upload Map Image<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onUpload} /></label>
            </div>
          </div>
        )}

        <div ref={viewportRef} className={`map-viewport${editMode ? ' map-edit-cursor' : ''}`} hidden={!hasImage} onClick={onViewportClick}>
          <div ref={canvasRef} className="map-canvas">
            <img ref={imgRef} className="map-img" alt="World map" draggable="false" />
            <div className="map-pins-layer">
              {pins.map(pin => {
                const label = getPinDisplayLabel(pin);
                return (
                  <div
                    key={pin.id}
                    className={`map-pin${pin.id === activeId ? ' active' : ''}`}
                    style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                    title={label}
                    onClick={e => {
                      e.stopPropagation();
                      openPanel(pin.id);
                    }}
                  >
                    <svg className="map-pin-svg" viewBox="0 0 24 36"><path d="M12 0C5.373 0 0 5.373 0 12c0 8.25 12 24 12 24S24 20.25 24 12C24 5.373 18.627 0 12 0z" /><circle cx="12" cy="12" r="4.5" className="map-pin-hole" /></svg>
                    <span className="map-pin-label">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {activePin && (
          <div className="map-panel">
            <div className="map-panel-head">
              <h3 className="map-panel-title">{editMode ? getPinDisplayLabel({ ...activePin, ...panelDraft, locationId: panelDraft.entityType === 'location' ? panelDraft.entityId : null }) : getPinDisplayLabel(activePin)}</h3>
              <button className="map-panel-close" aria-label="Close panel" onClick={closePanel}>×</button>
            </div>
            <div className="map-panel-body">
              {editMode ? (
                <>
                  <label className="map-panel-label">Label</label>
                  <input className="map-panel-input" type="text" maxLength={80} placeholder="Optional custom pin label" value={panelDraft.label} onChange={e => setPanelDraft(draft => ({ ...draft, label: e.target.value }))} />

                  <label className="map-panel-label">Link to Record</label>
                  <select
                    className="map-panel-select"
                    value={draftLinkValue}
                    onChange={e => {
                      const next = parseEntitySelection(e.target.value);
                      setPanelDraft(draft => ({ ...draft, ...next }));
                    }}
                  >
                    <option value="">— none —</option>
                    {entityOptions.map(group => (
                      <optgroup key={group.type} label={group.label}>
                        {group.items.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </optgroup>
                    ))}
                  </select>

                  {draftPinSummary && (
                    <div className="map-panel-linked-card">
                      <div className="map-panel-linked-type">{draftPinSummary.typeLabel}</div>
                      <div className="map-panel-linked-name">{draftPinSummary.title}</div>
                      {draftPinSummary.meta ? <div className="map-panel-linked-meta">{draftPinSummary.meta}</div> : null}
                    </div>
                  )}

                  <div className="map-panel-actions">
                    <button className="btn btn-primary btn-sm" onClick={savePin}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={deletePin}>Delete Pin</button>
                  </div>

                  {draftPinSummary?.href && (
                    <div className="map-panel-goto">
                      <AppLink className="btn btn-ghost btn-sm" to={draftPinSummary.href}>{draftPinSummary.ctaLabel} →</AppLink>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  {activePinSummary ? (
                    <>
                      <div className="map-pin-info-kicker">{activePinSummary.typeLabel}</div>
                      <div className="map-pin-info-name">{activePinSummary.title}</div>
                      {activePin.label ? <div className="map-pin-info-meta">Pin label: {activePin.label}</div> : null}
                      <p className="map-pin-info-desc">{activePinSummary.description}</p>
                      {activePinSummary.meta ? <div className="map-pin-info-meta">{activePinSummary.meta}</div> : null}
                      {activePinSummary.tags?.length ? (
                        <div className="map-pin-info-tags">
                          {activePinSummary.tags.map((tag, index) => (
                            <span key={index} className={`tag-chip${String(tag || '').trim().toLowerCase() === 'draft' ? ' is-draft' : ''}`}>{tag}</span>
                          ))}
                        </div>
                      ) : null}
                      <div className="map-pin-info-actions">
                        <AppLink className="btn btn-primary btn-sm" to={activePinSummary.href}>{activePinSummary.ctaLabel} →</AppLink>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(true)}>Edit Pin</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="map-pin-info-kicker">Unlinked Pin</div>
                      <div className="map-pin-info-name">{getPinDisplayLabel(activePin)}</div>
                      <p className="map-pin-info-desc">No record linked yet. Switch to Edit mode to connect this pin to a location, faction, or session.</p>
                      <div className="map-pin-info-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditMode(true)}>Edit Pin</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
