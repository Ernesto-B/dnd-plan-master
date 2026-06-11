import React, { useEffect, useState } from 'react';
import CampaignGraphWorkspace from './campaign/CampaignGraphWorkspace.jsx';

export default function CampaignGraphPage() {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    document.title = 'Campaign Graph — D&D Session Master';
    document.body.classList.add('graph-route');
    let alive = true;
    (async () => {
      try {
        const [campRes, graphRes] = await Promise.all([
          fetch('/api/campaigns/active'),
          fetch('/api/search/entity-graph'),
        ]);
        const campaign = campRes.ok ? await campRes.json() : null;
        const graphData = graphRes.ok ? await graphRes.json() : { nodes: [], edges: [] };
        if (alive) setState({ loading: false, data: { campaign, graphData }, error: null });
      } catch (err) {
        if (alive) setState({ loading: false, data: null, error: err.message });
      }
    })();
    return () => {
      alive = false;
      document.body.classList.remove('graph-route');
    };
  }, []);

  if (state.loading) {
    return (
      <div className="gwc-page gwc-page-chrome">
        <div className="gwc-page-status">Loading graph…</div>
      </div>
    );
  }
  if (state.error) {
    return (
      <div className="gwc-page gwc-page-chrome">
        <div className="gwc-page-status">{state.error}</div>
      </div>
    );
  }

  const { campaign, graphData } = state.data;
  return (
    <div className="gwc-page gwc-page-chrome">
      <CampaignGraphWorkspace
        graphData={graphData}
        campaignId={campaign?.id || 'c-default'}
      />
    </div>
  );
}
