# @hgdc/ui

Interface de la H family : jetons de la DA, thèmes clair et sombre, polices et composants de base, pour une application React 19 + Tailwind v4.

```sh
bun add @hgdc/ui
```

```css
/* src/styles.css */
@import "tailwindcss";
@import "@hgdc/ui/styles.css";

/* Écarts du produit, après l'import. */
:root {
  --chart-1: oklch(0.55 0.25 296);
}
```

```tsx
import { Button } from "@hgdc/ui/button"
import { ThemeProvider, themeInitScript, useTheme } from "@hgdc/ui/theme"
```

## Contenu

| Import                                                                                          | Rôle                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `@hgdc/ui/styles.css`                                                                           | Jetons OKLCH, thèmes (`.dark` sur `<html>`), Inter et Geist, utilitaires `surface`, `pressable`, `soft-in`… |
| `@hgdc/ui/theme`                                                                                | `ThemeProvider`, `useTheme`, `themeInitScript` (à poser dans le `<head>` contre le flash de thème)          |
| `@hgdc/ui/cn`                                                                                   | `cn()` (clsx + tailwind-merge)                                                                              |
| `@hgdc/ui/use-media-query`                                                                      | `useMediaQuery`, `useIsMobile` (sûrs au rendu serveur)                                                      |
| `@hgdc/ui/floating`                                                                             | Classes des surfaces flottantes (menus, sélecteurs)                                                         |
| `avatar` `badge` `button` `dialog` `drawer` `dropdown-menu` `empty` `field` `input` `input-otp` | Primitives sur Base UI                                                                                      |
| `label` `segmented-control` `select` `separator` `sonner` `spinner` `switch` `textarea`         | Primitives sur Base UI, toasts sonner, icônes Hugeicons                                                     |

Un sous-chemin par composant, sans fichier d'index : `import { Badge } from "@hgdc/ui/badge"`.

## Règles de la DA

- Chrome monochrome, un seul accent violet : focus, lien, élément actif, un geste principal par écran.
- Profondeur par la teinte : ni ombre ni bordure dans le flux, ombre réservée à ce qui flotte.
- Boutons en pilule, champs et menus en `rounded-2xl`, cartes en `rounded-3xl`.
- Un `Button` rendu en lien (`render={<Link />}`) reste un lien pour les lecteurs d'écran.

Mode d'emploi complet : [Adopter le kit](https://github.com/hugogebel-boop/hgdc-kit/blob/main/docs/guides/adopter-le-kit.md#7-interface). Décisions : [ADR 0005](https://github.com/hugogebel-boop/hgdc-kit/blob/main/docs/adr/0005-ui-css-brute-et-sous-chemins.md).

Tous droits réservés, Hugo Gebel Développement Conseil.
