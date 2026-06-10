import { marked } from 'marked';

// Match the legacy markdown views: links open in a new tab (Electron routes
// window.open to the OS browser). Configured once at module load.
marked.use({
  renderer: {
    link(token) {
      const text = this.parser.parseInline(token.tokens);
      let out = '<a href="' + (token.href || '') + '"';
      if (token.title) out += ' title="' + token.title + '"';
      out += ' target="_blank" rel="noopener">' + text + '</a>';
      return out;
    },
  },
});

// Linkify [[wiki links]] (via the shared WikiLinks helper) then render markdown.
export function renderMarkdown(raw) {
  const pre = window.WikiLinks ? window.WikiLinks.preprocessMarkdown(raw || '') : (raw || '');
  return marked.parse(pre);
}

// Builds the heading TOC into #toc-nav (vanilla helper from tags.js). Call after
// the markdown HTML is in the DOM.
export function buildMarkdownToc() {
  if (window.buildMarkdownToc) window.buildMarkdownToc();
}
