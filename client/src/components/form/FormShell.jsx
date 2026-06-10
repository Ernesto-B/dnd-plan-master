import React from 'react';
import { Link } from 'react-router-dom';
import { useWikiAutocomplete, FormToc } from './FormKit.jsx';

// Page wrapper for entity forms: back link, title/subtitle, the form body, a
// sticky action bar (always-reachable Save/Cancel), and a section TOC rail.
export default function FormShell({ backHref, backLabel, backNative, title, subtitle, sections, actions, children }) {
  useWikiAutocomplete();
  const back = backNative
    ? <Link to={backHref} className="back-link">{backLabel}</Link>
    : <a href={backHref} className="back-link">{backLabel}</a>;
  return (
    <div className="container form-page">
      <div className="view-actions" style={{ marginBottom: 16 }}>{back}</div>
      <h1 className="page-title">{title}</h1>
      <p className="page-subtitle">{subtitle}</p>
      <form
        noValidate
        onSubmit={e => e.preventDefault()}
        onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); }}
      >
        {children}
      </form>
      <div className="form-action-bar">{actions}</div>
      {sections?.length > 0 && <FormToc sections={sections} />}
    </div>
  );
}
