import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import GlobalShortcutsPanel from './GlobalShortcutsPanel.jsx';
import AppDialogs from './AppDialogs.jsx';
import ConnectionsPanelPortal from './ConnectionsPanelPortal.jsx';
import ExportDialogPortal from './ExportDialogPortal.jsx';
import ShortcutsRuntime from './ShortcutsRuntime.jsx';

function ScrollTopBtn() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <button
      className={`scroll-top-btn${visible ? ' visible' : ''}`}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title="Back to top"
      aria-label="Scroll to top"
    >↑</button>
  );
}

export default function Layout() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  useEffect(() => { pathnameRef.current = location.pathname; }, [location.pathname]);

  useEffect(() => {
    const onKey = e => {
      if (pathnameRef.current === '/graph') return;
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        const el = document.activeElement;
        if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;
        e.preventDefault();
        e.stopPropagation();
        setShowShortcuts(v => !v);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <>
      <ShortcutsRuntime />
      <Sidebar />
      <TopBar />
      <Outlet />
      <ScrollTopBtn />
      {showShortcuts && <GlobalShortcutsPanel onClose={() => setShowShortcuts(false)} />}
      <AppDialogs />
      <ConnectionsPanelPortal />
      <ExportDialogPortal />
    </>
  );
}
