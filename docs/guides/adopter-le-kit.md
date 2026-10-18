---
owner: Hugo Gebel
last_reviewed: 2026-10-15
---

# Adopter le kit dans un produit

Exemple de référence : `agenthost` (HGDC Host).

## 1. Installer

```sh
bun add --dev --exact @hgdc/config oxlint oxlint-tsgolint oxfmt
bunx hgdc-stack sync && bun install
```

`hgdc-stack sync` épingle aux versions de la stack chaque paquet que le produit utilise déjà.

## 2. TypeScript

```jsonc
// tsconfig.json (application Vite + React)
{ "extends": "@hgdc/config/tsconfig/app.json", "include": ["src"], "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }

// convex/tsconfig.json
{ "extends": "@hgdc/config/tsconfig/convex.json", "include": ["./**/*"], "exclude": ["./_generated"] }
```

Presets : `base.json` (strict, `module: preserve`), `app.json` (DOM, JSX, `vite/client`), `convex.json` (options exigées par Convex), `library.json` (paquet publié, déclarations isolées).

## 3. Lint et format

```ts
// oxlint.config.ts
import hgdc from "@hgdc/config/oxlint"
import { defineConfig } from "oxlint"

export default defineConfig({
  extends: [hgdc],
  options: { typeAware: true },
  ignorePatterns: ["**/_generated/**", "src/routeTree.gen.ts"],
})

// oxfmt.config.ts
import hgdc from "@hgdc/config/oxfmt"
import { defineConfig } from "oxfmt"

export default defineConfig({
  ...hgdc,
  sortTailwindcss: { stylesheet: "./src/styles.css", functions: ["cn", "cva"] },
})
```

Une exception propre au produit va dans `overrides` de sa config, avec la raison en commentaire. Une exception sur une ligne : `// oxlint-disable-next-line <règle> -- raison`.

Adopter oxfmt reformate tout le dépôt : le faire dans un commit à part, puis ajouter son SHA à `.git-blame-ignore-revs`.

oxfmt exige des fins de ligne LF. Sous Windows (`core.autocrlf=true`), git rend les fichiers en CRLF et `format:check` échoue sur tout le dépôt : poser un `.gitattributes` avant le formatage.

```gitattributes
* text=auto eol=lf
*.png binary
*.ico binary
*.woff2 binary
```

Côté tests, le preset accepte `expect(valeur, "message")` et compte comme assertion toute fonction `expect…` (une aide partagée comme `expectExited`), en plus de `assert` et `assertType`.

## 4. Scripts et CI

```json
"check": "hgdc-stack check && bun run format:check && bun run typecheck && bun run lint && bun run test"
```

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  check:
    uses: hugogebel-boop/hgdc-kit/.github/workflows/check.yml@<sha> # main
```

Exiger le statut `check / check` dans la protection de `main` : sans lui, la fusion automatique passerait outre une CI rouge.

Le check tourne par défaut sur une machine de GitHub. Un produit **privé** qui a son propre runner auto-hébergé l'y envoie par l'entrée `runner`, les étiquettes de `runs-on` en JSON. Une variable de dépôt permet de revenir sur GitHub sans toucher au workflow :

```yaml
jobs:
  check:
    uses: hugogebel-boop/hgdc-kit/.github/workflows/check.yml@<sha> # main
    with:
      runner: ${{ vars.HGDC_RUNNER || '["self-hosted", "<étiquette>"]' }}
```

Jamais pour un dépôt public, le kit compris : un runner auto-hébergé exécuterait le code de n'importe quelle PR venue d'un fork.

Recherche de secrets (gitleaks sur tout l'historique, binaire vérifié par sa somme SHA-256) : un second job, sur la même machine.

```yaml
secrets:
  uses: hugogebel-boop/hgdc-kit/.github/workflows/secrets.yml@<sha> # main
  with:
    runner: ${{ vars.HGDC_RUNNER || '["self-hosted", "<étiquette>"]' }}
```

Les faux secrets des tests (clés générées, jetons volontairement faux) se lèvent par un `.gitleaks.toml` à la racine, limité à la règle générique dans les fichiers de test : une vraie clé reconnue (AWS, GitHub, Stripe…) reste détectée partout.

```toml
[extend]
useDefault = true

