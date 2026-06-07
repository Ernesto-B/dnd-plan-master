/**
 * Custom themed confirm/alert dialogs — replaces browser confirm().
 * Injects one modal element into the DOM and reuses it for all dialogs.
 *
 * Usage:
 *   const ok = await showConfirm('Are you sure?');
 *   const ok = await showConfirm('Delete this?', { title: 'Delete Session', confirmLabel: 'Delete', danger: true });
 *   const value = await showPrompt('Enter a name', { title: 'Rename Item', defaultValue: 'Dockside Informant' });
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
        <div id="dlg-input-wrap" style="display:none; margin-top:14px;">
          <input id="dlg-input" type="text" autocomplete="off">
        </div>
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
      const inputWrap = document.getElementById('dlg-input-wrap');
      const inputEl   = document.getElementById('dlg-input');
      const okBtn    = document.getElementById('dlg-confirm');
      const cancelBtn = document.getElementById('dlg-cancel');

      titleEl.textContent   = title;
      msgEl.textContent     = message;
      iconEl.textContent    = icon;
      inputWrap.style.display = 'none';
      inputEl.value = '';
      inputEl.placeholder = '';
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

  window.showPrompt = function (message, opts = {}) {
    const {
      title = 'Enter a Value',
      confirmLabel = 'Save',
      defaultValue = '',
      placeholder = '',
      icon = '◆',
      validate,
    } = opts;

    inject();

    return new Promise((resolve) => {
      const overlay   = document.getElementById('dlg-overlay');
      const titleEl   = document.getElementById('dlg-title');
      const msgEl     = document.getElementById('dlg-message');
      const iconEl    = document.getElementById('dlg-icon');
      const inputWrap = document.getElementById('dlg-input-wrap');
      const inputEl   = document.getElementById('dlg-input');
      const okBtn     = document.getElementById('dlg-confirm');
      const cancelBtn = document.getElementById('dlg-cancel');

      titleEl.textContent = title;
      msgEl.textContent = message;
      iconEl.textContent = icon;
      inputWrap.style.display = 'block';
      inputEl.value = defaultValue;
      inputEl.placeholder = placeholder;
      okBtn.textContent = confirmLabel;
      okBtn.className = 'btn dlg-confirm-btn btn-primary';

      overlay.style.display = 'flex';
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 0);

      function done(result) {
        overlay.style.display = 'none';
        inputWrap.style.display = 'none';
        inputEl.value = '';
        inputEl.placeholder = '';
        resolve(result);
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('keydown', onKey);
        inputEl.removeEventListener('input', updateState);
      }

      function getValue() {
        return inputEl.value.trim();
      }

      function isValid(value) {
        if (typeof validate === 'function') return !!validate(value);
        return value.length > 0;
      }

      function updateState() {
        okBtn.disabled = !isValid(getValue());
      }

      function onOk() {
        const value = getValue();
        if (!isValid(value)) return;
        done(value);
      }
      function onCancel() { done(null); }
      function onKey(e) {
        if (e.key === 'Escape') done(null);
        if (e.key === 'Enter' && document.activeElement === inputEl) {
          e.preventDefault();
          onOk();
        }
      }

      updateState();
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('keydown', onKey);
      inputEl.addEventListener('input', updateState);
    });
  };
})();
