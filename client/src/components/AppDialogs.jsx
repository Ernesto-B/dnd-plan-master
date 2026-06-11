import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { _register } from '../lib/dialog.js';

const DEFAULTS = {
  confirm: { title: 'Confirm Action', confirmLabel: 'Confirm', icon: '◆', danger: false },
  prompt:  { title: 'Enter a Value',  confirmLabel: 'Save',    icon: '◆', danger: false },
};

export default function AppDialogs() {
  const [state, setState]     = useState(null);
  const [inputVal, setInputVal] = useState('');
  const resolveRef = useRef(null);
  const inputRef   = useRef(null);
  const okRef      = useRef(null);

  useEffect(() => {
    _register((type, msg, opts = {}) =>
      new Promise(resolve => {
        resolveRef.current = resolve;
        setState({ type, msg, opts: { ...DEFAULTS[type] || DEFAULTS.confirm, ...opts } });
        if (type === 'prompt') setInputVal(opts.defaultValue || '');
      })
    );
    return () => _register(null);
  }, []);

  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(() => {
      if (state.type === 'prompt') { inputRef.current?.focus(); inputRef.current?.select(); }
      else okRef.current?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, [state]);

  const resolve = useCallback(result => {
    setState(null);
    const fn = resolveRef.current;
    resolveRef.current = null;
    fn?.(result);
  }, []);

  function onKeyDown(e) {
    if (!state) return;
    if (e.key === 'Escape') { resolve(state.type === 'prompt' ? null : false); return; }
    if (e.key === 'Enter' && state.type === 'prompt') { e.preventDefault(); onConfirm(); }
  }

  function onConfirm() {
    if (!state) return;
    if (state.type === 'prompt') {
      const val = inputVal.trim();
      const { validate } = state.opts;
      if (typeof validate === 'function' ? !validate(val) : !val) return;
      resolve(val);
    } else {
      resolve(true);
    }
  }

  if (!state) return null;

  const { type, msg, opts } = state;
  const { title, confirmLabel, icon, danger, placeholder } = opts;
  const okDisabled = type === 'prompt' && !inputVal.trim();

  return createPortal(
    <div className="dlg-overlay" role="alertdialog" aria-modal="true" style={{ display: 'flex' }} onKeyDown={onKeyDown}>
      <div className="dlg-box">
        <div className="dlg-header">
          <span className="dlg-icon">{icon}</span>
          <h3 className="dlg-title">{title}</h3>
        </div>
        <p className="dlg-message">{msg}</p>
        {type === 'prompt' && (
          <div style={{ marginTop: 14 }}>
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              value={inputVal}
              placeholder={placeholder || ''}
              onChange={e => setInputVal(e.target.value)}
            />
          </div>
        )}
        <div className="dlg-footer">
          <button className="btn btn-ghost dlg-cancel-btn" onClick={() => resolve(type === 'prompt' ? null : false)}>Cancel</button>
          <button
            ref={okRef}
            className={`btn dlg-confirm-btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={okDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
