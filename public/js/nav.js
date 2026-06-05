(function () {
  const nav = document.querySelector('.top-nav');
  if (nav && !nav.querySelector('.nav-link[href="/campaign"]')) {
    const settingsLink = nav.querySelector('.nav-link[href="/settings"]');
    const link = document.createElement('a');
    link.href = '/campaign';
    link.className = 'nav-link';
    link.textContent = 'Campaign';
    if (settingsLink) nav.insertBefore(link, settingsLink);
  }

  const pathname = window.location.pathname;
  const activeByPath = [
    { href: '/', match: pathname === '/' || pathname === '/view' || pathname === '/form' || pathname.startsWith('/view/') },
    { href: '/encounters', match: pathname === '/encounters' || pathname.startsWith('/encounter/') },
    { href: '/campaign', match: pathname === '/campaign' },
    { href: '/settings', match: pathname === '/settings' },
  ];
  const active = activeByPath.find(item => item.match);
  if (nav && active) {
    nav.querySelectorAll('.nav-link').forEach(link => link.classList.remove('nav-link-active'));
    const activeLink = nav.querySelector(`.nav-link[href="${active.href}"]`);
    if (activeLink) activeLink.classList.add('nav-link-active');
  }

  const wrap = document.querySelector('.nav-create-wrap');
  const btn  = document.getElementById('nav-create-btn');
  if (wrap && btn) {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      wrap.classList.toggle('open');
    });

    document.addEventListener('click', () => wrap.classList.remove('open'));
  }

  const scrollTopBtn = document.createElement('button');
  scrollTopBtn.type = 'button';
  scrollTopBtn.className = 'scroll-top-btn';
  scrollTopBtn.setAttribute('aria-label', 'Back to top');
  scrollTopBtn.setAttribute('title', 'Back to top');
  scrollTopBtn.innerHTML = '&#8593;';
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.body.appendChild(scrollTopBtn);

  function updateScrollTopButton() {
    scrollTopBtn.classList.toggle('visible', window.scrollY > 320);
  }

  window.addEventListener('scroll', updateScrollTopButton, { passive: true });
  updateScrollTopButton();
})();
