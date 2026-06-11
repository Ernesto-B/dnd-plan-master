import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppLink from '../../components/AppLink.jsx';

const MIN_SCALE = 0.08;
const MAX_SCALE = 3;
const NODE_W = 196;
const NODE_H = 76;
const COL_W = 520;
const ITEM_H = NODE_H + 12;
const SESSION_GAP = 20;
const TOP_MARGIN = 40;
const ALL_TYPES = ['session', 'encounter', 'npc', 'location', 'faction'];
const TYPE_LABELS = { session: 'Sessions', encounter: 'Encounters', npc: 'NPCs', location: 'Locations', faction: 'Factions' };
const TYPE_SHORTCUTS = { encounter: 'E', npc: 'N', location: 'L', faction: 'F' };
const ABOVE_TYPES = ['encounter', 'npc'];
const BELOW_TYPES = ['location', 'faction'];
const GROUP_COLORS = [
  { bg: 'rgba(99,79,150,0.12)',   border: 'rgba(99,79,150,0.65)',   label: 'Indigo' },
  { bg: 'rgba(42,152,152,0.12)',  border: 'rgba(42,152,152,0.65)',  label: 'Teal'   },
  { bg: 'rgba(175,65,65,0.12)',   border: 'rgba(175,65,65,0.65)',   label: 'Rose'   },
  { bg: 'rgba(180,138,50,0.12)',  border: 'rgba(180,138,50,0.65)',  label: 'Amber'  },
  { bg: 'rgba(70,140,70,0.12)',   border: 'rgba(70,140,70,0.65)',   label: 'Sage'   },
  { bg: 'rgba(100,100,100,0.12)', border: 'rgba(100,100,100,0.65)', label: 'Stone'  },
];
const MIN_GROUP_W = 80;
const MIN_GROUP_H = 60;
const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MAX_UNDO = 50;

// ── Layout ──────────────────────────────────────────────────────────────────

