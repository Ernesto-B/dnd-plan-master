import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../lib/icons.jsx';

// Reusable action rail for record view pages (npc/location/faction/encounter/
// session). Mirrors the legacy .view-sidebar markup so it reuses the same CSS.
function Btn({ icon, label, onClick, className = '', disabled }) {
  return (
    <button className={`sidebar-btn iconified ${className}`.trim()} onClick={onClick} disabled={disabled}>
      <Icon name={icon} /><span className="icon-label">{label}</span>
    </button>
  );
}

export default function ViewActionSidebar({
  backHref, backLabel, backNative,
  primaryActions = [],       // extra sidebar-primary buttons after Back (e.g. Run)
  extraActions = [],         // extra buttons after Edit (e.g. DM Table)
  editLabel, onEdit,
  connectionsLabel = 'View All Connections', onConnections,
  onExport, exportConnectionsLabel, onExportConnections,
  deleteLabel = 'Delete', onDelete,
  showPromote, onPromote, promoting,
}) {
  const backInner = <><Icon name="back" /><span className="icon-label">{backLabel}</span></>;
  return (
    <aside className="view-sidebar">
      {backNative
        ? <Link to={backHref} className="sidebar-btn sidebar-back iconified">{backInner}</Link>
        : <a href={backHref} className="sidebar-btn sidebar-back iconified">{backInner}</a>}

      {primaryActions.map(a => <Btn key={a.label} icon={a.icon} className="sidebar-primary" label={a.label} onClick={a.onClick} />)}

      {showPromote && (
        <Btn icon="promote" className="sidebar-primary" disabled={promoting}
             label={promoting ? 'Promoting…' : 'Promote Draft'} onClick={onPromote} />
      )}

      {primaryActions.length > 0 && <div className="sidebar-sep" />}

      <Btn icon="edit" label={editLabel} onClick={onEdit} />
      {extraActions.map(a => <Btn key={a.label} icon={a.icon} label={a.label} onClick={a.onClick} />)}
      {onConnections && <Btn icon="connections" label={connectionsLabel} onClick={onConnections} />}

      <div className="sidebar-sep" />
      <Btn icon="export" label="Export" onClick={onExport} />
      {onExportConnections && <Btn icon="export" label={exportConnectionsLabel} onClick={onExportConnections} />}

      <div className="sidebar-spacer" />
      <Btn icon="delete" className="sidebar-danger" label={deleteLabel} onClick={onDelete} />
    </aside>
  );
}