[[allowlists]]
description = "Faux secrets des tests"
targetRules = ["generic-api-key"]
paths = ['''(^|/)[^/]+\.test\.tsx?$''', '''(^|/)test\.setup\.ts$''']
```

Avant de lever une trouvaille, vérifier sans afficher la valeur qu'elle est factice (contexte du test, absente de Doppler).

## 5. Renovate et propagation

```json
// renovate.json
{ "extends": ["github>hugogebel-boop/hgdc-kit//packages/config/renovate"] }
```

Puis ajouter le dépôt à la variable `HGDC_PRODUCTS` du kit (tableau JSON lu par `propagate.yml`) et au jeton `HGDC_BOT_TOKEN` (accès au dépôt, _Contents_ et _Pull requests_ en écriture), et activer « Allow auto-merge » dans les réglages du dépôt :

```sh
gh variable set HGDC_PRODUCTS --repo hugogebel-boop/hgdc-kit --body '["hugogebel-boop/agenthost"]'
```

## 6. Connexion HGDC (`@hgdc/auth`)

Pour un produit qui se connecte par HGDC Account : `bun add @hgdc/auth`, puis suivre le [README du paquet](../../packages/auth/README.md) (fournisseur `hgdc` dans `genericOAuth`, proxy `/api/auth` avec `restoreFetchMode` côté Convex, bouton, gardes avec l'émetteur `CONVEX_SITE_URL`). Le `clientId` et le `clientSecret` sont remis par HGDC à l'enregistrement du produit.

Synchronisation des organisations (0.4) : suivre le modèle du README, « Synchroniser les organisations » : `verifiedOrganizationsFromIdToken` dans `session.create.before`, sessions de 7 jours sans prolongation (`SESSION_TTL_SECONDS`, `disableSessionRefresh: true`), `syncedAt` sur chaque appartenance et `membershipIsFresh` dans le chargeur de `requireOrgMember`. Un produit qui a sa propre copie de ces règles (Host : `verifiedClaims`, `membershipIsFresh`) la remplace par celles du kit. Pour réagir à un refus côté client, lire `authErrorReason(error)`, jamais le texte du message : il est passé au tutoiement en 0.4 (« Connecte-toi pour continuer. »), et un test qui le compare mot à mot est à mettre à jour.

## 7. Interface

```sh
bun add @hgdc/ui
```

```css
/* src/styles.css : Tailwind, puis le kit, puis ce qui est propre au produit */
@import "tailwindcss";
@import "@hgdc/ui/styles.css";

@custom-variant rail (&:where([data-sidebar="rail"] *));

:root {
  --chart-1: oklch(0.55 0.25 296); /* un écart au jeton du kit */
}
```

Le kit apporte les polices (Inter, Geist), `shadcn/tailwind.css`, les jetons clair et sombre et les utilitaires communs (`surface`, `surface-link`, `pressable`, `touch-target`, `soft-in`, `rise`…). Le produit ne garde que ses ajouts : variantes, teintes, animations qui lui sont propres. Ne pas redéclarer un `@utility` du kit.

Le thème : `ThemeProvider` autour de l'application, et `themeInitScript` dans un `<script>` du `<head>`, avant la feuille de styles, pour éviter le flash au chargement.

La coque des consoles (0.3) : `AppShell` avec `OrgSwitcher` en haut, `SidebarNav` au milieu, `AccountMenu` en bas, et `CommandMenu` une fois dans la page (`Ctrl+K`). Poser aussi `sidebarInitScript` dans le `<head>`, à côté de `themeInitScript`, et `TooltipProvider` autour de l'application. Le kit ne connaît pas le routeur : chaque lien passe par `render={<Link to="…" />}`, et TanStack Router marque l'entrée active (`data-status="active"`) sans rien de plus. La variante `rail:` vient du kit : retirer la déclaration locale et `lib/sidebar.ts`.

Depuis 0.29, le bas de la barre est à la coque : `links` (Documentation, Réglages, État du service, dans cet ordre) puis `account`. `sidebarFooter` reste rendu tel quel quand `account` manque, mais il est déprécié : y retirer les liens Docs, Réglages et Assistant. L'assistant passe par `assistant` : son bouton se pose à côté de la recherche, son panneau dans une colonne à droite ; le produit ne passe que le corps (conversation et saisie), la coque pose le titre, la fermeture et le retour à la page.

```tsx
<AppShell
  sidebarHeader={
    <OrgSwitcher
      organizations={orgs}
      activeId={org.id}
      onSelect={(id) => navigate(id)}
      createHref="/organisations/nouvelle"
    />
  }
  nav={
    <SidebarNav label="Projet">
      <SidebarNavItem
        icon={Rocket01Icon}
        label="Déploiements"
        render={<Link to="/$team/$project/deployments" params={params} />}
      />
    </SidebarNav>
  }
  links={{ documentation: "/docs", settings: { render: <Link to="/settings" /> } }}
  account={<AccountMenu user={user} onProfile={() => navigate({ to: "/account" })} onSignOut={signOut} />}
  onSearch={() => setPaletteOpen(true)}
  assistant={{ open: assistantOpen, onOpenChange: setAssistantOpen, panel: <AssistantBody /> }}
