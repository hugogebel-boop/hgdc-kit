---
"@hgdc/agents": minor
---

`@hgdc/agents/webmcp` : `registerSiteTools({ prefix, name, info, base })` inscrit auprès du navigateur (WebMCP, `document.modelContext` ou `navigator.modelContext`) deux outils en lecture seule, `<prefix>_infos` et `<prefix>_page` (page du site en Markdown). Sans prise en charge, rien ne se passe.
