import { marked } from 'marked';
import { preprocessMarkdown, buildMarkdownToc as _buildToc } from './wikiLinks.js';

marked.use({
  renderer: {
    link(token) {
      const text = this.parser.parseInline(token.tokens);
      let out = '<a href="' + (token.href || '') + '"';
      if (token.title) out += ' title="' + token.title + '"';
      return out + ' target="_blank" rel="noopener">' + text + '</a>';
    },
  },
});

export function renderMarkdown(raw) {
  return marked.parse(preprocessMarkdown(raw || ''));
}

export function buildMarkdownToc() {
  _buildToc();
}
