// Ported from public/js/icons.js — the single source of truth for the app's
// thin-line fantasy glyphs. 24×24, stroked (fill:none) via the .app-icon rule
// in style.css. Keep new glyphs in the same visual weight.
export const ICONS = {
  home: '<path d="M4 11.5L12 4l8 7.5"></path><path d="M6.5 10.5V20h11V10.5"></path>',
  crest: '<path d="M12 3.6l6.5 2.2v5.7c0 4-2.7 6.7-6.5 8.3-3.8-1.6-6.5-4.3-6.5-8.3V5.8z"></path><path d="M12 8.4l2 3.2-2 3.4-2-3.4z"></path>',
  sessions: '<path d="M8 4.5h9v13a2 2 0 0 1-2 2H8"></path><path d="M8 4.5a2 2 0 0 0-2 2 2 2 0 0 0 2 2h2"></path><path d="M15 19.5a2 2 0 0 0 2-2"></path><path d="M10.5 9.5h4M10.5 12.5h4M10.5 15.5h2.5"></path>',
  encounters: '<path d="M5 4.5l8.6 8.6"></path><path d="M19 4.5l-8.6 8.6"></path><path d="M7.4 11.2l-2.6 2.6a1.3 1.3 0 0 0 1.8 1.8l2.6-2.6"></path><path d="M16.6 11.2l2.6 2.6a1.3 1.3 0 0 1-1.8 1.8l-2.6-2.6"></path>',
  npc: '<path d="M12 3.6c-2.4 0-4 1.8-4 4.2 0 1.7.5 3 1.5 4"></path><path d="M12 3.6c2.4 0 4 1.8 4 4.2 0 1.7-.5 3-1.5 4"></path><path d="M8.7 11.4c.7 1 2 1.6 3.3 1.6s2.6-.6 3.3-1.6"></path><path d="M5.5 20c.7-3.3 3.2-5.3 6.5-5.3s5.8 2 6.5 5.3"></path>',
  location: '<path d="M12 20s5.5-5.1 5.5-10a5.5 5.5 0 0 0-11 0c0 4.9 5.5 10 5.5 10z"></path><circle cx="12" cy="10" r="2"></circle>',
  faction: '<path d="M6 4v16"></path><path d="M6 5h11l-2.4 3.3L17 11.5H6z"></path>',
  campaign: '<path d="M4 20V10l3-1.6V20"></path><path d="M20 20V10l-3-1.6V20"></path><path d="M9 20V6.2l3-2.2 3 2.2V20"></path><path d="M3.5 20h17"></path><path d="M11 14.5h2V20"></path>',
  map: '<path d="M9 5.5L4.5 7v11.5L9 17l6 1.5 4.5-1.5V5.5L15 7 9 5.5z"></path><path d="M9 5.5V17"></path><path d="M15 7v11.5"></path>',
  settings: '<circle cx="12" cy="12" r="2.6"></circle><path d="M12 4.7l1 .2.5 1.8 1.1.5 1.7-.8.8.7-.8 1.8.5 1 .1.2 1.8.6.2 1-.2 1-1.8.6-.6 1.2.8 1.7-.7.8-1.8-.8-1.2.5-.6 1.8-1 .2-1-.2-.6-1.8-1.2-.5-1.8.8-.7-.8.8-1.7-.5-1.2-1.8-.6-.2-1 .2-1 1.8-.6.5-1.2-.8-1.8.8-.7 1.7.8 1.2-.5.6-1.8z"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  pin: '<path d="M9.5 4.5h5l-.8 3.8 2.3 2.6v1.6H8v-1.6l2.3-2.6z"></path><path d="M12 13.1V20"></path>',
  menu: '<path d="M5 7.5h14M5 12h14M5 16.5h14"></path>',
  edit: '<path d="M4.5 19.5h4l11-11-4-4-11 11z"></path><path d="M14.5 5.5l4 4"></path>',
  print: '<path d="M7 5.5h10v4H7z"></path><path d="M6 9.5h12a2 2 0 0 1 2 2v4H16v3H8v-3H4v-4a2 2 0 0 1 2-2z"></path><path d="M8.5 16.5h7"></path>',
  export: '<path d="M12 4.5v10.5"></path><path d="M8.5 8.5L12 5l3.5 3.5"></path><path d="M5.5 15.5v4h13v-4"></path>',
  download: '<path d="M12 4.5v9"></path><path d="M8.5 10.5L12 14l3.5-3.5"></path><path d="M5.5 15.5v3h13v-3"></path>',
  delete: '<path d="M6.5 7h11"></path><path d="M9 7V5.5h6V7"></path><path d="M8 7l.6 11h6.8L16 7"></path><path d="M10.5 10.5v4M13.5 10.5v4"></path>',
  back: '<path d="M10 6l-6 6 6 6"></path><path d="M5 12h14"></path>',
  connections: '<path d="M8 12a4 4 0 1 1 8 0"></path><path d="M6 12h12"></path><path d="M8 16a4 4 0 1 0 8 0"></path>',
  run: '<path d="M8 5.5l10 6.5-10 6.5z"></path>',
  help: '<circle cx="12" cy="12" r="9"></circle><path d="M9.8 9a2.4 2.4 0 1 1 4.4 1.3c-.6.9-1.6 1.1-2.2 2.2-.2.4-.3.9-.3 1.5"></path><path d="M12 17.2h0"></path>',
  up: '<path d="M12 5l-6 6"></path><path d="M12 5l6 6"></path><path d="M12 5v14"></path>',
  promote: '<path d="M12 4.5l4 4M12 4.5l-4 4M12 4.5v9.5"></path><path d="M6.5 19.5h11"></path>',
  window: '<rect x="4.5" y="5.5" width="15" height="13" rx="1.8"></rect><path d="M4.5 9h15"></path><path d="M8 5.5v13"></path>',
  search: '<circle cx="11" cy="11" r="5.5"></circle><path d="M15.5 15.5l4 4"></path>',
  save: '<path d="M5.5 5.5h10l3 3v10h-13z"></path><path d="M8 5.5v5h6v-5"></path><path d="M8 18v-5h8v5"></path>',
  table: '<path d="M4.5 6h15v12h-15z"></path><path d="M4.5 10h15"></path><path d="M9 6v12"></path><path d="M14 6v12"></path>',
  default: '<path d="M5 12h14"></path>',
};

export function Icon({ name, className = 'app-icon' }) {
  const body = ICONS[String(name || '').toLowerCase()] || ICONS.default;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}
