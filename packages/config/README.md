# @hgdc/config

Configuration partagée des produits de la H family : presets TypeScript, oxlint et oxfmt, preset Renovate, versions exactes de la stack.

```sh
bun add --dev --exact @hgdc/config
bunx hgdc-stack check   # échoue si une dépendance de la stack n'est pas à sa version
bunx hgdc-stack sync    # réécrit package.json aux versions de la stack
```

| Export                                                     | Usage                               |
| ---------------------------------------------------------- | ----------------------------------- |
| `@hgdc/config/tsconfig/{base,app,convex,library}.json`     | `"extends"` d'un tsconfig           |
| `@hgdc/config/oxlint`                                      | `extends` d'un `oxlint.config.ts`   |
| `@hgdc/config/oxfmt`                                       | à étendre dans un `oxfmt.config.ts` |
| `@hgdc/config/stack.json`                                  | versions exactes de la stack        |
| `github>hugogebel-boop/hgdc-kit//packages/config/renovate` | preset Renovate                     |

Mode d'emploi complet : [Adopter le kit](https://github.com/hugogebel-boop/hgdc-kit/blob/main/docs/guides/adopter-le-kit.md).

Tous droits réservés, Hugo Gebel Développement Conseil.
