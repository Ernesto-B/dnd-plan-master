import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { _register } from '../lib/connectionsPanel.js';

function escHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function Section({ section }) {
  const items = Array.isArray(section.items) ? section.items : [];
  return (
    <section className="connections-panel-section">
      <div className="connections-panel-section-head">
        <span>{section.title || 'Connections'}</span>
        <span className="connections-panel-count">{items.length}</span>
      </div>
      {items.length ? (
        <div className="connections-panel-list">
          {items.map((item, i) => (
            <a
              key={i}
              className={`connections-panel-item${item.exists === false ? ' is-missing' : ''}`}
              href={item.exists === false ? '#' : (item.url || '#')}
              aria-disabled={item.exists === false || undefined}
            >
              <span className="connections-panel-item-title">{item.label || item.id || 'Untitled'}</span>
              {item.meta && <span className="connections-panel-item-meta">{item.meta}</span>}
            </a>
          ))}
        </div>
      ) : (
        <p className="connections-panel-empty">{section.empty || `No ${(section.title || 'connections').toLowerCase()} yet.`}</p>
      )}
    </section>
  );
}

export default function ConnectionsPanelPortal() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    _register(cfg => setConfig(cfg));
    return () => _register(null);
  }, []);

  const close = useCallback(() => setConfig(null), []);

  useEffect(() => {
    if (!config) return;
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [config, close]);

  if (!config) return null;

  return createPortal(
    <div className="connections-panel-overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="connections-panel-shell" role="dialog" aria-modal="true" aria-labelledby="cp-title">
        <div className="connections-panel-head">
          <div>
            <div className="connections-panel-kicker">Connections</div>
            <h2 id="cp-title" className="connections-panel-title">{config.title || 'Record Connections'}</h2>
            {config.subtitle && <p className="connections-panel-subtitle">{config.subtitle}</p>}
          </div>
          <button type="button" className="connections-panel-close" aria-label="Close" onClick={close}>×</button>
        </div>
        <div className="connections-panel-body">
          {(config.sections || []).length
            ? config.sections.map((s, i) => <Section key={i} section={s} />)
            : <p className="connections-panel-empty">No connections yet.</p>
          }
        </div>
      </div>
    </div>,
    document.body
  );
}
