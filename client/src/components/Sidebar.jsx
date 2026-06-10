import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../lib/icons.jsx';
import { NAV } from '../lib/nav.js';

const PIN_KEY = 'dnd:sidebarPinned';

// Renders a sidebar destination. Native (ported) pages use client-side <Link>
// for instant, flash-free navigation; legacy pages use a plain <a> so the
// browser does a full load of the old page.
function SidebarLink({ item, active }) {
  const cls = `sidebar-link${active ? ' is-active' : ''}`;
  const inner = (
    <>
      <Icon name={item.icon} />
      <span className="icon-label">{item.label}</span>
    </>
  );
  const common = { className: cls, title: item.label, 'aria-current': active ? 'page' : undefined };
  return item.native
    ? <Link to={item.href} {...common}>{inner}</Link>
    : <a href={item.href} {...common}>{inner}</a>;
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const ref = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem(PIN_KEY) === '1'; } catch { return false; }
  });
  const [anim, setAnim] = useState(false);

  // Body class drives the content rail offset (.has-app-chrome) and the pinned
  // push (.sidebar-pinned). chrome-anim is enabled after first paint so a
  // pinned rail doesn't slide the page on load.
  useEffect(() => {
    document.body.classList.add('has-app-chrome');
    const raf = requestAnimationFrame(() => {
      setAnim(true);
      document.body.classList.add('chrome-anim');
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('sidebar-pinned', pinned);
    try { localStorage.setItem(PIN_KEY, pinned ? '1' : '0'); } catch {}
  }, [pinned]);

  // Group dividers between overview / play / world.
  let lastGroup = null;
  const items = [];
  for (const item of NAV) {
    if (lastGroup !== null && item.group !== lastGroup) {
      items.push(<div key={`d-${item.href}`} className="sidebar-divider" role="presentation" />);
    }
    lastGroup = item.group;
    items.push(<SidebarLink key={item.href} item={item} active={item.match(pathname)} />);
  }

  const cls = ['app-sidebar', anim && 'anim', hovered && 'is-hovered', pinned && 'is-pinned']
    .filter(Boolean).join(' ');

  return (
    <aside
      ref={ref}
      className={cls}
      aria-label="Primary navigation"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link to="/campaign" className="sidebar-brand" aria-label="D&D Session Master — Campaign home" title="Campaign Home">
        <Icon name="crest" />
      </Link>
      <nav className="sidebar-nav">{items}</nav>
      <div className="sidebar-foot">
        <button
          type="button"
          className="sidebar-pin"
          aria-pressed={pinned}
          title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          onClick={() => setPinned(p => !p)}
        >
          <Icon name="pin" />
        </button>
      </div>
    </aside>
  );
}
