import React, { useEffect, useRef, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Icon } from '../lib/icons.jsx';
import AppLink from './AppLink.jsx';
import { CREATE_ITEMS } from '../lib/nav.js';
import { useApi } from '../lib/useApi.js';
import GlobalSearch from './GlobalSearch.jsx';

// Closes a dropdown when clicking anywhere outside the given ref.
function useOutsideClose(ref, onClose) {
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [ref, onClose]);
}

function CampaignSwitcher() {
  const { data } = useApi('/api/campaigns');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClose(ref, () => setOpen(false));

  const campaigns = data?.campaigns || [];
  const activeId = data?.activeCampaignId;
  const active = campaigns.find(c => c.id === activeId) || campaigns[0];

  async function switchTo(id) {
    if (id === activeId) { setOpen(false); return; }
    try {
      await fetch(`/api/campaigns/${encodeURIComponent(id)}/switch`, { method: 'POST' });
      window.location.reload();
    } catch { /* ignore */ }
  }

  return (
    <div className="nav-campaign-wrap" ref={ref}>
      <button className="nav-campaign-btn" title="Switch Campaign" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
        <span className="nav-campaign-name">{active?.name || '…'}</span>
        <span className="nav-campaign-caret">▾</span>
      </button>
      <div className={`nav-campaign-dropdown${open ? ' open' : ''}`}>
        <div className="nav-campaign-list">
          {campaigns.map(c => (
            <button
              key={c.id}
              className={`nav-campaign-item${c.id === activeId ? ' is-active' : ''}`}
              onClick={() => switchTo(c.id)}
            >
              <span className="nav-campaign-item-check">{c.id === activeId ? '✓' : ''}</span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
        <div className="nav-campaign-footer">
          <AppLink to="/campaigns" className="nav-campaign-manage" onClick={() => setOpen(false)}>Manage Campaigns →</AppLink>
        </div>
      </div>
    </div>
  );
}

function CreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClose(ref, () => setOpen(false));
  return (
    <div className={`nav-create-wrap${open ? ' open' : ''}`} ref={ref}>
      <button className="nav-create-btn" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
        + Create New <span className="caret">▾</span>
      </button>
      <div className="create-dropdown" onClick={() => setOpen(false)}>
        {CREATE_ITEMS.map(it => <AppLink key={it.href} to={it.href}>{it.label}</AppLink>)}
      </div>
    </div>
  );
}

export default function TopBar() {
  const { pathname } = useLocation();
  const settingsActive = pathname === '/settings';
  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <div className="nav-history-wrap" aria-label="History navigation">
          <button type="button" className="nav-history-btn" aria-label="Back" title="Back" onClick={() => window.history.back()}>←</button>
          <button type="button" className="nav-history-btn" aria-label="Forward" title="Forward" onClick={() => window.history.forward()}>→</button>
        </div>
        <CampaignSwitcher />
      </div>
      <div className="topbar-center">
        <GlobalSearch />
      </div>
      <div className="topbar-right">
        <Link
          to="/settings"
          className={`nav-shell-btn topbar-settings${settingsActive ? ' is-active' : ''}`}
          aria-label="Settings"
          title="Settings"
        >
          <Icon name="settings" className="app-icon" />
        </Link>
        <CreateMenu />
      </div>
    </header>
  );
}
