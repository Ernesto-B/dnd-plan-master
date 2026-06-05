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
  buildMarkdownToc();
  mountTagEditor(id, encounter.data?.tags || [], '/api/encounters');
  await renderLinkedSessions(id);

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

async function renderLinkedSessions(id) {
  const content = document.getElementById('content');
  if (!content) return;

  let links = [];
  try {
    const res = await fetch(`/api/encounters/${id}/links`);
    if (!res.ok) throw new Error('Could not load linked sessions');
    links = await res.json();
  } catch {
    return;
  }

  const section = document.createElement('div');
  section.className = 'linked-panel';

  const listHtml = links.length
    ? links.map(link => {
        const label = link.sessionNumber ? `Session ${String(link.sessionNumber).padStart(3, '0')}` : link.id;
        return `
          <a class="linked-item" href="${link.exists ? `/view/${link.id}` : '#'}"${link.exists ? '' : ' aria-disabled="true"'}>
            <span class="linked-item-title">${escHtml(label)}</span>
            <span class="linked-item-meta">${escHtml(link.goal || link.id)}${link.exists ? '' : ' · missing session'}</span>
          </a>
        `;
      }).join('')
    : '<p class="linked-empty">No linked sessions yet.</p>';

  section.innerHTML = `
    <div class="linked-panel-head">Linked Sessions</div>
    <div class="linked-panel-list">${listHtml}</div>
  `;

  content.prepend(section);
}
