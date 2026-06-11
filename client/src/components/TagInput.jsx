import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

function isDraftTag(tag) { return String(tag || '').trim().toLowerCase() === 'draft'; }

const TagInput = forwardRef(function TagInput({ initialTags = [], onChange }, ref) {
  const [tags, setTags]   = useState(() => [...initialTags]);
  const [input, setInput] = useState('');

  // Allow parent to sync tags imperatively (used by FormKit TagField on edit-populate).
  useImperativeHandle(ref, () => ({
    getTags: () => tags,
    setTags: arr => setTags([...arr]),
  }), [tags]);

  // Sync when initialTags prop changes (e.g. edit mode loads).
  const prevInitial = useRef(initialTags);
  useEffect(() => {
    if (prevInitial.current !== initialTags) {
      prevInitial.current = initialTags;
      setTags([...initialTags]);
    }
  }, [initialTags]);

  function commit() {
    const val = input.replace(/,/g, '').trim();
    if (val && !tags.includes(val)) {
      const next = [...tags, val];
      setTags(next);
      onChange?.(next);
    }
    setInput('');
  }

  function remove(i) {
    const next = tags.filter((_, idx) => idx !== i);
    setTags(next);
    onChange?.(next);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    if (e.key === 'Backspace' && !input && tags.length) remove(tags.length - 1);
  }

  return (
    <div className="tag-input-wrap" onClick={() => document.activeElement !== document.querySelector('.tag-input-wrap input') && null}>
      {tags.map((t, i) => (
        <span key={i} className={`tag-chip removable${isDraftTag(t) ? ' is-draft' : ''}`}>
          {t}
          <span className="tag-x" onClick={e => { e.stopPropagation(); remove(i); }}>✕</span>
        </span>
      ))}
      <input
        type="text"
        placeholder="Add tag…"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  );
});

export default TagInput;
