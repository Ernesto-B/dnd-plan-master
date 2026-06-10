/**
 * TagInput — reusable inline tag editor.
 *
 * Usage:
 *   const ti = new TagInput(containerEl, initialTags);
 *   ti.getTags()  → string[]
 *   ti.setTags(arr)
 */
class TagInput {
  constructor(container, initial = []) {
    this._tags = [...initial];
    this._wrap = document.createElement('div');
    this._wrap.className = 'tag-input-wrap';
    this._input = document.createElement('input');
    this._input.placeholder = 'Add tag…';
    this._input.type = 'text';
    this._wrap.appendChild(this._input);
    container.appendChild(this._wrap);
    this._render();

    this._input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        this._commit();
      } else if (e.key === 'Backspace' && !this._input.value && this._tags.length) {
        this._tags.pop();
        this._render();
      }
    });
    this._input.addEventListener('blur', () => this._commit());
    this._wrap.addEventListener('click', () => this._input.focus());
  }

  _commit() {
    const val = this._input.value.replace(/,/g, '').trim();
    if (val && !this._tags.includes(val)) {
      this._tags.push(val);
      this._render();
    }
    this._input.value = '';
  }

  _render() {
    // Remove existing chips (everything except the input)
    [...this._wrap.querySelectorAll('.tag-chip')].forEach(c => c.remove());
    this._tags.forEach((t, i) => {
      const chip = document.createElement('span');
      chip.className = `tag-chip removable${isDraftTag(t) ? ' is-draft' : ''}`;
      chip.innerHTML = `${escTagText(t)} <span class="tag-x">✕</span>`;
      chip.addEventListener('click', e => {
        e.stopPropagation();
        this._tags.splice(i, 1);
        this._render();
      });
      this._wrap.insertBefore(chip, this._input);
    });
  }

  getTags() { return [...this._tags]; }

  setTags(arr) {
    this._tags = [...arr];
    this._render();
  }
}

/** Render up to maxVisible tag chips into a parent element (read-only, for list/view pages). */
function renderTagChips(parent, tags, maxVisible = 3) {
  parent.innerHTML = '';
  if (!tags || !tags.length) return;
  const visible = tags.slice(0, maxVisible);
  visible.forEach(t => {
    const chip = document.createElement('span');
    chip.className = `tag-chip${isDraftTag(t) ? ' is-draft' : ''}`;
    chip.textContent = t;
    parent.appendChild(chip);
  });
  if (tags.length > maxVisible) {
    const more = document.createElement('span');
    more.className = 'tag-chip overflow';
    more.textContent = `+${tags.length - maxVisible}`;
    parent.appendChild(more);
  }
}

function escTagText(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function isDraftTag(tag) {
  return String(tag || '').trim().toLowerCase() === 'draft';
}

function tagChipsHtml(tags, maxVisible = 3) {
  if (!tags || !tags.length) return '';
  const visible = tags.slice(0, maxVisible).map(t => `<span class="tag-chip${isDraftTag(t) ? ' is-draft' : ''}">${escHtml(t)}</span>`);
  if (tags.length > maxVisible) visible.push(`<span class="tag-chip overflow">+${tags.length - maxVisible}</span>`);
  return visible.join(' ');
}

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 5000);
}

function mountTagEditor(id, initialTags, apiBase, anchorSelector = '.view-actions') {
  const anchor = document.querySelector(anchorSelector);
  if (!anchor) return;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap;';

  const label = document.createElement('span');
  label.style.cssText = 'font-family:var(--font-head); font-size:10px; letter-spacing:1px; text-transform:uppercase; color:var(--muted);';
  label.textContent = 'Tags';
  wrap.appendChild(label);

  const tagInput = new TagInput(wrap, initialTags);
  anchor.after(wrap);

  let saveTimer;
  const autoSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/${id}/tags`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags: tagInput.getTags() }),
        });
        const result = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(result.tags)) tagInput.setTags(result.tags);
      } catch {}
    }, 600);
  };

  const editor = wrap.querySelector('.tag-input-wrap');
  editor.addEventListener('keydown', autoSave);
  editor.addEventListener('click', autoSave);
  editor.addEventListener('focusout', autoSave);
}

function buildMarkdownToc(navSelector = '#toc-nav', contentSelector = '.markdown-body') {
  const nav = document.querySelector(navSelector);
  if (!nav) return;

  const headings = [...document.querySelectorAll(`${contentSelector} h2, ${contentSelector} h3`)];
  if (headings.length < 2) return;

  const slugCount = {};
  headings.forEach(h => {
    let slug = h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    slugCount[slug] = (slugCount[slug] || 0) + 1;
    if (slugCount[slug] > 1) slug += `-${slugCount[slug]}`;
    h.id = slug;
  });

  const ul = document.createElement('ul');
  headings.forEach(h => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.textContent.trim();
    a.className = h.tagName === 'H3' ? 'toc-h3' : 'toc-h2';
    a.addEventListener('click', e => {
      e.preventDefault();
      const top = h.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: 'smooth' });
    });
    li.appendChild(a);
    ul.appendChild(li);
  });

  const title = document.createElement('p');
  title.className = 'toc-title';
  title.textContent = 'Contents';
  nav.appendChild(title);
  nav.appendChild(ul);

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      nav.querySelectorAll('a').forEach(a => a.classList.remove('toc-active'));
      const active = nav.querySelector(`a[href="#${entry.target.id}"]`);
      if (active) active.classList.add('toc-active');
    });
  }, { rootMargin: '-5% 0px -80% 0px', threshold: 0 });

  headings.forEach(h => observer.observe(h));
}
