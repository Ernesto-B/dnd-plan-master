// ─── Auto-resize textareas ────────────────────────────────────────────────────

function autoResize(el) {
  el.style.overflow = 'hidden';
  el.style.height   = 'auto';
  el.style.height   = el.scrollHeight + 'px';
}

function initAutoResize() {
  document.querySelectorAll('textarea').forEach(ta => {
    autoResize(ta);
    ta.addEventListener('input', () => autoResize(ta));
  });
  window.addEventListener('resize', () => {
    document.querySelectorAll('textarea').forEach(autoResize);
  }, { passive: true });
}

// ─── Section TOC ──────────────────────────────────────────────────────────────

function initFormToc(tocId = 'form-toc') {
  const toc = document.getElementById(tocId);
  if (!toc) return;

  const sections = [...document.querySelectorAll('.section-header[id]')];
  if (!sections.length) return;

  const links = sections.map(s => {
    const h2  = s.querySelector('h2');
    const num = s.querySelector('.section-num');
    const numText   = num ? num.textContent.trim() : '';
    const labelNode = h2 ? h2.cloneNode(true) : null;
    // Strip any child elements (like the "DM only" span) from the label
    const label = labelNode
      ? [...labelNode.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()
      : s.id;
    return `<a href="#${s.id}" data-section="${s.id}">${numText ? `<span class="toc-num">${numText}</span>` : ''}${label}</a>`;
  }).join('');

  toc.innerHTML = `<div class="toc-title">Sections</div>${links}`;

  // Active section tracking via IntersectionObserver
  const linkMap = new Map(sections.map(s => [s.id, toc.querySelector(`[data-section="${s.id}"]`)]));
  let activeId = null;

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        if (activeId) linkMap.get(activeId)?.classList.remove('toc-active');
        activeId = entry.target.id;
        linkMap.get(activeId)?.classList.add('toc-active');
      }
    });
  }, { rootMargin: '-10% 0% -80% 0%', threshold: 0 });

  sections.forEach(s => observer.observe(s));

  // Smooth scroll on click
  toc.addEventListener('click', e => {
    const a = e.target.closest('a[data-section]');
    if (!a) return;
    e.preventDefault();
    const target = document.getElementById(a.dataset.section);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ─── Field character count hint ───────────────────────────────────────────────
// Add data-maxhint="N" to a textarea to get a live "X / N" counter

function initCharCounts() {
  document.querySelectorAll('textarea[data-maxhint]').forEach(ta => {
    const max  = parseInt(ta.dataset.maxhint, 10);
    const hint = document.createElement('span');
    hint.className = 'char-count';
    ta.parentNode.insertBefore(hint, ta.nextSibling);
    const update = () => {
      const len = ta.value.length;
      hint.textContent = `${len} / ${max}`;
      hint.classList.toggle('char-count-warn', len > max * 0.9);
      hint.classList.toggle('char-count-over', len > max);
    };
    ta.addEventListener('input', update);
    update();
  });
}

// ─── Global helper for form pages to call after async populate ────────────────
window.autoResizeAll = function () {
  document.querySelectorAll('textarea').forEach(autoResize);
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAutoResize();
  initFormToc();
  initCharCounts();
});
