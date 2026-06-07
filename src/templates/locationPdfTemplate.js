function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function block(title, body) {
  if (!body) return '';
  return `
    <section class="section">
      <div class="section-title">${esc(title)}</div>
      <div class="section-body">${body}</div>
    </section>
  `;
}

function renderGeneral(loc) {
  const rows = [
    ['Government', loc.government],
    ['Population Size', loc.populationSize],
    ['Population Diversity', loc.populationDiversity],
    ['Languages', loc.languages],
    ['Resources', loc.resources],
    ['Fun Fact', loc.funFact],
  ].filter(([, value]) => String(value || '').trim());
  if (!rows.length) return '';
  return block('General', rows.map(([label, value]) => `
    <div class="general-row">
      <div class="general-label">${esc(label)}</div>
      <div class="general-value">${esc(value)}</div>
    </div>
  `).join(''));
}

function renderDistricts(districts) {
  if (!Array.isArray(districts) || !districts.length) return '';
  const filled = districts.filter(d => d.name || d.readAloud || (d.pointsOfInterest && d.pointsOfInterest.length));
  if (!filled.length) return '';
  return block('Districts', filled.map(d => `
    <div class="district">
      <div class="district-name">${esc(d.name || 'Unnamed District')}</div>
      ${d.readAloud ? `<div class="district-read-aloud">${esc(d.readAloud)}</div>` : ''}
      ${(d.pointsOfInterest || []).filter(p => p.name || p.description).length ? `<ul>${
        (d.pointsOfInterest || []).filter(p => p.name || p.description).map(p =>
          `<li><strong>${esc(p.name || 'Unnamed')}</strong> — ${esc(p.description || '')}</li>`
        ).join('')
      }</ul>` : ''}
    </div>
  `).join(''));
}

function render(location) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(location.name || 'Location')}</title>
  <style>
    body {
      font-family: Georgia, serif;
      color: #2b2114;
      margin: 30px 36px;
      line-height: 1.5;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      color: #7b5311;
      letter-spacing: 0.4px;
    }
    .tags {
      font-size: 12px;
      margin-bottom: 16px;
      color: #5e513f;
    }
    .section {
      margin-bottom: 18px;
      break-inside: avoid;
    }
    .section-title {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: #7b5311;
      margin-bottom: 6px;
    }
    .section-body {
      font-size: 14px;
      white-space: pre-wrap;
    }
    .general-row {
      display: flex;
      gap: 8px;
      margin-bottom: 4px;
    }
    .general-label {
      font-weight: bold;
      min-width: 150px;
    }
    .district {
      margin-bottom: 14px;
    }
    .district-name {
      font-weight: bold;
      margin-bottom: 2px;
    }
    .district-read-aloud {
      font-style: italic;
      margin-bottom: 4px;
    }
    ul {
      margin: 0;
      padding-left: 20px;
    }
  </style>
</head>
<body>
  <h1>${esc(location.name || 'Unnamed Location')}</h1>
  ${Array.isArray(location.tags) && location.tags.length ? `<div class="tags">Tags: ${esc(location.tags.join(', '))}</div>` : ''}
  ${renderGeneral(location)}
  ${block('Description', esc(location.description || ''))}
  ${block('Sensory Detail', esc(location.sensoryDetail || ''))}
  ${block('Hidden Detail', esc(location.hiddenDetail || ''))}
  ${renderDistricts(location.districts)}
  ${block('On the Horizon', esc(location.onTheHorizon || ''))}
</body>
</html>`;
}

module.exports = {
  render,
};
