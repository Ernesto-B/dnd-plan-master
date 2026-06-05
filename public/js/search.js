(function () {
  window.initSearch = function ({ containerId, getAllItems, renderFn, fields, dateField }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="search-bar">
        <div class="search-main">
          <input type="text" id="search-query" class="search-input"
            placeholder="Search by ID, name, or tag…" autocomplete="off" spellcheck="false">
          <div class="search-date-wrap">
            <span class="search-date-label">From</span>
            <input type="date" id="search-from" class="search-date">
            <span class="search-date-label">To</span>
            <input type="date" id="search-to" class="search-date">
          </div>
        </div>
        <div class="search-chips">
          <button class="search-chip" data-filter="week">This Week</button>
          <button class="search-chip" data-filter="month">This Month</button>
          <button class="search-chip search-chip-clear" data-filter="clear">✕ Clear</button>
        </div>
      </div>`;

    const queryInput = document.getElementById('search-query');
    const fromInput  = document.getElementById('search-from');
    const toInput    = document.getElementById('search-to');

    function applyFilter() {
      const query = queryInput.value.trim();
      const from  = fromInput.value;
      const to    = toInput.value;
      const isActive = !!(query || from || to);
      let items = getAllItems();

      if (query) {
        const q = query.toLowerCase();
        items = items.filter(item => {
          const pool = fields.map(fn => fn(item) || '').join(' ').toLowerCase();
          return fuzzyMatch(q, pool);
        });
      }

      if (from) {
        const fromMs = new Date(from).getTime();
        items = items.filter(item => {
          const d = dateField ? dateField(item) : null;
          return d && new Date(d).getTime() >= fromMs;
        });
      }

      if (to) {
        const toMs = new Date(to + 'T23:59:59').getTime();
        items = items.filter(item => {
          const d = dateField ? dateField(item) : null;
          return d && new Date(d).getTime() <= toMs;
        });
      }

      renderFn(items, isActive);
    }

    queryInput.addEventListener('input', applyFilter);
    fromInput.addEventListener('change', applyFilter);
    toInput.addEventListener('change', applyFilter);

    const allChips = [...container.querySelectorAll('.search-chip[data-filter]')];

    function setActiveChip(activeFilter) {
      allChips.forEach(c => c.classList.toggle('active', c.dataset.filter === activeFilter));
    }

    // Clear chip active state whenever dates are edited manually
    fromInput.addEventListener('change', () => setActiveChip(null));
    toInput.addEventListener('change',   () => setActiveChip(null));
    queryInput.addEventListener('input',  () => { if (!fromInput.value && !toInput.value) setActiveChip(null); });

    allChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        if (chip.dataset.filter === 'week') {
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);
          fromInput.value = weekAgo.toISOString().slice(0, 10);
          toInput.value   = today;
          setActiveChip('week');
        } else if (chip.dataset.filter === 'month') {
          fromInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
          toInput.value   = today;
          setActiveChip('month');
        } else {
          queryInput.value = '';
          fromInput.value  = '';
          toInput.value    = '';
          setActiveChip(null);
        }
        applyFilter();
      });
    });
  };

  function fuzzyMatch(needle, haystack) {
    let hi = 0;
    for (let ni = 0; ni < needle.length; ni++) {
      while (hi < haystack.length && haystack[hi] !== needle[ni]) hi++;
      if (hi >= haystack.length) return false;
      hi++;
    }
    return true;
  }
})();