>
  <Outlet />
</AppShell>
```

### Listes, journaux et erreurs (0.4)

`DataTable` et `FilterBar` sont contrôlés et ne connaissent pas le routeur : l'état vit dans les paramètres d'URL du produit (tri, page, filtres, recherche), le tableau l'affiche et rappelle. Avec TanStack Router :

```tsx
const search = Route.useSearch()
const navigate = useNavigate({ from: Route.fullPath })

<DataTable
  label="Déploiements"
  rows={deployments} // undefined pendant le chargement : squelette
  columns={columns}
  rowKey={(d) => d._id}
  sort={search.sort ? { key: search.sort, direction: search.dir ?? "ascending" } : null}
  onSortChange={(s) => navigate({ search: (p) => ({ ...p, sort: s.key, dir: s.direction }), replace: true })}
  filtered={activeFilterCount({ status: search.status }, search.q) > 0}
  filters={
    <FilterBar
      search={{ value: search.q ?? "", onChange: (q) => navigate({ search: (p) => ({ ...p, q: q || undefined }), replace: true }) }}
      filters={[{ key: "status", label: "Statut", options: STATUS_OPTIONS }]}
      values={{ status: search.status }}
      onFilterChange={(key, values) => navigate({ search: (p) => ({ ...p, [key]: values.length ? values : undefined }) })}
      onReset={() => navigate({ search: {} })}
    />
  }
  loadMore={{ hasMore: status === "CanLoadMore", loading: status === "LoadingMore", onLoadMore: () => loadMore(20) }}
/>
```

La recherche n'écrit dans l'URL qu'après 250 ms de calme : `replace: true` pour elle et le tri, une entrée d'historique pour un filtre. `loadMore` suit `usePaginatedQuery` de Convex ; `pagination` sert aux pages numérotées.

Une erreur de chargement : `ErrorCard` à la place du contenu (`error={<ErrorCard detail={String(error)} reference={requestId} onRetry={refetch} />}` dans un `DataTable`). Une suppression : `DestructiveDialog` remplace la copie `confirm-delete-dialog.tsx` de Mail, même API (`formatError` en plus pour traduire une `ConvexError`). Une action réversible : `toastUndo(message, { onUndo })` plutôt qu'une confirmation, avec le `Toaster` du kit monté une fois.

### Sélecteur de projet et grandes listes (0.28)

Dans la barre du haut d'`AppShell` (`header`), un produit qui a des projets pose `ProjectSwitcher` : le projet ouvert avec sa marque, ou « Tous les projets », la liste, « Nouveau projet ». Le kit ne lit rien : le produit passe la liste et le routeur.

```tsx
<ProjectSwitcher
  projects={projects?.map((p) => ({
    id: p._id,
    name: p.name,
    iconUrl: p.faviconUrl,
    mark: "D",
    href: `/o/${team}/${p.slug}`,
  }))}
  activeId={current?._id ?? null}
  activeName={params.project} // affiché pendant le chargement
  allHref={`/o/${team}`}
  createHref={`/o/${team}/new`}
  renderLink={(href) => <Link to={href} />}
