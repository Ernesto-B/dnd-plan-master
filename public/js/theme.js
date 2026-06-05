(function () {
  var theme = localStorage.getItem('dnd-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
})();
