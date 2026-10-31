/** Extrait de Pagefind affiché dans la palette : seul `<mark>` survit, tout le reste est échappé. */
export function safeExcerpt(html: string): string {
  const escaped = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return escaped.replace(/&lt;mark&gt;/g, "<mark>").replace(/&lt;\/mark&gt;/g, "</mark>")
}
