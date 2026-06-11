import React, { useEffect, useRef, useState } from 'react';
import TagInput from './TagInput.jsx';

export default function TagEditor({ id, initialTags = [], apiBase, className }) {
  const [tags, setTags] = useState(initialTags);
  const saveTimer = useRef(null);

  useEffect(() => { setTags(initialTags); }, [initialTags]);

  function handleChange(newTags) {
    setTags(newTags);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/${id}/tags`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: newTags }),
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(result.tags)) setTags(result.tags);
      } catch {}
    }, 600);
  }

  return (
    <div className={`tag-editor-row${className ? ` ${className}` : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--font-head)', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--muted)' }}>Tags</span>
      <TagInput initialTags={tags} onChange={handleChange} />
    </div>
  );
}
