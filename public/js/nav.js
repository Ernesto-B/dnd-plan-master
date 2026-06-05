(function () {
  const wrap = document.querySelector('.nav-create-wrap');
  const btn  = document.getElementById('nav-create-btn');
  if (!wrap || !btn) return;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    wrap.classList.toggle('open');
  });

  document.addEventListener('click', () => wrap.classList.remove('open'));
})();
