# @hgdc/status

Intégrer une page de [HGDC Status](https://status.hgdc.ch) dans un site, aux couleurs du site.

## Sans framework

```html
<hgdc-status page="mon-entreprise" view="page"></hgdc-status>
<script type="module" src="https://status.hgdc.ch/embed.js"></script>
```

`view="badge"` affiche seulement l'état global. Couleurs : propriétés CSS `--hgdc-status-text`,
`--hgdc-status-muted`, `--hgdc-status-surface`, `--hgdc-status-border`, `--hgdc-status-ok`…

## React

```tsx
import { HgdcStatus } from "@hgdc/status/react"

export function PiedDePage() {
  return <HgdcStatus page="mon-entreprise" view="badge" href="/status" />
}
```

Le script n'est chargé qu'une fois, même avec plusieurs composants. Un contenu enfant sert de repli
tant que le composant n'est pas chargé.

## CSP

Autoriser `https://status.hgdc.ch` dans `script-src` et `connect-src`. Le composant n'injecte
aucun style en ligne (feuille construite dans son Shadow DOM).

Les données brutes restent disponibles au format Statuspage v2 :
`https://status.hgdc.ch/<page>/api/v2/summary.json`.
