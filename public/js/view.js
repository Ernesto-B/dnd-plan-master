(async function () {
  const id      = location.pathname.split('/').pop();
  const content = document.getElementById('content');

  let session;
  try {
    const res = await fetch(`/api/sessions/${id}`);
    if (!res.ok) throw new Error('Not found');
    session = await res.json();
  } catch {
    content.innerHTML = '<div class="empty-state"><p>Session not found.</p><a href="/" class="btn btn-ghost">← Back</a></div>';
    return;
  }

  document.title = `Session ${id} — D&D Session Master`;
  content.innerHTML = `<div class="markdown-body">${marked.parse(session.markdown || '')}</div>`;
  buildMarkdownToc();
  mountTagEditor(id, session.data?.tags || [], '/api/sessions');
  await renderLinkedEncounters(id);

  document.getElementById('btn-edit').addEventListener('click', () => {
    location.href = `/form?edit=${id}`;
  });

  document.getElementById('btn-export-packet').addEventListener('click', () => exportPacket(id));
  document.getElementById('btn-export').addEventListener('click', () => exportFiles(session));

  document.getElementById('btn-delete').addEventListener('click', () => deleteSession(id));
})();

async function exportPacket(id) {
  const btn = document.getElementById('btn-export-packet');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Building packet…';

  try {
    const res = await fetch(`/api/sessions/${id}/export-packet`, { method: 'POST' });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Packet export failed');

    if (result.cancelled) {
      showToast('No folder selected — packet export canceled.', 'success');
    } else {
      const skipped = result.missingEncounterCount
        ? ` ${result.missingEncounterCount} missing linked plan(s) were skipped.`
        : '';
      showToast(`Saved session packet with ${result.exportedEncounterCount} linked encounter plan(s) → ${result.path}.${skipped}`, 'success');
    }
  } catch (err) {
    showToast('Packet export failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export Packet';
  }
}

async function exportFiles(session) {
  const btn = document.getElementById('btn-export');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating…';

  try {
    // Re-generate files
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session.data),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Generation failed');

    // Open native folder picker on server
    btn.innerHTML = '<span class="spinner"></span> Waiting for folder…';
    const fileRes = await fetch('/api/sessions/save-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: result.markdown, pdf: result.pdf, filename: result.filename }),
    });
    const fileResult = await fileRes.json();
    if (!fileRes.ok) throw new Error(fileResult.error || 'File save failed');

    if (fileResult.cancelled) {
      showToast('No folder selected — session is still saved in the app.', 'success');
    } else {
      showToast(`Saved ${result.filename}.md and ${result.filename}.pdf → ${fileResult.path}`, 'success');
    }
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  } finally {
    const btn2 = document.getElementById('btn-export');
    btn2.disabled = false;
    btn2.textContent = 'Export Again';
  }
}

async function deleteSession(id) {
  const ok = await showConfirm(`Delete Session ${id}? This cannot be undone.`, {
    title: 'Delete Session',
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;

  try {
    const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Delete failed');
    }
    showToast('Session deleted.', 'success');
    setTimeout(() => { location.href = '/'; }, 1000);
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

async function renderLinkedEncounters(id) {
  const content = document.getElementById('content');
  if (!content) return;

  let links = [];
  try {
    const res = await fetch(`/api/sessions/${id}/links`);
    if (!res.ok) throw new Error('Could not load linked encounters');
    links = await res.json();
  } catch {
    return;
  }

  const section = document.createElement('div');
  section.className = 'linked-panel';

  const listHtml = links.length
    ? links.map(link => `
        <a class="linked-item" href="${link.exists ? `/encounter/view/${link.id}` : '#'}"${link.exists ? '' : ' aria-disabled="true"'}>
          <span class="linked-item-title">${escHtml(link.name || link.id)}</span>
          <span class="linked-item-meta">${escHtml(link.id)}${link.exists ? '' : ' · missing plan'}</span>
        </a>
      `).join('')
    : '<p class="linked-empty">No linked encounter plans yet.</p>';

  section.innerHTML = `
    <div class="linked-panel-head">Linked Encounter Plans</div>
    <div class="linked-panel-list">${listHtml}</div>
  `;

  content.prepend(section);
}
