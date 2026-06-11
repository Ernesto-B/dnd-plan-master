import React, { useEffect, useRef, useState } from 'react';
import TagInputComponent from '../TagInput.jsx';
import { enableAutocomplete } from '../../lib/wikiLinks.js';

// Section card with a numbered header (reuses the legacy .section-header/.card CSS).
export function Section({ num, title, note, id, children }) {
  return (
    <>
      <div className="section-header" id={id}>
        <span className="section-num">{num}</span>
        <h2>{title}{note && <span className="section-note"> — {note}</span>}</h2>
      </div>
      <div className="card"><div className="form-grid">{children}</div></div>
    </>
  );
}

export function Field({ label, hint, hintInline, full, htmlFor, children }) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      {label && <label htmlFor={htmlFor}>{label}{hintInline && <span className="hint-inline">{hintInline}</span>}</label>}
      {hint && <span className="hint">{hint}</span>}
      {children}
    </div>
  );
}

// Textarea that grows to fit its content (replaces form-utils autoResize).
export function AutoTextArea({ value, onChange, className = 'short', ...rest }) {
  const ref = useRef(null);
  const resize = () => { const el = ref.current; if (!el) return; el.style.overflow = 'hidden'; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
  useEffect(resize, [value]);
  return <textarea ref={ref} className={className} value={value} onChange={onChange} onInput={resize} {...rest} />;
}

// React TagInput; exposes the instance via tagRef so the form can read getTags() on save.
export function TagField({ initialTags, tagRef }) {
  return <TagInputComponent ref={tagRef} initialTags={initialTags || []} />;
}

// Wires [[wiki link]] autocomplete (document-level) once mounted.
export function useWikiAutocomplete() {
  useEffect(() => { enableAutocomplete(); }, []);
}

// Section navigation rail with active-section tracking.
export function FormToc({ sections }) {
  const [active, setActive] = useState(sections[0]?.id);
  useEffect(() => {
    const els = sections.map(s => document.getElementById(s.id)).filter(Boolean);
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-10% 0% -80% 0%', threshold: 0 });
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [sections]);
  const go = (e, id) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  return (
    <aside className="toc-nav form-toc">
      <div className="toc-title">Sections</div>
      {sections.map(s => (
        <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'toc-active' : ''} onClick={e => go(e, s.id)}>
          {s.num && <span className="toc-num">{s.num}</span>}{s.label}
        </a>
      ))}
    </aside>
  );
}
