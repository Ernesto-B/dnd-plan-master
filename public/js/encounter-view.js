(async function () {
  const id      = location.pathname.split('/').pop();
  const content = document.getElementById('content');

  let encounter;
  try {
    const res = await fetch(`/api/encounters/${id}`);
    if (!res.ok) throw new Error('Not found');
    encounter = await res.json();
  } catch {
    content.innerHTML = '<div class="empty-state"><p>Encounter plan not found.</p><a href="/encounters" class="btn btn-ghost">← Back</a></div>';
    return;
  }

  document.title = `${encounter.name} — D&D Session Master`;
  content.innerHTML = `<div class="markdown-body">${marked.parse(encounter.markdown || '')}</div>`;
  buildTOC();

  document.getElementById('btn-edit').addEventListener('click', () => {
    location.href = `/encounter/edit/${id}`;
  });

  document.getElementById('btn-export').addEventListener('click', () => exportFiles(encounter));
  document.getElementById('btn-delete').addEventListener('click', () => deleteEncounter(id));
})();

async function exportFiles(encounter) {
  const btn = document.getElementById('btn-export');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating…';

  try {
    const res = await fetch('/api/encounters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encounter.data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Generation failed');

    btn.innerHTML = '<span class="spinner"></span> Waiting for folder…';
    const fileRes = await fetch('/api/encounters/save-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: result.markdown, pdf: result.pdf, filename: result.filename }),
    });
    const fileResult = await fileRes.json();
    if (!fileRes.ok) throw new Error(fileResult.error || 'File save failed');

    if (fileResult.cancelled) {
      showToast('No folder selected — plan is still saved in the app.', 'success');
    } else {
      showToast(`Saved ${result.filename}.md and .pdf → ${fileResult.path}`, 'success');
    }
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  } finally {
    const b = document.getElementById('btn-export');
    b.disabled = false;
    b.textContent = 'Export Again';
  }
}

async function deleteEncounter(id) {
  const ok = await showConfirm(`Delete this encounter plan? This cannot be undone.`, {
    title: 'Delete Encounter Plan',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;

  try {
    const res = await fetch(`/api/encounters/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
    showToast('Encounter plan deleted.', 'success');
    setTimeout(() => { location.href = '/encounters'; }, 1000);
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

function buildTOC() {
  const nav = document.getElementById('toc-nav');
  if (!nav) return;
  const headings = [...document.querySelectorAll('.markdown-body h2, .markdown-body h3')];
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
    const a  = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.textContent.trim();
    a.className = h.tagName === 'H3' ? 'toc-h3' : 'toc-h2';
    a.addEventListener('click', e => {
      e.preventDefault();
      window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' });
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
      if (entry.isIntersecting) {
        nav.querySelectorAll('a').forEach(a => a.classList.remove('toc-active'));
        const active = nav.querySelector(`a[href="#${entry.target.id}"]`);
        if (active) active.classList.add('toc-active');
      }
    });
  }, { rootMargin: '-5% 0px -80% 0px', threshold: 0 });
  headings.forEach(h => observer.observe(h));
}

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = 'toast'; }, 5000);
}
