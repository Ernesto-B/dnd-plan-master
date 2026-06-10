import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ListPage from './pages/ListPage.jsx';
import NpcView from './pages/NpcView.jsx';
import EncounterView from './pages/EncounterView.jsx';
import LocationView from './pages/LocationView.jsx';
import FactionView from './pages/FactionView.jsx';
import SessionView from './pages/SessionView.jsx';
import CampaignPage from './pages/CampaignPage.jsx';
import CampaignsPage from './pages/CampaignsPage.jsx';
import MapPage from './pages/MapPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import NpcForm from './pages/forms/NpcForm.jsx';
import LocationForm from './pages/forms/LocationForm.jsx';
import FactionForm from './pages/forms/FactionForm.jsx';
import EncounterForm from './pages/forms/EncounterForm.jsx';
import SessionForm from './pages/forms/SessionForm.jsx';
import RunPage from './pages/RunPage.jsx';
import { LIST_CONFIGS } from './pages/listConfigs.jsx';

// Routes ported to React so far. Everything else is still served as a legacy
// full page by Express (see src/createApp.js), so the SPA only mounts on the
// paths below. As pages are ported, add routes here and delete their legacy
// entry in createApp.js.
export default function App() {
  return (
    <Routes>
      {/* Run mode is full-screen with no chrome → outside <Layout>. */}
      <Route path="/run/:id" element={<RunPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<CampaignPage />} />
        <Route path="/campaign" element={<CampaignPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
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
  );
}
