let _timer = null;

function getEl() { return document.getElementById('toast'); }

export function toast(msg, type = 'success') {
  const el = getEl();
  if (!el) return;
  clearTimeout(_timer);
  el.textContent = msg;
  el.className = `toast ${type} show`;
  _timer = setTimeout(() => { el.className = 'toast'; }, 5000);
}

export function toastAction(msg, type, actionLabel, onAction) {
  const el = getEl();
  if (!el) return;
  clearTimeout(_timer);
  el.innerHTML = '';
  const s = document.createElement('span');
  s.textContent = msg;
  el.appendChild(s);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'toast-action';
  b.textContent = actionLabel;
  b.addEventListener('click', async () => {
    clearTimeout(_timer);
    el.className = 'toast';
    await onAction();
  });
  el.appendChild(b);
  el.className = `toast toast-has-action ${type} show`;
  _timer = setTimeout(() => { el.className = 'toast'; }, 6000);
}
