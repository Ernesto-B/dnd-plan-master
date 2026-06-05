/**
 * Custom themed confirm/alert dialogs — replaces browser confirm().
 * Injects one modal element into the DOM and reuses it for all dialogs.
 *
 * Usage:
 *   const ok = await showConfirm('Are you sure?');
 *   const ok = await showConfirm('Delete this?', { title: 'Delete Session', confirmLabel: 'Delete', danger: true });
 */

(function () {
  const MARKUP = `
    <div id="dlg-overlay" class="dlg-overlay" role="alertdialog" aria-modal="true" style="display:none">
      <div class="dlg-box">
        <div class="dlg-header">
          <span class="dlg-icon" id="dlg-icon">⚠</span>
          <h3 class="dlg-title" id="dlg-title">Confirm</h3>
        </div>
        <p class="dlg-message" id="dlg-message"></p>
        <div class="dlg-footer">
          <button class="btn btn-ghost dlg-cancel-btn" id="dlg-cancel">Cancel</button>
          <button class="btn dlg-confirm-btn" id="dlg-confirm">Confirm</button>
        </div>
      </div>
    </div>`;

  function inject() {
    if (document.getElementById('dlg-overlay')) return;
    document.body.insertAdjacentHTML('beforeend', MARKUP);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  window.showConfirm = function (message, opts = {}) {
    const {
      title        = 'Confirm Action',
      confirmLabel = 'Confirm',
      danger       = false,
      icon         = danger ? '⚠' : '◆',
    } = opts;

    inject();

    return new Promise((resolve) => {
      const overlay  = document.getElementById('dlg-overlay');
      const titleEl  = document.getElementById('dlg-title');
      const msgEl    = document.getElementById('dlg-message');
      const iconEl   = document.getElementById('dlg-icon');
      const okBtn    = document.getElementById('dlg-confirm');
      const cancelBtn = document.getElementById('dlg-cancel');

      titleEl.textContent   = title;
      msgEl.textContent     = message;
      iconEl.textContent    = icon;
      okBtn.textContent     = confirmLabel;

      okBtn.className = `btn dlg-confirm-btn ${danger ? 'btn-danger' : 'btn-primary'}`;

      overlay.style.display = 'flex';
      okBtn.focus();

      function done(result) {
        overlay.style.display = 'none';
        resolve(result);
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('keydown', onKey);
      }

      function onOk()     { done(true);  }
      function onCancel() { done(false); }
      function onKey(e)   { if (e.key === 'Escape') done(false); }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('keydown', onKey);
    });
  };
})();