/>
```

Règle commune des grandes listes (appels, journaux, envois, événements) : **200 lignes par page**, Précédent et Suivant, filtres (période, statut ou résultat, recherche) appliqués côté serveur sur toutes les données, retour à la première page quand un filtre change. Jamais tout l'historique chargé puis découpé dans le navigateur, jamais de « Charger plus » qui empile des milliers de lignes. La hauteur de la liste suit les lignes affichées : pas de `max-h` qui laisse une zone blanche derrière elle. 200 lignes se rendent sans virtualisation ; `LogViewer` reste pour un flux en direct.

Côté Convex, un index par combinaison de filtres, l'ordre `_creationTime` décroissant (stable : chaque index finit par `_creationTime`), la période en plage sur l'index :

```ts
// convex/schema.ts
calls: defineTable({ monitorId: v.id("monitors"), ok: v.boolean(), status: v.number() })
  .index("by_monitor", ["monitorId"])
  .index("by_monitor_ok", ["monitorId", "ok"]),

// convex/calls.ts
export const list = query({
  args: {
    monitorId: v.id("monitors"),
    result: v.optional(v.union(v.literal("ok"), v.literal("error"))),
    from: v.number(),
    to: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { monitorId, result, from, to, paginationOpts }) => {
    await requireMonitorAccess(ctx, monitorId) // la garde du produit, avant toute lecture
    const calls =
      result === undefined
        ? ctx.db
            .query("calls")
            .withIndex("by_monitor", (q) =>
              q.eq("monitorId", monitorId).gte("_creationTime", from).lt("_creationTime", to),
            )
        : ctx.db
            .query("calls")
            .withIndex("by_monitor_ok", (q) =>
              q.eq("monitorId", monitorId).eq("ok", result === "ok").gte("_creationTime", from).lt("_creationTime", to),
            )
    return await calls.order("desc").paginate({ ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 200) })
  },
})
```

Côté page, `useCursorPages` tient la pile des curseurs, `CursorPager` la navigation :

```tsx
const filters = { monitorId, result: search.result, from: search.from, to: search.to }
const pages = useCursorPages(JSON.stringify(filters)) // nouvelle clé : page 1
const data = useQuery(api.calls.list, { ...filters, paginationOpts: pages.paginationOpts })
const top = useRef<HTMLDivElement>(null)

<div ref={top}>
  <DataTable label="Appels" rows={data?.page} columns={columns} rowKey={(c) => c._id} filters={<FilterBar …/>} filtered={…} />
</div>
<CursorPager pages={pages} result={data} scrollTarget={top} label="Pagination des appels" />
```

- La période vit dans l'URL en dates fixes (`from`, `to`) : un « dernières 24 heures » recalculé à chaque rendu par `Date.now()` changerait la clé, donc la page, sans arrêt.
- Revenir en arrière relit la page avec `endCursor` (la borne déjà connue) : ni ligne perdue ni doublon quand de nouvelles lignes arrivent ; la première page peut alors en montrer un peu plus de 200 jusqu'au prochain changement de filtre.
- Un filtre qu'aucun index ne porte (`.filter()` avant `paginate`) donne des pages courtes et lit tout le reste : ajouter l'index. La recherche passe par un `searchIndex` avec `filterFields` (ordre de pertinence, pas `_creationTime`).
- Erreur de la query : `ErrorCard` à la place du tableau ; chargement : `rows={undefined}` (squelette) et le pager garde sa place.

### Réglages, champs et tableaux de bord (0.5)

- Une page de réglages : un `SettingsSection` par bloc, chacun son bouton Enregistrer (`dirty`, `saving`, `onSave`). Host retire `SettingsSection` de `components/page.tsx`.
- Le menu du compte : `product="Mail"` suffit, la liste vient du catalogue du kit (`@hgdc/ui/products`). Mail retire `HGDC_PRODUCTS` de `lib/account.ts` (passer `accountHref` pour un Account local), Account son `lib/products.ts` au profit de `HGDC_PRODUCTS` et `PRODUCT_STAGE_LABEL`. Un produit qui passait déjà `products` garde sa liste ; `products={[]}` retire la rubrique.
- Statut d'un déploiement, d'un e-mail ou d'un domaine : `<StatusBadge tone="…" label="…" />` plutôt qu'un `Badge` coloré à la main. `pending` anime le point.
- Un graphique par jour dont la journée n'est pas finie : `lastIncomplete`.
- Montants : stocker des centimes entiers, saisir par `MoneyField`, afficher par `formatChf`. Adresses : le type `PostalAddress` se stocke tel quel (rue et numéro séparés), prêt pour une facture QR.

### Migrer depuis des copies locales

Les primitives de Host et Mail sont celles du kit. Pour basculer :

```sh
grep -rlE '@/components/ui/|@/components/(spinner|theme-provider)|@/lib/hooks/use-media-query|@/lib/utils"' src \
  | xargs sed -i -E 's#"@/components/ui/([a-z-]+)"#"@hgdc/ui/\1"#g; s#"@/components/spinner"#"@hgdc/ui/spinner"#g;
      s#"@/components/theme-provider"#"@hgdc/ui/theme"#g; s#"@/lib/hooks/use-media-query"#"@hgdc/ui/use-media-query"#g;
      s#"@/lib/utils"#"@hgdc/ui/cn"#g'
