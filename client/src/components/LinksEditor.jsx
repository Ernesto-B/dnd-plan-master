import React, { useEffect, useRef, useState } from 'react';
import LinkedRecordPicker from './form/LinkedRecordPicker.jsx';
import { toast } from '../lib/vanilla.js';

export default function LinksEditor({ id, apiBase, groups }) {
  const [links, setLinks] = useState(
    () => Object.fromEntries(groups.map(g => [g.key, g.initial || []]))
  );
  const [openKey, setOpenKey] = useState(null);
  const [options, setOptions] = useState({});
  const [loadingKey, setLoadingKey] = useState(null);
  const timers = useRef({});

  // Re-sync when parent async data arrives (initial lengths change after mount)
  useEffect(() => {
    setLinks(Object.fromEntries(groups.map(g => [g.key, g.initial || []])));
    setOpenKey(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.map(g => (g.initial || []).length).join(',')]);

  async function togglePicker(group) {
    const key = group.key;
    if (openKey === key) { setOpenKey(null); return; }
    if (!options[key]) {
      setLoadingKey(key);
      try {
        const res = await fetch(group.listApi);
        const data = res.ok ? await res.json() : [];
        setOptions(prev => ({ ...prev, [key]: data.map(group.toOption).filter(o => o.value !== id) }));
      } catch { toast('Could not load options.', 'error'); setLoadingKey(null); return; }
      setLoadingKey(null);
    }
    setOpenKey(key);
  }

  function scheduleSave(key, newLinks) {
    clearTimeout(timers.current[key]);
    const ids = newLinks.map(l => l.id);
    timers.current[key] = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/${id}/links`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: ids }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'save failed');
      } catch (err) {
        toast('Failed to update links: ' + err.message, 'error');
      }
    }, 400);
  }

  function handlePickerChange(group, newIds) {
    const key = group.key;
    const current = links[key] || [];
    const opts = options[key] || [];
    const newLinks = newIds.map(nid => {
      const existing = current.find(l => l.id === nid);
      if (existing) return existing;
      const opt = opts.find(o => o.value === nid);
      return { id: nid, label: opt?.label || nid, href: group.getHref(nid) };
    });
    setLinks(prev => ({ ...prev, [key]: newLinks }));
    scheduleSave(key, newLinks);
  }

  function removeLink(group, lid) {
    const key = group.key;
    const newLinks = (links[key] || []).filter(l => l.id !== lid);
    setLinks(prev => ({ ...prev, [key]: newLinks }));
    scheduleSave(key, newLinks);
  }

  return (
    <div className="links-editor">
      {groups.map(group => {
        const key = group.key;
        const current = links[key] || [];
        const isOpen = openKey === key;

        return (
          <div key={key} className="links-editor-group">
            <div className="links-editor-group-head">
              <span className="links-editor-group-label">{group.label}</span>
              <button className="links-editor-add-btn" onClick={() => togglePicker(group)}>
                {loadingKey === key ? '…' : isOpen ? '− Close' : '+ Add'}
              </button>
            </div>
            <div className="links-editor-chips">
              {current.length === 0
                ? <span className="links-editor-empty">None linked yet.</span>
                : current.map(link => (
                    <span key={link.id} className="links-editor-chip">
                      <a href={link.href} className="links-editor-chip-link">{link.label}</a>
                      <button
                        className="links-editor-chip-x"
                        title="Remove link"
                        onClick={() => removeLink(group, link.id)}
                      >✕</button>
                    </span>
                  ))
              }
            </div>
            {isOpen && options[key] && (
              <div className="links-editor-picker-wrap">
                <LinkedRecordPicker
                  options={options[key]}
                  selected={current.map(l => l.id)}
                  onChange={newIds => handlePickerChange(group, newIds)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