function parseSessionNum(label) {
  const m = String(label || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function sortSessions(sessions) {
  return [...sessions].sort((a, b) => {
    if (a.meta && b.meta && a.meta !== b.meta) return String(a.meta).localeCompare(String(b.meta));
    return parseSessionNum(a.label) - parseSessionNum(b.label);
  });
}

function resolveCol(node, sessionIdxMap) {
  for (const lid of (node.links || [])) {
    if (sessionIdxMap.has(lid)) return sessionIdxMap.get(lid);
  }
  return 0;
}

// How many sub-columns to use within a session column for above/below nodes.
// Using 2 sub-columns with a small offset reduces vertical stacking clutter.
const SUB_COL_OFFSET = (NODE_W + 8); // horizontal shift between sub-columns

function computeLayout(nodes) {
  const sessions = sortSessions(nodes.filter(n => n.entityType === 'session'));
  const sessionIdxMap = new Map(sessions.map((s, i) => [s.id, i]));
  const numCols = Math.max(sessions.length, 1);

  // Count nodes per column per zone to determine required height above/below
  const aboveCounts = Array(numCols).fill(0);
  for (const node of nodes) {
    if (!ABOVE_TYPES.includes(node.entityType)) continue;
    aboveCounts[resolveCol(node, sessionIdxMap)]++;
  }
  // Each column uses 2 sub-cols; compute rows needed = ceil(count / 2)
  const maxAboveRows = Math.max(...aboveCounts.map(c => Math.ceil(c / 2)), 0);
  const sessionY = TOP_MARGIN + maxAboveRows * ITEM_H + SESSION_GAP;

  const positions = new Map();
  sessions.forEach((s, i) => {
    positions.set(s.id, { x: 60 + i * COL_W, y: sessionY });
  });

  // For above/below nodes, use 2 sub-columns per session column to reduce overlap.
  // Sub-col 0: same x as session, Sub-col 1: offset right by SUB_COL_OFFSET
  const upCursorA = Array(numCols).fill(sessionY - SESSION_GAP); // sub-col 0
  const upCursorB = Array(numCols).fill(sessionY - SESSION_GAP); // sub-col 1
  const upSubIdx  = Array(numCols).fill(0); // which sub-col to place next node in

  const downCursorA = Array(numCols).fill(sessionY + NODE_H + SESSION_GAP);
  const downCursorB = Array(numCols).fill(sessionY + NODE_H + SESSION_GAP);
  const downSubIdx  = Array(numCols).fill(0);

  for (const type of ABOVE_TYPES) {
    for (const node of nodes) {
      if (node.entityType !== type) continue;
      const col = resolveCol(node, sessionIdxMap);
      const sub = upSubIdx[col] % 2;
      upSubIdx[col]++;
      if (sub === 0) {
        const y = upCursorA[col] - NODE_H;
        upCursorA[col] = y - 12;
        // Sync the other cursor to the same row when we start a new row
        if (upSubIdx[col] % 2 === 0) upCursorB[col] = upCursorA[col];
        positions.set(node.id, { x: 60 + col * COL_W, y });
      } else {
        const y = upCursorB[col] - NODE_H;
        upCursorB[col] = y - 12;
        positions.set(node.id, { x: 60 + col * COL_W + SUB_COL_OFFSET, y });
      }
    }
  }

  for (const type of BELOW_TYPES) {
    for (const node of nodes) {
      if (node.entityType !== type) continue;
      const col = resolveCol(node, sessionIdxMap);
      const sub = downSubIdx[col] % 2;
      downSubIdx[col]++;
      if (sub === 0) {
        const y = downCursorA[col];
        downCursorA[col] = y + ITEM_H;
        if (downSubIdx[col] % 2 === 0) downCursorB[col] = downCursorA[col];
        positions.set(node.id, { x: 60 + col * COL_W, y });
      } else {
        const y = downCursorB[col];
        downCursorB[col] = y + ITEM_H;
        positions.set(node.id, { x: 60 + col * COL_W + SUB_COL_OFFSET, y });
      }
    }
  }

  return { positions, sessionIdxMap, sortedSessions: sessions };
}

function canvasBounds(positions) {
  let maxX = 600, maxY = 500;
  for (const { x, y } of positions.values()) {
    maxX = Math.max(maxX, x + NODE_W + 80);
    maxY = Math.max(maxY, y + NODE_H + 80);
  }
  return { w: maxX, h: maxY };
}

function edgeEndpoints(sp, tp) {
  const sx = sp.x + NODE_W / 2, sy = sp.y + NODE_H / 2;
  const ex = tp.x + NODE_W / 2, ey = tp.y + NODE_H / 2;
  const dx = ex - sx, dy = ey - sy;
  const len = Math.hypot(dx, dy);
  if (len < 2) return null;
  const nx = dx / len, ny = dy / len;
  const shrink = Math.abs(nx) > Math.abs(ny) ? NODE_W / 2 + 4 : NODE_H / 2 + 4;
  return { x1: sx + nx * shrink, y1: sy + ny * shrink, x2: ex - nx * shrink, y2: ey - ny * shrink };
}

// ── Persistence helpers ───────────────────────────────────────────────────────

// localStorage is kept only as a fast read-through cache; the server is the
// source of truth. The special name "__workspace__" is used for an implicit
// auto-save view so positions survive without the user explicitly naming a view.

function storageKey(campaignId) { return `dnd-graph:positions:${campaignId || 'c-default'}`; }
function groupsStorageKey(campaignId) { return `dnd-graph:groups:${campaignId || 'c-default'}`; }
function viewportStorageKey(campaignId) { return `dnd-graph:viewport:${campaignId || 'c-default'}`; }

function loadCachedPositions(campaignId, ref) {
  try {
    const raw = localStorage.getItem(storageKey(campaignId));
    if (!raw) return;
    for (const [id, pos] of Object.entries(JSON.parse(raw))) {
      if (typeof pos?.x === 'number' && typeof pos?.y === 'number') ref.current.set(id, pos);
    }
  } catch {}
}

function cachePositions(campaignId, ref) {
  try { localStorage.setItem(storageKey(campaignId), JSON.stringify(Object.fromEntries(ref.current))); } catch {}
}

// Persist positions — cache locally. The component also runs a reactive effect
// that schedules a debounced server workspace save whenever positionsTick changes.
function persistPositions(campaignId, ref) {
  cachePositions(campaignId, ref);
}

function loadCachedGroups(campaignId) {
  try {
    const raw = localStorage.getItem(groupsStorageKey(campaignId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function cacheGroups(campaignId, groups) {
  try { localStorage.setItem(groupsStorageKey(campaignId), JSON.stringify(groups)); } catch {}
}

// Persist groups — cache locally. Server save is handled by reactive effect.
function persistGroups(campaignId, groups) {
  cacheGroups(campaignId, groups);
}

function loadCachedViewport(campaignId) {
  try {
    const raw = localStorage.getItem(viewportStorageKey(campaignId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function cacheViewport(campaignId, vp) {
  try { localStorage.setItem(viewportStorageKey(campaignId), JSON.stringify(vp)); } catch {}
}

function genGroupId() { return 'grp-' + Math.random().toString(36).slice(2, 8); }

// ── Tiny SVG icons ────────────────────────────────────────────────────────────

function IconLocked() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}

function IconUnlocked() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
    </svg>
  );
}

function IconUndo() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7v6h6"/>
      <path d="M3 13C5.5 6.5 13 4 19 8"/>
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CampaignGraphWorkspace({ graphData, campaignId = 'c-default' }) {
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const t = useRef({ scale: 1, ox: 0, oy: 0 });
  const drag = useRef({ active: false, moved: false, start: null });
  const dragNodeRef = useRef(null);
  const nodeWasDraggedRef = useRef(false);
  const nodePositionsRef = useRef(new Map());
  const sortedSessionsRef = useRef([]);

  // Refs for imperative drag (no React re-render per pixel)
  const effectivePositionsRef = useRef(new Map());
  const edgesIndexByNodeRef = useRef(new Map());

  // Group refs
  const groupsRef = useRef([]);
  const groupDragRef = useRef(null);
  const groupWasDraggedRef = useRef(false);

  // Undo
  const [undoStack, setUndoStack] = useState([]);
  const undoStackRef = useRef([]);
  const handleUndoRef = useRef(null); // always points to latest handleUndo
  const toggleTypeRef = useRef(null);
  const toggleContinuityNotesRef = useRef(null);
  const toggleShortcutsRef = useRef(null);

  // Core state
  const [activeTypes, setActiveTypes] = useState(new Set(ALL_TYPES));
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [layoutSeed, setLayoutSeed] = useState(0);
  const [positionsTick, setPositionsTick] = useState(0);

  // Group state
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupLabel, setEditingGroupLabel] = useState('');

  // Named views
  const [views, setViews] = useState([]);
  const [activeViewId, setActiveViewId] = useState(null);
  const [showSaveBar, setShowSaveBar] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showViewsMenu, setShowViewsMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const viewsMenuRef = useRef(null);

  const [showContinuityNotes, setShowContinuityNotes] = useState(true);
  const [expandedEdgeNotes, setExpandedEdgeNotes] = useState(new Set());

  // Isolation mode: when non-null, only these IDs + the selected node are rendered
  const [isolatedIds, setIsolatedIds] = useState(null);

  const allNodes = useMemo(() => graphData?.nodes || [], [graphData]);
  const allEdges = useMemo(() => graphData?.edges || [], [graphData]);

  // ── Undo ───────────────────────────────────────────────────────────────────

  const pushUndo = useCallback((action) => {
    setUndoStack(prev => {
      const next = [...prev.slice(-(MAX_UNDO - 1)), action];
      undoStackRef.current = next;
      return next;
    });
  }, []);

  // handleUndo is re-assigned every render so it always closes over current campaignId
  function handleUndo() {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const action = stack[stack.length - 1];
    const next = stack.slice(0, -1);
    undoStackRef.current = next;
    setUndoStack(next);

    switch (action.type) {
      case 'move-node': {
        if (action.prevHadSaved) {
          nodePositionsRef.current.set(action.nodeId, { x: action.prevX, y: action.prevY });
        } else {
          nodePositionsRef.current.delete(action.nodeId);
        }
        persistPositions(campaignId, nodePositionsRef);
        setPositionsTick(tick => tick + 1);
        setActiveViewId(id => id ? `${id}*` : null);
        break;
      }
      case 'move-group':
      case 'resize-group': {
        const updated = groupsRef.current.map(g => g.id !== action.groupId ? g : { ...g, ...action.prev });
        groupsRef.current = updated;
        setGroups(updated);
        persistGroups(campaignId, updated);
        setActiveViewId(id => id ? `${id}*` : null);
        break;
      }
      case 'delete-group': {
        const updated = [...groupsRef.current, action.group];
        groupsRef.current = updated;
        setGroups(updated);
        persistGroups(campaignId, updated);
        setActiveViewId(id => id ? `${id}*` : null);
        break;
      }
      case 'create-group': {
        const updated = groupsRef.current.filter(g => g.id !== action.groupId);
        groupsRef.current = updated;
        setGroups(updated);
        persistGroups(campaignId, updated);
        setActiveViewId(id => id ? `${id}*` : null);
        break;
      }
      case 'recolor-group': {
        const updated = groupsRef.current.map(g => g.id !== action.groupId ? g : { ...g, colorIdx: action.prevColorIdx });
        groupsRef.current = updated;
        setGroups(updated);
        persistGroups(campaignId, updated);
        setActiveViewId(id => id ? `${id}*` : null);
        break;
      }
      case 'rename-group': {
        const updated = groupsRef.current.map(g => g.id !== action.groupId ? g : { ...g, label: action.prevLabel });
        groupsRef.current = updated;
        setGroups(updated);
        persistGroups(campaignId, updated);
        setActiveViewId(id => id ? `${id}*` : null);
        break;
      }
      case 'lock-group': {
        const updated = groupsRef.current.map(g => g.id !== action.groupId ? g : { ...g, locked: action.prevLocked });
        groupsRef.current = updated;
        setGroups(updated);
        persistGroups(campaignId, updated);
        setActiveViewId(id => id ? `${id}*` : null);
        break;
      }
      default: break;
    }
  }
  handleUndoRef.current = handleUndo;

  // Keyboard shortcuts — stable effect, reads latest handlers via refs
  useEffect(() => {
    const onKeyDown = e => {
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndoRef.current?.();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        toggleShortcutsRef.current?.();
        return;
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const keyTypeMap = { e: 'encounter', n: 'npc', l: 'location', f: 'faction' };
        if (keyTypeMap[e.key]) { e.preventDefault(); toggleTypeRef.current?.(keyTypeMap[e.key]); return; }
        if (e.key === 'c') { e.preventDefault(); toggleContinuityNotesRef.current?.(); return; }
        if (e.key === 'Escape') { setShowShortcuts(false); return; }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Ref to the workspace auto-save debounce timer
  const persistWorkspaceTimerRef = useRef(null);
  // Cached ID of the __workspace__ view so we don't GET every time
  const workspaceViewIdRef = useRef(null);
  // Ref that points to the current activeTypes Set (so the debounce callback can read it)
  const activeTypesRef = useRef(activeTypes);
  useEffect(() => { activeTypesRef.current = activeTypes; }, [activeTypes]);

  // ── Workspace auto-save (server-backed, no named view) ────────────────────
  // Saves positions/groups/viewport to the server as a hidden "__workspace__" view
  // so layout survives without the user needing to name a view.
  const doWorkspaceSave = useCallback(async (cid, posRef, grpsRef, tRef) => {
    try {
      const payload = {
        name: '__workspace__',
        filters: [...activeTypesRef.current],
        positions: Object.fromEntries(posRef.current),
        viewport: { scale: tRef.current.scale, ox: tRef.current.ox, oy: tRef.current.oy },
        groups: grpsRef.current,
      };
      if (workspaceViewIdRef.current) {
        const r = await fetch(`/api/campaigns/${cid}/graph-views/${workspaceViewIdRef.current}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (r.status === 404) {
          // View was deleted externally; fall back to creating a new one
          workspaceViewIdRef.current = null;
        } else { return; }
      }
      // No cached ID: create a new __workspace__ view
      const res = await fetch(`/api/campaigns/${cid}/graph-views`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (res.ok) {
        const created = await res.json();
        workspaceViewIdRef.current = created.id;
      }
    } catch {}
  }, []);

  const scheduleWorkspaceSave = useCallback(() => {
    if (persistWorkspaceTimerRef.current) clearTimeout(persistWorkspaceTimerRef.current);
    persistWorkspaceTimerRef.current = setTimeout(() => {
      doWorkspaceSave(campaignId, nodePositionsRef, groupsRef, t);
    }, 2000); // 2-second debounce
  }, [campaignId, doWorkspaceSave]);

  // Expose scheduleWorkspaceSave as a stable ref for use inside event handlers
  const scheduleWorkspaceSaveRef = useRef(scheduleWorkspaceSave);
  useEffect(() => { scheduleWorkspaceSaveRef.current = scheduleWorkspaceSave; }, [scheduleWorkspaceSave]);

  // ── Data load ─────────────────────────────────────────────────────────────

  useEffect(() => {
    nodePositionsRef.current.clear();
    workspaceViewIdRef.current = null;
    // Reset state immediately while we fetch from server
    setPositionsTick(v => v + 1);
    setActiveViewId(null);
    setSelectedGroupId(null);
    setIsolatedIds(null);
    setUndoStack([]);
    undoStackRef.current = [];

    fetch(`/api/campaigns/${campaignId}/graph-views`)
      .then(r => r.ok ? r.json() : [])
      .then(viewsList => {
        setViews(viewsList.filter(v => v.name !== '__workspace__'));

        // Load default view if one exists, otherwise fall back to __workspace__, then localStorage
        const defaultView = viewsList.find(v => v.isDefault && v.name !== '__workspace__');
        const workspaceView = viewsList.find(v => v.name === '__workspace__');
        // Cache the workspace view ID so the auto-save can PUT instead of POST
        if (workspaceView) workspaceViewIdRef.current = workspaceView.id;
        const toLoad = defaultView || workspaceView;

        if (toLoad) {
          nodePositionsRef.current.clear();
          for (const [id, pos] of Object.entries(toLoad.positions || {})) {
            if (typeof pos?.x === 'number' && typeof pos?.y === 'number') nodePositionsRef.current.set(id, pos);
          }
          if (Array.isArray(toLoad.groups)) {
            groupsRef.current = toLoad.groups;
            setGroups(toLoad.groups);
            cacheGroups(campaignId, toLoad.groups);
          } else {
            groupsRef.current = [];
            setGroups([]);
          }
          if (toLoad.viewport) {
            t.current.scale = toLoad.viewport.scale || 1;
            t.current.ox = toLoad.viewport.ox || 0;
            t.current.oy = toLoad.viewport.oy || 0;
            // viewport will be applied once canvas is ready (autoFitTick or applyTransform)
            cacheViewport(campaignId, toLoad.viewport);
          }
          if (Array.isArray(toLoad.filters) && toLoad.filters.length > 0) {
            setActiveTypes(new Set([...toLoad.filters, 'session']));
          }
          if (defaultView) setActiveViewId(defaultView.id);
        } else {
          // Fall back to localStorage cache
          loadCachedPositions(campaignId, nodePositionsRef);
          const cached = loadCachedGroups(campaignId);
          groupsRef.current = cached;
          setGroups(cached);
          const cachedVp = loadCachedViewport(campaignId);
          if (cachedVp) {
            t.current.scale = cachedVp.scale || 1;
            t.current.ox = cachedVp.ox || 0;
            t.current.oy = cachedVp.oy || 0;
          }
        }

        cachePositions(campaignId, nodePositionsRef);
        setPositionsTick(v => v + 1);
      })
      .catch(() => {
        // Network error: fall back to localStorage
        loadCachedPositions(campaignId, nodePositionsRef);
        const cached = loadCachedGroups(campaignId);
        groupsRef.current = cached;
        setGroups(cached);
        setPositionsTick(v => v + 1);
      });
  }, [campaignId]);

  // Keep groupsRef in sync for onUp closure
  useEffect(() => { groupsRef.current = groups; }, [groups]);

  // ── Server workspace auto-save ─────────────────────────────────────────────
  // Whenever positions or groups change (positionsTick or groups state), schedule
  // a debounced server-side save to the hidden "__workspace__" view.
  useEffect(() => {
    scheduleWorkspaceSaveRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsTick, groups]);

  // Close views menu on outside click
  useEffect(() => {
    if (!showViewsMenu) return;
    const onDown = e => {
      if (!viewsMenuRef.current?.contains(e.target)) setShowViewsMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showViewsMenu]);

  const q = query.trim().toLowerCase();

  const visibleNodes = useMemo(() =>
    allNodes.filter(n =>
      activeTypes.has(n.entityType) &&
      (!q || (n.searchText || '').includes(q)) &&
      (!isolatedIds || isolatedIds.has(n.id))
    ),
    [allNodes, activeTypes, q, isolatedIds]
  );
  const visibleIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes]);
  const nodesById = useMemo(() => new Map(allNodes.map(n => [n.id, n])), [allNodes]);
  const nodesByLabel = useMemo(() => {
    const m = new Map();
    for (const n of allNodes) {
      const key = n.label.toLowerCase();
      if (!m.has(key)) m.set(key, n);
    }
    return m;
  }, [allNodes]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { positions, sortedSessions } = useMemo(() => computeLayout(visibleNodes), [visibleNodes, layoutSeed]);

  const effectivePositions = useMemo(() => {
    const result = new Map(positions);
    for (const [id, pos] of nodePositionsRef.current) result.set(id, pos);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, positionsTick]);

  const bounds = useMemo(() => canvasBounds(effectivePositions), [effectivePositions]);

  const edgesToDraw = useMemo(() => {
    const edges = [];
    for (let i = 0; i < sortedSessions.length - 1; i++) {
      const a = sortedSessions[i], b = sortedSessions[i + 1];
      if (visibleIds.has(a.id) && visibleIds.has(b.id))
        edges.push({ id: `spine_${i}`, source: a.id, target: b.id, isSpine: true });
    }
    for (const edge of allEdges) {
      if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
      const src = nodesById.get(edge.source), tgt = nodesById.get(edge.target);
      if (!src || !tgt) continue;
      if (src.entityType === 'session' && tgt.entityType === 'session') continue;
      edges.push({ id: edge.id, source: edge.source, target: edge.target, isSpine: false });
    }
    return edges;
  }, [sortedSessions, allEdges, visibleIds, nodesById]);

  useEffect(() => { effectivePositionsRef.current = effectivePositions; }, [effectivePositions]);
  useEffect(() => { sortedSessionsRef.current = sortedSessions; }, [sortedSessions]);

  useEffect(() => {
    const m = new Map();
    edgesToDraw.forEach((edge, idx) => {
      const add = (nodeId, isSource) => {
        if (!m.has(nodeId)) m.set(nodeId, []);
        m.get(nodeId).push({ idx, edge, isSource });
      };
      add(edge.source, true);
      add(edge.target, false);
    });
    edgesIndexByNodeRef.current = m;
  }, [edgesToDraw]);

  // ── Transform ──────────────────────────────────────────────────────────────

  const applyTransform = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.transform = `translate(${t.current.ox}px,${t.current.oy}px) scale(${t.current.scale})`;
  }, []);

  const vpSize = () => {
    const vp = viewportRef.current;
    return { vw: vp?.clientWidth || 800, vh: vp?.clientHeight || 500 };
  };

  const fit = useCallback(() => {
    const { vw, vh } = vpSize();
    let maxX = 600, maxY = 500;
    for (const { x, y } of effectivePositionsRef.current.values()) {
      maxX = Math.max(maxX, x + NODE_W + 80);
      maxY = Math.max(maxY, y + NODE_H + 80);
    }
    const w = maxX, h = maxY;
    if (!w || !h || !vw || !vh) return;
    const pad = 24;
    const fw = vw - pad * 2, fh = vh - pad * 2;
    t.current.scale = Math.min(fw / w, fh / h, 1);
    t.current.ox = pad + (fw - w * t.current.scale) / 2;
    t.current.oy = pad + (fh - h * t.current.scale) / 2;
    applyTransform();
  }, [applyTransform]);

  const zoomAround = useCallback((cx, cy, factor) => {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.current.scale * factor));
    const ratio = next / t.current.scale;
    t.current.ox = cx - ratio * (cx - t.current.ox);
    t.current.oy = cy - ratio * (cy - t.current.oy);
    t.current.scale = next;
    applyTransform();
  }, [applyTransform]);

  const [autoFitTick, setAutoFitTick] = useState(0);
  useEffect(() => { requestAnimationFrame(() => fit()); }, [autoFitTick, fit]);

  const updateConnectedNotes = useCallback((nodeId, nodeX, nodeY) => {
    const sessions = sortedSessionsRef.current;
    const sessionIdx = sessions.findIndex(s => s.id === nodeId);
    if (sessionIdx === -1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const CARD_W = 224;
    const CARD_H_COLLAPSED = 74;
    const moveNote = (edgeId, ax, ay, bx, by) => {
      const el = canvas.querySelector(`[data-note-edge-id="${edgeId}"]`);
      if (!el) return;
      const midX = (ax + NODE_W / 2 + bx + NODE_W / 2) / 2;
      const midY = (ay + NODE_H / 2 + by + NODE_H / 2) / 2;
      el.style.left = `${midX - CARD_W / 2}px`;
      el.style.top = `${midY - Math.round(CARD_H_COLLAPSED / 2)}px`;
    };
    if (sessionIdx < sessions.length - 1) {
      const s2 = effectivePositionsRef.current.get(sessions[sessionIdx + 1].id);
      if (s2) moveNote(`spine_${sessionIdx}`, nodeX, nodeY, s2.x, s2.y);
    }
    if (sessionIdx > 0) {
      const s1 = effectivePositionsRef.current.get(sessions[sessionIdx - 1].id);
      if (s1) moveNote(`spine_${sessionIdx - 1}`, s1.x, s1.y, nodeX, nodeY);
    }
  }, []);

  const updateConnectedEdges = useCallback((nodeId, nodeX, nodeY) => {
    const svg = canvasRef.current?.querySelector('.gwc-edges');
    if (!svg) return;
    for (const { idx, edge, isSource } of (edgesIndexByNodeRef.current.get(nodeId) || [])) {
      const line = svg.querySelector(`line[data-edge-idx="${idx}"]`);
      if (!line) continue;
      const otherId = isSource ? edge.target : edge.source;
      const otherPos = effectivePositionsRef.current.get(otherId);
      if (!otherPos) continue;
      const sp = isSource ? { x: nodeX, y: nodeY } : otherPos;
      const tp = isSource ? otherPos : { x: nodeX, y: nodeY };
      const pts = edgeEndpoints(sp, tp);
      if (!pts) continue;
      line.setAttribute('x1', pts.x1);
      line.setAttribute('y1', pts.y1);
      line.setAttribute('x2', pts.x2);
      line.setAttribute('y2', pts.y2);
    }
  }, []);

  // ── Mouse events ───────────────────────────────────────────────────────────

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = e => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      zoomAround(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };

    const onDown = e => {
      if (e.button !== 0) return;
      if (e.target.closest('.gwc-node')) return;
      if (e.target.closest('.gwc-edge-note')) return;
      if (e.target.closest('.gwc-canvas-toolbar')) return;
      if (e.target.closest('.gwc-shortcuts-overlay')) return;

      // Lock indicator and action buttons inside groups always take priority
      if (e.target.closest('.gwc-group-lock-indicator') || e.target.closest('.gwc-group-actions')) return;

      const groupEl = e.target.closest('.gwc-group');
      if (groupEl) {
        const groupId = groupEl.dataset.groupId;
        const group = groupsRef.current.find(g => g.id === groupId);
        // Unlocked group: the group's own React handler will handle it — don't pan
        if (group && !group.locked) return;
        // Locked group: fall through to viewport pan
      }

      setSelectedGroupId(null);
      drag.current = { active: true, moved: false, start: { x: e.clientX, y: e.clientY, ox: t.current.ox, oy: t.current.oy } };
      vp.classList.add('gwc-dragging');
    };

    const onMove = e => {
      if (drag.current.active && drag.current.start) {
        const dx = e.clientX - drag.current.start.x;
        const dy = e.clientY - drag.current.start.y;
        if (!drag.current.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
        if (drag.current.moved) {
          t.current.ox = drag.current.start.ox + dx;
          t.current.oy = drag.current.start.oy + dy;
          applyTransform();
        }
      }

      if (dragNodeRef.current) {
        const dn = dragNodeRef.current;
        const dx = (e.clientX - dn.startClientX) / t.current.scale;
        const dy = (e.clientY - dn.startClientY) / t.current.scale;
        if (!dn.moved && Math.hypot(dx, dy) > 3) dn.moved = true;
        if (dn.moved) {
          dn.currentX = dn.startNodeX + dx;
          dn.currentY = dn.startNodeY + dy;
          if (dn.el) {
            dn.el.style.left = `${dn.currentX}px`;
            dn.el.style.top = `${dn.currentY}px`;
          }
          updateConnectedEdges(dn.nodeId, dn.currentX, dn.currentY);
          updateConnectedNotes(dn.nodeId, dn.currentX, dn.currentY);
        }
      }

      if (groupDragRef.current) {
        const gd = groupDragRef.current;
        const rawDx = (e.clientX - gd.startClientX) / t.current.scale;
        const rawDy = (e.clientY - gd.startClientY) / t.current.scale;
        if (!gd.moved && Math.hypot(rawDx, rawDy) > 3) gd.moved = true;
        if (gd.moved) {
          let x = gd.startX, y = gd.startY, w = gd.startW, h = gd.startH;
          switch (gd.handle) {
            case 'move': x += rawDx; y += rawDy; break;
            case 'nw': {
              let nw = gd.startW - rawDx, nh = gd.startH - rawDy;
              x = gd.startX + rawDx; y = gd.startY + rawDy;
              if (nw < MIN_GROUP_W) { nw = MIN_GROUP_W; x = gd.startX + gd.startW - MIN_GROUP_W; }
              if (nh < MIN_GROUP_H) { nh = MIN_GROUP_H; y = gd.startY + gd.startH - MIN_GROUP_H; }
              w = nw; h = nh; break;
            }
            case 'n': {
              let nh = gd.startH - rawDy; y = gd.startY + rawDy;
              if (nh < MIN_GROUP_H) { nh = MIN_GROUP_H; y = gd.startY + gd.startH - MIN_GROUP_H; }
              h = nh; break;
            }
            case 'ne': {
              let nw = gd.startW + rawDx, nh = gd.startH - rawDy; y = gd.startY + rawDy;
              if (nw < MIN_GROUP_W) nw = MIN_GROUP_W;
              if (nh < MIN_GROUP_H) { nh = MIN_GROUP_H; y = gd.startY + gd.startH - MIN_GROUP_H; }
              w = nw; h = nh; break;
            }
            case 'e':  w = Math.max(MIN_GROUP_W, gd.startW + rawDx); break;
            case 'se': w = Math.max(MIN_GROUP_W, gd.startW + rawDx); h = Math.max(MIN_GROUP_H, gd.startH + rawDy); break;
            case 's':  h = Math.max(MIN_GROUP_H, gd.startH + rawDy); break;
            case 'sw': {
              let nw = gd.startW - rawDx; x = gd.startX + rawDx;
              if (nw < MIN_GROUP_W) { nw = MIN_GROUP_W; x = gd.startX + gd.startW - MIN_GROUP_W; }
              w = nw; h = Math.max(MIN_GROUP_H, gd.startH + rawDy); break;
            }
            case 'w': {
              let nw = gd.startW - rawDx; x = gd.startX + rawDx;
              if (nw < MIN_GROUP_W) { nw = MIN_GROUP_W; x = gd.startX + gd.startW - MIN_GROUP_W; }
              w = nw; break;
            }
            default: break;
          }
          gd.currentX = x; gd.currentY = y; gd.currentW = w; gd.currentH = h;
          if (gd.el) {
            gd.el.style.left = `${x}px`;
            gd.el.style.top = `${y}px`;
            gd.el.style.width = `${w}px`;
            gd.el.style.height = `${h}px`;
          }
        }
      }
    };

    const onUp = () => {
      if (drag.current.active) {
        const panned = drag.current.moved;
        drag.current.active = false;
        drag.current.start = null;
        vp.classList.remove('gwc-dragging');
        setTimeout(() => { drag.current.moved = false; }, 0);
        if (panned) {
          // Cache viewport locally and schedule a server workspace save
          cacheViewport(campaignId, { scale: t.current.scale, ox: t.current.ox, oy: t.current.oy });
          scheduleWorkspaceSaveRef.current?.();
        }
      }

      if (dragNodeRef.current) {
        const dn = dragNodeRef.current;
        if (dn.moved) {
          pushUndo({
            type: 'move-node',
            nodeId: dn.nodeId,
            prevHadSaved: dn.hadSavedPos,
            prevX: dn.startNodeX,
            prevY: dn.startNodeY,
            newX: dn.currentX,
            newY: dn.currentY,
          });
          nodePositionsRef.current.set(dn.nodeId, { x: dn.currentX, y: dn.currentY });
          persistPositions(campaignId, nodePositionsRef);
          setPositionsTick(tick => tick + 1);
          nodeWasDraggedRef.current = true;
          setActiveViewId(id => id ? `${id}*` : null);
        }
        dragNodeRef.current = null;
      }

      if (groupDragRef.current) {
        const gd = groupDragRef.current;
        if (gd.moved) {
          pushUndo({
            type: gd.handle === 'move' ? 'move-group' : 'resize-group',
            groupId: gd.groupId,
            prev: { x: gd.startX, y: gd.startY, w: gd.startW, h: gd.startH },
            next: { x: gd.currentX, y: gd.currentY, w: gd.currentW, h: gd.currentH },
          });
          const updated = groupsRef.current.map(g => g.id !== gd.groupId ? g : {
            ...g, x: gd.currentX, y: gd.currentY, w: gd.currentW, h: gd.currentH,
          });
          groupsRef.current = updated;
          setGroups(updated);
          persistGroups(campaignId, updated);
          setActiveViewId(id => id ? `${id}*` : null);
          groupWasDraggedRef.current = true;
        }
        groupDragRef.current = null;
      }
    };

    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [applyTransform, zoomAround, campaignId, updateConnectedEdges, updateConnectedNotes, pushUndo]);

  // ── Node interaction ───────────────────────────────────────────────────────

  function handleNodeMouseDown(e, node) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const pos = effectivePositions.get(node.id) || { x: 0, y: 0 };
    dragNodeRef.current = {
      nodeId: node.id,
      el: e.currentTarget,
      hadSavedPos: nodePositionsRef.current.has(node.id),
      startClientX: e.clientX,
      startClientY: e.clientY,
      startNodeX: pos.x,
      startNodeY: pos.y,
      currentX: pos.x,
      currentY: pos.y,
      moved: false,
    };
  }

  function handleNodeClick(nodeId) {
    if (nodeWasDraggedRef.current) { nodeWasDraggedRef.current = false; return; }
    if (drag.current.moved) return;
    setSelectedGroupId(null);
    setSelectedId(prev => prev === nodeId ? null : nodeId);
  }

  // ── Group interaction ──────────────────────────────────────────────────────

  function handleGroupMouseDown(e, group, handle) {
    if (e.button !== 0) return;
    if (group.locked) return; // locked groups: let event propagate to viewport pan
    e.stopPropagation();
    const el = e.currentTarget.closest('[data-group-id]') || e.currentTarget;
    groupDragRef.current = {
      groupId: group.id,
      handle,
      el,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: group.x,
      startY: group.y,
      startW: group.w,
      startH: group.h,
      currentX: group.x,
      currentY: group.y,
      currentW: group.w,
      currentH: group.h,
      moved: false,
    };
  }

  function handleGroupClick(e, groupId) {
    const group = groupsRef.current.find(g => g.id === groupId);
    if (group?.locked) return; // locked groups can't be selected
    if (groupWasDraggedRef.current) { groupWasDraggedRef.current = false; return; }
    e.stopPropagation();
    setSelectedId(null);
    setSelectedGroupId(prev => prev === groupId ? null : groupId);
  }

  function handleAddGroup() {
    const vp = viewportRef.current;
    const vw = vp?.clientWidth || 800;
    const vh = vp?.clientHeight || 500;
    const cx = (vw / 2 - t.current.ox) / t.current.scale;
    const cy = (vh / 2 - t.current.oy) / t.current.scale;
    const W = 320, H = 220;
    const newGroup = {
      id: genGroupId(),
      label: 'New Group',
      colorIdx: 0,
      x: Math.round(cx - W / 2),
      y: Math.round(cy - H / 2),
      w: W,
      h: H,
      locked: false,
    };
    const updated = [...groupsRef.current, newGroup];
    groupsRef.current = updated;
    setGroups(updated);
    persistGroups(campaignId, updated);
    pushUndo({ type: 'create-group', groupId: newGroup.id });
    setSelectedGroupId(newGroup.id);
    setEditingGroupId(newGroup.id);
    setEditingGroupLabel('New Group');
    setActiveViewId(id => id ? `${id}*` : null);
  }

  function handleDeleteGroup(groupId) {
    const group = groupsRef.current.find(g => g.id === groupId);
    if (group) pushUndo({ type: 'delete-group', group: { ...group } });
    const updated = groupsRef.current.filter(g => g.id !== groupId);
    groupsRef.current = updated;
    setGroups(updated);
    persistGroups(campaignId, updated);
    setSelectedGroupId(null);
    setEditingGroupId(null);
    setActiveViewId(id => id ? `${id}*` : null);
  }

  function startRenameGroup(groupId, currentLabel) {
    setEditingGroupId(groupId);
    setEditingGroupLabel(currentLabel);
  }

  function commitRenameGroup() {
    if (!editingGroupId) return;
    const label = editingGroupLabel.trim() || 'Group';
    const old = groupsRef.current.find(g => g.id === editingGroupId);
    if (old && old.label !== label) {
      pushUndo({ type: 'rename-group', groupId: editingGroupId, prevLabel: old.label, nextLabel: label });
    }
    const updated = groupsRef.current.map(g => g.id === editingGroupId ? { ...g, label } : g);
    groupsRef.current = updated;
    setGroups(updated);
    persistGroups(campaignId, updated);
    setEditingGroupId(null);
    setActiveViewId(id => id ? `${id}*` : null);
  }

  function handleGroupRecolor(groupId, colorIdx) {
    const old = groupsRef.current.find(g => g.id === groupId);
    if (old) pushUndo({ type: 'recolor-group', groupId, prevColorIdx: old.colorIdx ?? 0, nextColorIdx: colorIdx });
    const updated = groupsRef.current.map(g => g.id === groupId ? { ...g, colorIdx } : g);
    groupsRef.current = updated;
    setGroups(updated);
    persistGroups(campaignId, updated);
    setActiveViewId(id => id ? `${id}*` : null);
  }

  function handleGroupToggleLock(groupId) {
    const old = groupsRef.current.find(g => g.id === groupId);
    if (!old) return;
    pushUndo({ type: 'lock-group', groupId, prevLocked: old.locked ?? false });
    const nowLocked = !(old.locked ?? false);
    const updated = groupsRef.current.map(g => g.id === groupId ? { ...g, locked: nowLocked } : g);
    groupsRef.current = updated;
    setGroups(updated);
    persistGroups(campaignId, updated);
    if (nowLocked) setSelectedGroupId(null); // deselect when locking
    setActiveViewId(id => id ? `${id}*` : null);
  }

  // ── Misc ───────────────────────────────────────────────────────────────────

  function toggleType(type) {
    if (type === 'session') return;
    setActiveTypes(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
    setSelectedId(null);
  }
  toggleTypeRef.current = toggleType;
  toggleContinuityNotesRef.current = () => setShowContinuityNotes(v => !v);
  toggleShortcutsRef.current = () => setShowShortcuts(v => !v);

  function handleAutoLayout() {
    nodePositionsRef.current.clear();
    try { localStorage.removeItem(storageKey(campaignId)); } catch {}
    setLayoutSeed(s => s + 1);
    setPositionsTick(tick => tick + 1);
    setActiveViewId(null);
    setAutoFitTick(tick => tick + 1);
    setUndoStack([]);
    undoStackRef.current = [];
  }

  // ── Named views ────────────────────────────────────────────────────────────

  function openSaveBar() {
    const cleanId = activeViewId?.replace('*', '');
    const current = cleanId ? views.find(v => v.id === cleanId) : null;
    setSaveName(current?.name || '');
    setShowSaveBar(true);
    setShowViewsMenu(false);
  }

  async function handleSaveView() {
    const name = saveName.trim();
    if (!name) return;
    const cleanId = activeViewId?.replace('*', '');
    const payload = {
      name,
      filters: [...activeTypes],
      positions: Object.fromEntries(nodePositionsRef.current),
      viewport: { scale: t.current.scale, ox: t.current.ox, oy: t.current.oy },
      groups: groupsRef.current,
    };
    try {
      if (cleanId && views.find(v => v.id === cleanId)) {
        const res = await fetch(`/api/campaigns/${campaignId}/graph-views/${cleanId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          setViews(prev => prev.map(v => v.id === cleanId ? updated : v));
          setActiveViewId(cleanId);
        }
      } else {
        const res = await fetch(`/api/campaigns/${campaignId}/graph-views`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (res.ok) {
          const created = await res.json();
          setViews(prev => [...prev, created]);
          setActiveViewId(created.id);
        }
      }
    } catch {}
    setShowSaveBar(false);
    setSaveName('');
  }

  function loadView(view) {
    nodePositionsRef.current.clear();
    for (const [id, pos] of Object.entries(view.positions || {})) {
      if (typeof pos?.x === 'number' && typeof pos?.y === 'number') nodePositionsRef.current.set(id, pos);
    }
    if (Array.isArray(view.filters) && view.filters.length > 0)
      setActiveTypes(new Set([...view.filters, 'session']));
    if (view.viewport) {
      t.current.scale = view.viewport.scale || 1;
      t.current.ox = view.viewport.ox || 0;
      t.current.oy = view.viewport.oy || 0;
      applyTransform();
    }
    if (Array.isArray(view.groups)) {
      groupsRef.current = view.groups;
      setGroups(view.groups);
      persistGroups(campaignId, view.groups);
    }
    setActiveViewId(view.id);
    setPositionsTick(tick => tick + 1);
    setShowViewsMenu(false);
    setUndoStack([]);
    undoStackRef.current = [];
  }

  async function handleDeleteView(viewId) {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/graph-views/${viewId}`, { method: 'DELETE' });
      if (res.ok) {
        setViews(prev => prev.filter(v => v.id !== viewId));
        if (activeViewId?.replace('*', '') === viewId) setActiveViewId(null);
      }
    } catch {}
  }

  async function handleSetDefaultView(viewId) {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/graph-views/${viewId}/set-default`, { method: 'POST' });
      if (res.ok) {
        const updated = await res.json();
        setViews(prev => prev.map(v => ({ ...v, isDefault: v.id === updated.id })));
      }
    } catch {}
  }

  // ── Wiki-link renderer ─────────────────────────────────────────────────────

  function renderWikiText(text) {
    if (!text) return null;
    const parts = text.split(/(\[\[.+?\]\])/g);
    if (parts.length === 1) return text;
    return parts.map((part, idx) => {
      const m = part.match(/^\[\[(.+?)\]\]$/);
      if (!m) return part || null;
      const name = m[1];
      const node = nodesByLabel.get(name.toLowerCase());
      if (node) {
        return (
          <button key={idx} type="button" className="gwc-edge-note-wikilink"
            onClick={e => { e.stopPropagation(); setSelectedId(node.id); setSelectedGroupId(null); }}>
            {name}
          </button>
        );
      }
      return <span key={idx} className="gwc-edge-note-wikilink--missing">{name}</span>;
    });
  }

  // ── Graph quick actions ────────────────────────────────────────────────────

  function centerOnNode(nodeId) {
    const pos = effectivePositionsRef.current.get(nodeId);
    if (!pos) return;
    const { vw, vh } = vpSize();
    t.current.ox = vw / 2 - (pos.x + NODE_W / 2) * t.current.scale;
    t.current.oy = vh / 2 - (pos.y + NODE_H / 2) * t.current.scale;
    applyTransform();
  }

  function isolateSelection(nodeId) {
    const node = nodesById.get(nodeId);
    if (!node) return;
    const neighbors = new Set(node.links || []);
    neighbors.add(nodeId);
    // Always include sessions so the spine stays visible for context
    for (const n of allNodes) {
      if (n.entityType === 'session') neighbors.add(n.id);
    }
    setIsolatedIds(neighbors);
    // Make sure all types in the neighbor set are visible
    setActiveTypes(prev => {
      const next = new Set(prev);
      for (const nid of neighbors) {
        const nd = nodesById.get(nid);
        if (nd) next.add(nd.entityType);
      }
      return next;
    });
  }

  function revealNeighbors(nodeId) {
    const node = nodesById.get(nodeId);
    if (!node) return;
    // Make all neighbor types visible
    setActiveTypes(prev => {
      const next = new Set(prev);
      for (const lid of (node.links || [])) {
        const nd = nodesById.get(lid);
        if (nd) next.add(nd.entityType);
      }
      return next;
    });
    // Clear isolation so neighbors become visible
    setIsolatedIds(null);
  }

  function clearIsolation() {
    setIsolatedIds(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedNode = selectedId ? nodesById.get(selectedId) : null;
  const selectedLinks = useMemo(() => new Set(selectedNode?.links || []), [selectedNode]);
  const hasNodes = visibleNodes.length > 0;

  const cleanActiveViewId = activeViewId?.replace('*', '');
  const activeView = cleanActiveViewId ? views.find(v => v.id === cleanActiveViewId) : null;
  const viewIsDirty = activeViewId?.endsWith('*');
  const canUndo = undoStack.length > 0;

  return (
    <div className="gwc-shell">
      {/* Toolbar */}
      <div className="gwc-toolbar">
        <div className="gwc-toolbar-search-row">
          <input
            type="search"
            className="search-input gwc-search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search nodes…"
          />
          <div className="gwc-type-chips">
            {ALL_TYPES.map(type => (
              <button
                key={type}
                type="button"
                className={`search-chip${activeTypes.has(type) ? ' active' : ''}${type === 'session' ? ' gwc-chip-locked' : ''}`}
                onClick={() => toggleType(type)}
                title={type === 'session' ? 'Sessions always visible' : `Toggle ${TYPE_LABELS[type]} (${TYPE_SHORTCUTS[type]})`}
              >
                {TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Save bar */}
      {showSaveBar && (
        <div className="gwc-save-bar">
          <input
            type="text"
            className="search-input gwc-save-input"
            placeholder="View name…"
            value={saveName}
            autoFocus
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveView(); if (e.key === 'Escape') setShowSaveBar(false); }}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveView} disabled={!saveName.trim()}>
            {activeView ? 'Update' : 'Save'}
          </button>
          {activeView && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setActiveViewId(null); handleSaveView(); }}>
              Save as New
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowSaveBar(false)}>Cancel</button>
        </div>
      )}

      <div className="gwc-body">
        <div ref={viewportRef} className="gwc-viewport">

          {/* ── Floating canvas toolbar ── */}
          <div className="gwc-canvas-toolbar">
            <button type="button" className="map-tool-btn icon-btn" title="Zoom in"
              onClick={() => { const { vw, vh } = vpSize(); zoomAround(vw / 2, vh / 2, 1.25); }}>+</button>
            <button type="button" className="map-tool-btn icon-btn" title="Zoom out"
              onClick={() => { const { vw, vh } = vpSize(); zoomAround(vw / 2, vh / 2, 0.8); }}>−</button>
            <span className="gwc-ctb-sep" />
            <button type="button" className="map-tool-btn" onClick={() => fit()}>Fit View</button>
            <button type="button" className="map-tool-btn" onClick={handleAutoLayout}>Auto Layout</button>
            {isolatedIds && (
              <>
                <span className="gwc-ctb-sep" />
                <button type="button" className="map-tool-btn gwc-isolation-btn active"
                  onClick={clearIsolation} title="Exit isolation mode — show all nodes">
                  Isolated ✕
                </button>
              </>
            )}
            <span className="gwc-ctb-sep" />
            <button type="button" className="map-tool-btn" onClick={handleAddGroup}>+ Group</button>
            <button
              type="button"
              className={`map-tool-btn${showContinuityNotes ? ' active' : ''}`}
              onClick={() => setShowContinuityNotes(v => !v)}
              title={showContinuityNotes ? 'Hide continuation notes (C)' : 'Show continuation notes (C)'}
            >
              Continuation
            </button>
            <span className="gwc-ctb-sep" />
            <button
              type="button"
              className="map-tool-btn gwc-undo-btn"
              onClick={() => handleUndoRef.current?.()}
              disabled={!canUndo}
              title={canUndo ? `Undo ${undoStack[undoStack.length - 1]?.type?.replace(/-/g, ' ')} (⌘Z)` : 'Nothing to undo'}
            >
              <IconUndo /><span>Undo</span>
            </button>
            <span className="gwc-ctb-sep" />
            {views.length > 0 && (
              <div className="gwc-views-wrap" ref={viewsMenuRef}>
                <button
                  type="button"
                  className={`map-tool-btn gwc-views-btn${showViewsMenu ? ' active' : ''}`}
                  onClick={() => setShowViewsMenu(v => !v)}
                >
                  {activeView ? (
                    <>{activeView.name}{viewIsDirty ? <span className="gwc-dirty-dot" title="Unsaved changes" /> : null}</>
                  ) : 'Views'} ▾
                </button>
                {showViewsMenu && (
                  <div className="gwc-views-menu">
                    {views.map(view => (
                      <div key={view.id} className={`gwc-view-row${view.id === cleanActiveViewId ? ' is-active' : ''}`}>
                        <button type="button" className="gwc-view-load" onClick={() => loadView(view)}>
                          {view.id === cleanActiveViewId && <span className="gwc-view-check">✓</span>}
                          {view.isDefault && <span className="gwc-view-default-star" title="Default view">★</span>}
                          {view.name}
                        </button>
                        <button
                          type="button"
                          className={`gwc-view-setdefault${view.isDefault ? ' is-default' : ''}`}
                          title={view.isDefault ? 'This is the default view' : 'Set as default view'}
                          onClick={() => handleSetDefaultView(view.id)}
                        >★</button>
                        <button type="button" className="gwc-view-del" title="Delete view"
                          onClick={() => handleDeleteView(view.id)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button type="button" className="map-tool-btn" onClick={openSaveBar}>
              {activeView && viewIsDirty ? 'Save*' : 'Save View'}
            </button>
            <span className="gwc-ctb-sep" />
            <button
              type="button"
              className={`map-tool-btn icon-btn gwc-shortcuts-btn${showShortcuts ? ' active' : ''}`}
              title="Keyboard shortcuts (⌘/)"
              onClick={() => setShowShortcuts(v => !v)}
            >?</button>
          </div>

          {/* ── Keyboard shortcuts panel ── */}
          {showShortcuts && (
            <div className="gwc-shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
              <div className="gwc-shortcuts-panel" onClick={e => e.stopPropagation()}>
                <div className="gwc-shortcuts-header">
                  <span className="gwc-shortcuts-title">Keyboard Shortcuts</span>
                  <button type="button" className="gwc-shortcuts-close" onClick={() => setShowShortcuts(false)}>✕</button>
                </div>
                <div className="gwc-shortcuts-section-label">Filter Visibility</div>
                <div className="gwc-shortcuts-grid">
                  {[['Toggle Encounters', 'E'], ['Toggle NPCs', 'N'], ['Toggle Locations', 'L'], ['Toggle Factions', 'F']].map(([action, key]) => (
                    <React.Fragment key={action}>
                      <span className="gwc-shortcuts-action">{action}</span>
                      <kbd className="gwc-shortcuts-key">{key}</kbd>
                    </React.Fragment>
                  ))}
                </div>
                <div className="gwc-shortcuts-divider" />
                <div className="gwc-shortcuts-section-label">Canvas</div>
                <div className="gwc-shortcuts-grid">
                  {[['Toggle Continuation Notes', 'C'], ['Undo', '⌘ Z'], ['This panel', '⌘ /'], ['Close', 'Esc']].map(([action, key]) => (
                    <React.Fragment key={action}>
                      <span className="gwc-shortcuts-action">{action}</span>
                      <kbd className="gwc-shortcuts-key">{key}</kbd>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!hasNodes ? (
            <div className="campaign-graph-empty">
              <p>No entities match the current filters.</p>
              <button type="button" className="btn btn-ghost"
                onClick={() => { setQuery(''); setActiveTypes(new Set(ALL_TYPES)); }}>
                Reset Filters
              </button>
            </div>
          ) : (
            <div ref={canvasRef} className="gwc-canvas" style={{ width: bounds.w, height: bounds.h }}>

              {/* ── Group boxes (behind everything) ── */}
              {groups.map(group => {
                const color = GROUP_COLORS[group.colorIdx ?? 0] || GROUP_COLORS[0];
                const isSelected = selectedGroupId === group.id;
                const isLocked = group.locked ?? false;
                return (
                  <div
                    key={group.id}
                    data-group-id={group.id}
                    className={`gwc-group${isSelected ? ' gwc-group--selected' : ''}${isLocked ? ' gwc-group--locked' : ''}`}
                    style={{
                      left: group.x, top: group.y,
                      width: group.w, height: group.h,
                      background: color.bg,
                      borderColor: color.border,
                      cursor: isLocked ? 'default' : 'move',
                    }}
                    onMouseDown={e => handleGroupMouseDown(e, group, 'move')}
                    onClick={e => handleGroupClick(e, group.id)}
                  >
                    {/* Label */}
                    <div
                      className="gwc-group-label"
                      style={{ color: color.border }}
                      onDoubleClick={isLocked ? undefined : (e => { e.stopPropagation(); startRenameGroup(group.id, group.label); })}
                    >
                      {editingGroupId === group.id ? (
                        <input
                          type="text"
                          className="gwc-group-label-input"
                          value={editingGroupLabel}
                          autoFocus
                          onChange={e => setEditingGroupLabel(e.target.value)}
                          onBlur={commitRenameGroup}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRenameGroup();
                            if (e.key === 'Escape') setEditingGroupId(null);
                            e.stopPropagation();
                          }}
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                        />
                      ) : group.label}
                    </div>

                    {/* Lock indicator — always visible on locked groups, click to unlock */}
                    {isLocked && (
                      <button
                        type="button"
                        className="gwc-group-lock-indicator"
                        style={{ color: color.border }}
                        title="Click to unlock group"
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); handleGroupToggleLock(group.id); }}
                      >
                        <IconLocked />
                      </button>
                    )}

                    {/* Actions toolbar (unlocked + selected) */}
                    {!isLocked && isSelected && (
                      <div className="gwc-group-actions">
                        {GROUP_COLORS.map((c, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`gwc-group-swatch${(group.colorIdx ?? 0) === i ? ' active' : ''}`}
                            style={{ background: c.border }}
                            title={c.label}
                            onMouseDown={e => e.stopPropagation()}
                            onClick={e => { e.stopPropagation(); handleGroupRecolor(group.id, i); }}
                          />
                        ))}
                        <button
                          type="button"
                          className="gwc-group-action-btn"
                          title="Lock group (enables panning through it)"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); handleGroupToggleLock(group.id); }}
                        >
                          <IconUnlocked />
                        </button>
                        <button
                          type="button"
                          className="gwc-group-del"
                          title="Delete group"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => { e.stopPropagation(); handleDeleteGroup(group.id); }}
                        >×</button>
                      </div>
                    )}

                    {/* Resize handles (unlocked + selected) */}
                    {!isLocked && isSelected && RESIZE_HANDLES.map(dir => (
                      <div
                        key={dir}
                        className={`gwc-group-handle gwc-group-handle--${dir}`}
                        onMouseDown={e => { e.stopPropagation(); handleGroupMouseDown(e, group, dir); }}
                        onClick={e => e.stopPropagation()}
                      />
                    ))}
                  </div>
                );
              })}

              {/* ── SVG edges ── */}
              <svg
                className="gwc-edges"
                viewBox={`0 0 ${bounds.w} ${bounds.h}`}
                width={bounds.w}
                height={bounds.h}
                aria-hidden="true"
              >
                <defs>
                  <marker id="gwc-arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                    <path d="M0,0.5 L0,6.5 L6.5,3.5 Z" fill="rgba(201,150,42,0.45)" />
                  </marker>
                  <marker id="gwc-arrowhead-spine" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                    <path d="M0,0.5 L0,6.5 L6.5,3.5 Z" fill="rgba(201,150,42,0.85)" />
                  </marker>
                </defs>
                {edgesToDraw.map((edge, idx) => {
                  const sp = effectivePositions.get(edge.source);
                  const tp = effectivePositions.get(edge.target);
                  if (!sp || !tp) return null;
                  const pts = edgeEndpoints(sp, tp);
                  if (!pts) return null;
                  return (
                    <line
                      key={edge.id}
                      data-edge-idx={idx}
                      x1={pts.x1} y1={pts.y1}
                      x2={pts.x2} y2={pts.y2}
                      className={`gwc-edge${edge.isSpine ? ' gwc-edge--spine' : ''}`}
                      markerEnd={edge.isSpine ? 'url(#gwc-arrowhead-spine)' : 'url(#gwc-arrowhead)'}
                    />
                  );
                })}
              </svg>

              {/* ── Nodes ── */}
              {visibleNodes.map(node => {
                const pos = effectivePositions.get(node.id);
                if (!pos) return null;
                const isSelected = node.id === selectedId;
                const isDimmed = !!selectedId && !isSelected && !selectedLinks.has(node.id);
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`gwc-node gwc-node--${node.entityType}${isSelected ? ' selected' : ''}${isDimmed ? ' dimmed' : ''}`}
                    style={{ left: pos.x, top: pos.y, width: NODE_W }}
                    onMouseDown={e => handleNodeMouseDown(e, node)}
                    onClick={() => handleNodeClick(node.id)}
                    title={node.subtitle || node.label}
                  >
                    <span className="gwc-node-type">{node.entityType}</span>
                    <span className="gwc-node-title">{node.label}</span>
                    {node.subtitle && <span className="gwc-node-meta">{node.subtitle}</span>}
                  </button>
                );
              })}

              {/* ── Continuity notes on spine edges ── */}
              {showContinuityNotes && sortedSessions.map((session, i) => {
                if (i >= sortedSessions.length - 1) return null;
                const nextSession = sortedSessions[i + 1];
                if (!visibleIds.has(session.id) || !visibleIds.has(nextSession.id)) return null;
                const cont = session.continuity;
                if (!cont) return null;
                const hasContent = cont.recap || cont.threads?.length || cont.worldChanges?.length || cont.npcChanges?.length || cont.treasure?.length;
                if (!hasContent) return null;

                const s1 = effectivePositions.get(session.id);
                const s2 = effectivePositions.get(nextSession.id);
                if (!s1 || !s2) return null;

                const CARD_W = 224;
                const CARD_H_COLLAPSED = 74;
                const edgeId = `spine_${i}`;
                const isExpanded = expandedEdgeNotes.has(edgeId);
                const midX = (s1.x + NODE_W / 2 + s2.x + NODE_W / 2) / 2;
                const spineMidY = (s1.y + NODE_H / 2 + s2.y + NODE_H / 2) / 2;
                const cardY = spineMidY - Math.round(CARD_H_COLLAPSED / 2);

                const threadCount = cont.threads?.length || 0;
                const worldCount = cont.worldChanges?.length || 0;
                const npcCount = cont.npcChanges?.length || 0;
                const treasureCount = cont.treasure?.length || 0;
                const totalBadges = threadCount + worldCount + npcCount + treasureCount;

                return (
                  <div
                    key={edgeId}
                    data-note-edge-id={edgeId}
                    className={`gwc-edge-note${isExpanded ? ' gwc-edge-note--expanded' : ''}`}
                    style={{ left: midX - CARD_W / 2, top: cardY, width: CARD_W }}
                    onMouseDown={e => e.stopPropagation()}
                    onClick={e => {
                      e.stopPropagation();
                      setExpandedEdgeNotes(prev => {
                        const n = new Set(prev);
                        n.has(edgeId) ? n.delete(edgeId) : n.add(edgeId);
                        return n;
                      });
                    }}
                    title={isExpanded ? 'Click to collapse' : 'Click to expand continuity notes'}
                  >
                    <span className="gwc-edge-note-indicator" aria-hidden="true">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                    {cont.recap && (
                      <p className="gwc-edge-note-recap">
                        {isExpanded
                          ? renderWikiText(cont.recap)
                          : (cont.recap.length <= 85 ? cont.recap : cont.recap.slice(0, 82) + '…')}
                      </p>
                    )}
                    {!isExpanded && totalBadges > 0 && (
                      <div className="gwc-edge-note-counts">
                        {threadCount > 0 && <span className="gwc-edge-note-badge gwc-edge-note-badge--thread">{threadCount} thread{threadCount > 1 ? 's' : ''}</span>}
                        {worldCount > 0 && <span className="gwc-edge-note-badge gwc-edge-note-badge--world">{worldCount} change{worldCount > 1 ? 's' : ''}</span>}
                        {npcCount > 0 && <span className="gwc-edge-note-badge gwc-edge-note-badge--npc">{npcCount} NPC{npcCount > 1 ? 's' : ''}</span>}
                        {treasureCount > 0 && <span className="gwc-edge-note-badge gwc-edge-note-badge--treasure">{treasureCount} reward{treasureCount > 1 ? 's' : ''}</span>}
                      </div>
                    )}
                    {isExpanded && (
                      <div className="gwc-edge-note-full">
                        {threadCount > 0 && (
                          <div className="gwc-edge-note-section">
                            <div className="gwc-edge-note-section-head">Unresolved Threads</div>
                            <ul className="gwc-edge-note-list">
                              {cont.threads.map((item, j) => <li key={j}>{renderWikiText(item)}</li>)}
                            </ul>
                          </div>
                        )}
                        {worldCount > 0 && (
                          <div className="gwc-edge-note-section">
                            <div className="gwc-edge-note-section-head">World Changes</div>
                            <ul className="gwc-edge-note-list">
                              {cont.worldChanges.map((item, j) => <li key={j}>{renderWikiText(item)}</li>)}
                            </ul>
                          </div>
                        )}
                        {npcCount > 0 && (
                          <div className="gwc-edge-note-section">
                            <div className="gwc-edge-note-section-head">NPC Updates</div>
                            <ul className="gwc-edge-note-list">
                              {cont.npcChanges.map((item, j) => <li key={j}>{renderWikiText(item)}</li>)}
                            </ul>
                          </div>
                        )}
                        {treasureCount > 0 && (
                          <div className="gwc-edge-note-section">
                            <div className="gwc-edge-note-section-head">Treasure & Rewards</div>
                            <ul className="gwc-edge-note-list">
                              {cont.treasure.map((item, j) => <li key={j}>{renderWikiText(item)}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <aside className="gwc-detail">
            <div className="gwc-detail-head">
              <div className="gwc-detail-head-copy">
                <div className="gwc-detail-type">{selectedNode.entityType}</div>
                <h3 className="gwc-detail-title">{selectedNode.label}</h3>
                {selectedNode.subtitle && <p className="gwc-detail-copy">{selectedNode.subtitle}</p>}
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedId(null)}>✕</button>
            </div>
            <div className="gwc-detail-actions">
              <AppLink to={selectedNode.url} className="btn btn-primary btn-sm">Open Record</AppLink>
              <span className="graph-node-badge">{selectedNode.connectionCount} link{selectedNode.connectionCount === 1 ? '' : 's'}</span>
            </div>
            {/* Quick actions */}
            <div className="gwc-detail-quick-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm gwc-qa-btn"
                title="Pan the canvas so this node is centered"
                onClick={() => centerOnNode(selectedNode.id)}
              >Center</button>
              {(selectedNode.links || []).length > 0 && (
                <>
                  <button
                    type="button"
                    className={`btn btn-ghost btn-sm gwc-qa-btn${isolatedIds ? ' active' : ''}`}
                    title={isolatedIds ? 'Exit isolation mode' : 'Hide all nodes except this one and its direct neighbors'}
                    onClick={() => isolatedIds ? clearIsolation() : isolateSelection(selectedNode.id)}
                  >{isolatedIds ? 'Show All' : 'Isolate'}</button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm gwc-qa-btn"
                    title="Make all direct neighbors visible (enable their entity-type filters)"
                    onClick={() => revealNeighbors(selectedNode.id)}
                  >Reveal Neighbors</button>
                </>
              )}
            </div>
            {selectedNode.tags?.length > 0 && (
              <div className="gwc-detail-tags">
                {selectedNode.tags.map((tag, i) => (
                  <span key={i} className={`tag-chip${String(tag).trim().toLowerCase() === 'draft' ? ' is-draft' : ''}`}>{tag}</span>
                ))}
              </div>
            )}
            {(selectedNode.links || []).length > 0 && (
              <div className="gwc-detail-connections">
                <div className="campaign-guide-label">Connected Records</div>
                <div className="graph-detail-links">
                  {(selectedNode.links || []).map(lid => {
                    const ln = nodesById.get(lid);
                    if (!ln) return null;
                    return (
                      <button key={lid} type="button" className="graph-detail-link" onClick={() => setSelectedId(lid)}>
                        <span>{ln.label}</span>
                        <span className="gwc-detail-link-type">{ln.entityType}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