```

Puis retirer `src/components/ui/`, `spinner.tsx`, `theme-provider.tsx`, `use-media-query.ts`, `lib/utils.ts`, réduire `styles.css` à ses ajouts, et lancer `check` et `build`.

Le kit suit l'interface de Host. Écarts à connaître : un bouton ne grossit plus au survol, seule sa couleur change ; un `Button` rendu en lien n'a plus `role="button"` ; une grille sans colonnes déclarées ne déborde plus sur téléphone (`.grid` en `minmax(0, 1fr)`). Pour Mail en plus : `SegmentedControl` reprend son contour, et `surface` ne repeint plus `--muted` dans ses enfants.

Texte d'un statut : `text-status-active-ink`, `text-status-paused-ink` ou `text-info-ink` sur un lavis (`bg-status-active/15`), jamais la couleur vive en texte : elle reste aux pastilles et aux graphiques. L'information est bleue (`--info`), le violet reste l'accent. Chargement : `<Spinner />` dans un bouton ou une ligne, `<Spinner size={8} tone="accent" />` seul sur une page.

Couleur d'un client : poser `--brand-accent` et `--brand-accent-foreground` (et leurs variantes `-dark`). L'accent, l'anneau de focus et `--accent-soft` suivent.

## 8. E-mails transactionnels (`@hgdc/ui/email`, 0.6)

```sh
bun add --exact react-email@6.11.1   # version de la stack
```

1. Écrire chaque e-mail comme un composant sur `EmailLayout`, à partir de l'exemple le plus proche dans `scripts/email-showcase.tsx` (code de confirmation, invitation, alerte de panne, confirmation d'abonnement).
2. Rendre dans une action `"use node"` : `const { html, text } = await renderEmail(<MonEmail … />)`, puis envoyer `html` et `text` ensemble par HGDC Mail. Une valeur saisie par une personne passe en enfant JSX : React l'échappe.
3. Retirer l'ancien gabarit : `convex/emails/SystemEmail.tsx` (Mail), `convex/lib/mailTemplates.ts` (Account), le texte seul de Status, le gabarit de Portal.

Textes : tutoiement, une action par e-mail, `EmailText small` pour la validité et le « si tu n'as rien demandé », pas de grand tiret. Un e-mail envoyé aux abonnés d'un client (Status) passe `name="Statut · <page>"`, et `accent` si la page a une couleur ; `footer` dit pourquoi la personne le reçoit et porte le lien de désabonnement (`List-Unsubscribe` reste dans les en-têtes).

## 9. Erreurs (`@hgdc/errors`)

```sh
bun add --exact @hgdc/errors
```

| Ancienne copie                                                   | Remplacement                                                                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `convex/lib/errorReport.ts` (`reportServerError`)                | `import { reportServerError } from "@hgdc/errors/convex"`, même signature                                              |
| `src/lib/error-reporting.ts`                                     | `createBrowserReporter({ dsn: import.meta.env.VITE_GLITCHTIP_DSN, keyPrefixes: ["am_"] })`, puis `report` et `install` |
| `shared/errorReport.ts`, `collector/error-report.ts` (Analytics) | `@hgdc/errors` (cœur) et `createErrorReporter` de `@hgdc/errors/server`                                                |

Les variables d'environnement ne changent pas (`GLITCHTIP_DSN`, `VITE_GLITCHTIP_DSN`) ; `GLITCHTIP_RELEASE` (SHA du commit) est facultative. Garder les préfixes de clés du produit dans `keyPrefixes` (`ah_` pour Host, `am_` pour Mail). Supprimer ensuite les copies et leurs tests : ceux du paquet les couvrent.
