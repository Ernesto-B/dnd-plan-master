import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { _register } from '../lib/exportDialog.js';
import { toast } from '../lib/toast.js';

const TYPE_LABEL = { session: 'Session', encounter: 'Encounter', npc: 'NPC', location: 'Location', bundle: 'Bundle' };
const TYPE_CLASS  = { session: 'expbadge-session', encounter: 'expbadge-encounter', npc: 'expbadge-npc', location: 'expbadge-location', bundle: 'expbadge-bundle' };

const DEFAULT_FORMATS = [
  { id: 'md',  label: 'Markdown', ext: '.md',  checked: true },
  { id: 'pdf', label: 'PDF',      ext: '.pdf', checked: true },
];

export default function ExportDialogPortal() {
  const [open, setOpen]         = useState(false);
  const [title, setTitle]       = useState('Export');
  const [files, setFiles]       = useState(null);
  const [error, setError]       = useState(null);
  const [saving, setSaving]     = useState(false);
  const [formats, setFormats]   = useState(DEFAULT_FORMATS);
  const saveEndpointRef         = useRef(null);

  useEffect(() => {
    _register(async opts => {
      const activeFormats = (Array.isArray(opts.formatOptions) && opts.formatOptions.length
        ? opts.formatOptions
        : DEFAULT_FORMATS
      ).map(f => ({ ...f }));

      setTitle(opts.title || 'Export');
      setFormats(activeFormats);
      setFiles(null);
      setError(null);
      setSaving(false);
      setOpen(true);
      saveEndpointRef.current = opts.saveEndpoint || '/api/export/save-files';

      try {
        const loaded = await opts.loadFiles();
        if (!loaded || !loaded.length) { setError('No files to export.'); }
        else { setFiles(loaded); }
      } catch (err) { setError(`Failed to prepare files: ${err.message}`); }
    });
    return () => _register(null);
  }, []);

  const close = useCallback(() => { setOpen(false); setFiles(null); setError(null); setSaving(false); }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  async function save() {
    if (!files) return;
    const selectedFormats = formats.reduce((acc, f) => { acc[f.id] = f.checked; return acc; }, {});
    if (!Object.values(selectedFormats).some(Boolean)) return;
    setSaving(true);
    try {
      const res    = await fetch(saveEndpointRef.current, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ files, formats: selectedFormats }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Save failed');

      if (result.cancelled) {
        toast('No folder selected — nothing was saved.', 'success');
      } else {
        const n = result.count || result.savedFiles?.length || files.length;
        const labels = formats.filter(f => selectedFormats[f.id]).map(f => f.label.toUpperCase()).join(' + ');
        toast(`Saved ${n} ${labels} file${n !== 1 ? 's' : ''} → ${result.path}`, 'success');
      }
      close();
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
      setSaving(false);
    }
  }

  function toggleFormat(id) {
    setFormats(prev => prev.map(f => f.id === id ? { ...f, checked: !f.checked } : f));
  }

  if (!open) return null;

  const canSave = files && !error && !saving && formats.some(f => f.checked);

  return createPortal(
    <div className="export-dialog-overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="export-dialog-box" role="dialog" aria-modal="true" aria-labelledby="exp-title">
        <div className="export-dialog-head">
          <span className="export-dialog-title" id="exp-title">{title}</span>
          <button className="export-dialog-x" type="button" aria-label="Close" onClick={close}>×</button>
        </div>

        <div className="export-dialog-body">
          {!files && !error && (
            <div className="export-dialog-loading">
              <span className="spinner" />
              <span>Preparing files…</span>
            </div>
          )}
          {error && <div className="export-dialog-error">{error}</div>}
          {files && !error && (
            <>
              <div className="export-dialog-count">
                <span className="export-dialog-count-num">{files.length}</span>
                {' '}file{files.length !== 1 ? 's' : ''} ready to export
              </div>
              <div className="export-dialog-file-list">
                {files.map((f, i) => (
                  <div key={i} className="export-dialog-file-item">
                    <span className="export-dialog-filename">{f.displayName || f.label || f.filename}</span>
                    {TYPE_LABEL[f.type] && (
                      <span className={`export-dialog-badge ${TYPE_CLASS[f.type] || ''}`}>{TYPE_LABEL[f.type]}</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="export-dialog-formats">
                <div className="export-dialog-formats-label">Format</div>
                {formats.map(f => (
                  <label key={f.id} className="export-dialog-format-row">
                    <input type="checkbox" checked={f.checked} onChange={() => toggleFormat(f.id)} />
                    <span>{f.label} <span className="export-dialog-ext">({f.ext})</span></span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="export-dialog-footer" hidden={!files && !error}>
          <button className="btn btn-ghost" type="button" onClick={close}>Cancel</button>
          {(files || error) && (
            <button className="btn btn-primary" type="button" disabled={!canSave} onClick={save}>
              {saving ? <><span className="spinner" /> Saving…</> : 'Choose Save Folder →'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
