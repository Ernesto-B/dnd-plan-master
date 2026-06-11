import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';

// Route-level lazy imports so Rollup can split each page into its own chunk,
// keeping the initial JS payload well under 500 kB.
const ListPage         = lazy(() => import('./pages/ListPage.jsx'));
const NpcView          = lazy(() => import('./pages/NpcView.jsx'));
const EncounterView    = lazy(() => import('./pages/EncounterView.jsx'));
const LocationView     = lazy(() => import('./pages/LocationView.jsx'));
const FactionView      = lazy(() => import('./pages/FactionView.jsx'));
const SessionView      = lazy(() => import('./pages/SessionView.jsx'));
const CampaignPage     = lazy(() => import('./pages/CampaignPage.jsx'));
const CampaignGraphPage = lazy(() => import('./pages/CampaignGraphPage.jsx'));
const CampaignsPage    = lazy(() => import('./pages/CampaignsPage.jsx'));
const MapPage          = lazy(() => import('./pages/MapPage.jsx'));
const SettingsPage     = lazy(() => import('./pages/SettingsPage.jsx'));
const NpcForm          = lazy(() => import('./pages/forms/NpcForm.jsx'));
const LocationForm     = lazy(() => import('./pages/forms/LocationForm.jsx'));
const FactionForm      = lazy(() => import('./pages/forms/FactionForm.jsx'));
const EncounterForm    = lazy(() => import('./pages/forms/EncounterForm.jsx'));
const SessionForm      = lazy(() => import('./pages/forms/SessionForm.jsx'));
const RunPage          = lazy(() => import('./pages/RunPage.jsx'));

import { LIST_CONFIGS } from './pages/listConfigs.jsx';

// Routes ported to React so far. Everything else is still served as a legacy
// full page by Express (see src/createApp.js), so the SPA only mounts on the
// paths below. As pages are ported, add routes here and delete their legacy
// entry in createApp.js.
export default function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        {/* Run mode is full-screen with no chrome → outside <Layout>. */}
        <Route path="/run/:id" element={<RunPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<CampaignPage />} />
          <Route path="/campaign" element={<CampaignPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/graph" element={<CampaignGraphPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/sessions" element={<ListPage config={LIST_CONFIGS.sessions} />} />
          <Route path="/form" element={<SessionForm />} />
          <Route path="/view/:id" element={<SessionView />} />
          <Route path="/encounters" element={<ListPage config={LIST_CONFIGS.encounters} />} />
          <Route path="/encounter/new" element={<EncounterForm />} />
          <Route path="/encounter/edit/:id" element={<EncounterForm />} />
          <Route path="/encounter/view/:id" element={<EncounterView />} />
          <Route path="/npcs" element={<ListPage config={LIST_CONFIGS.npcs} />} />
          <Route path="/npc/new" element={<NpcForm />} />
          <Route path="/npc/edit/:id" element={<NpcForm />} />
          <Route path="/npc/view/:id" element={<NpcView />} />
          <Route path="/locations" element={<ListPage config={LIST_CONFIGS.locations} />} />
          <Route path="/location/new" element={<LocationForm />} />
          <Route path="/location/edit/:id" element={<LocationForm />} />
          <Route path="/location/view/:id" element={<LocationView />} />
          <Route path="/factions" element={<ListPage config={LIST_CONFIGS.factions} />} />
          <Route path="/faction/new" element={<FactionForm />} />
          <Route path="/faction/edit/:id" element={<FactionForm />} />
          <Route path="/faction/view/:id" element={<FactionView />} />
          {/* Any unexpected SPA path → the sessions list. */}
          <Route path="*" element={<Navigate to="/sessions" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
