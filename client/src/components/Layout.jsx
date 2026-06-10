import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

// Persistent app chrome. Sidebar + TopBar mount once and never unmount; only
// <Outlet> swaps as routes change — no full reload, no flash.
export default function Layout() {
  return (
    <>
      <Sidebar />
      <TopBar />
      <Outlet />
    </>
  );
}
