import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { marked } from 'marked';

// Shared preview modal for the session + encounter forms: PDF (base64→blob
// iframe) / Markdown tabs, with Keep Editing / Save-to-App / Save+Export.
export default function PreviewModal({ preview, title, onClose, busy, saveNote, onSaveApp, onSaveExport }) {
  const [tab, setTab] = useState('pdf');
  const [pdfUrl, setPdfUrl] = useState('');

  useEffect(() => {
    setTab('pdf');
    if (!preview?.pdf) { setPdfUrl(''); return; }
    const bytes = Uint8Array.from(atob(preview.pdf), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);

  if (!preview) return null;
  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-box">
        <div className="modal-header">
          <h2>{title || `Preview: ${preview.filename}`}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>✕ Close</button>
        </div>
        <div className="modal-tabs">
          <button className={`tab-btn${tab === 'pdf' ? ' active' : ''}`} onClick={() => setTab('pdf')}>PDF Preview</button>
          <button className={`tab-btn${tab === 'md' ? ' active' : ''}`} onClick={() => setTab('md')}>Markdown</button>
        </div>
        <div className="modal-content">
          <div className={`tab-panel${tab === 'pdf' ? '' : ' hidden'}`}><iframe id="pdf-frame" title="PDF Preview" src={pdfUrl} /></div>
          <div className={`tab-panel${tab === 'md' ? '' : ' hidden'}`}><div className="markdown-body" dangerouslySetInnerHTML={{ __html: marked.parse(preview.markdown || '') }} /></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>← Keep Editing</button>
          <span className="save-note">{saveNote}</span>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onSaveApp}>Save to App</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onSaveExport}>Save + Export Files…</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
