# @hgdc/ui

Interface de la H family : jetons de la DA, thèmes clair et sombre, polices, composants de base et coque des consoles, pour une application React 19 + Tailwind v4.

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
import { ThemeProvider, themeInitScript } from "@hgdc/ui/theme"
import { sidebarInitScript } from "@hgdc/ui/app-shell"
```

Un sous-chemin par composant, sans fichier d'index. Les primitives viennent toutes de Base UI ; les graphiques sont en SVG, sans bibliothèque.

## Fondations

| Import                     | Rôle                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `@hgdc/ui/styles.css`      | Jetons OKLCH, thèmes (`.dark` sur `<html>`), variante `rail:`, polices, utilitaires `surface`, `pressable`, `skeleton-pulse`… |
| `@hgdc/ui/theme`           | `ThemeProvider`, `useTheme`, `themeInitScript` (dans le `<head>`, contre le flash de thème)                                   |
| `@hgdc/ui/cn`              | `cn()` (clsx + tailwind-merge)                                                                                                |
| `@hgdc/ui/use-media-query` | `useMediaQuery`, `useIsMobile`                                                                                                |
| `@hgdc/ui/floating`        | Classes des surfaces flottantes                                                                                               |

Primitives déjà là : `avatar` `badge` `button` `dialog` `drawer` `dropdown-menu` `empty` `field` `input` `input-otp` `label` `segmented-control` `select` `separator` `sonner` `spinner` `switch` `textarea`.

## Coque des consoles

| Import         | Exemple                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app-shell`    | `<AppShell sidebarHeader={<OrgSwitcher …/>} nav={<SidebarNav label="Projet">…</SidebarNav>} sidebarFooter={<AccountMenu …/>}>`                               |
|                | `<SidebarNavItem icon={Rocket01Icon} label="Déploiements" render={<Link to="/deployments" />} />`                                                            |
| `org-switcher` | `<OrgSwitcher organizations={orgs} activeId={org.id} onSelect={go} createHref="/organisations/nouvelle" />`                                                  |
| `account-menu` | `<AccountMenu user={user} onProfile={…} onSecurity={…} onSignOut={signOut} products={HGDC_PRODUCTS} />`                                                      |
| `command-menu` | `<CommandMenu groups={[{ label: "Aller à", items }, { label: "Créer", items }, { label: "Changer", items }]} />` (`Ctrl+K`)                                  |
| `kbd`          | `<KbdGroup><Kbd>Ctrl</Kbd><Kbd>K</Kbd></KbdGroup>`                                                                                                           |
| `page-header`  | `<PageHeader title="Domaines" breadcrumbs={[{ label: "Acme", render: <Link to="/o/acme" /> }, { label: "Domaines" }]} actions={<Button>Ajouter</Button>} />` |

La barre se réduit en rail (`Ctrl+B`, mémorisé) : poser `sidebarInitScript` dans le `<head>`. Le kit ne connaît ni routeur ni authentification : liens par `render={<Link />}`, actions par callbacks. Rôles d'organisation : `owner`, `admin`, `member` (Propriétaire, Admin, Membre).

## Contenu et données

| Import          | Exemple                                                                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `card`          | `<Card><CardHeader><CardTitle>Domaines</CardTitle><CardAction>…</CardAction></CardHeader><CardContent>…</CardContent><CardFooter>…</CardFooter></Card>`                                              |
| `alert`         | `<Alert tone="warning" title="Quota presque atteint" action={<Button size="sm">Voir</Button>}>90 % utilisés.</Alert>`                                                                                |
| `table`         | `<TableHead sort="descending" onSort={…}>Date</TableHead>`, `<TableRowLink render={<Link … />}>Production</TableRowLink>`, `<TableEmpty colSpan={4}>…</TableEmpty>`, `<TableSkeleton columns={4} />` |
| `resource-list` | `<ResourceList><ResourceItem icon={…} title="Site vitrine" meta="acme.ch" badge={…} actions={…} href="/p/site" /></ResourceList>`                                                                    |
| `stat`          | `<StatGrid><StatTile label="Erreurs" value="12" delta={{ value: "8 %", direction: "up", good: "down" }} /></StatGrid>`                                                                               |
| `time-chart`    | `<TimeChart label="Envois par jour" timestamps={days} series={[{ key: "sent", label: "Envoyés", values }]} kind="bar" />`                                                                            |
| `status`        | `<StatusBadge status="degraded" />` (Opérationnel, Dégradé, Panne, Maintenance, Inconnu)                                                                                                             |
| `uptime-bar`    | `<UptimeBar days={[{ date, status: "operational", uptime: "100 %" }]} summary="99,95 % sur 90 jours" />`                                                                                             |
| `timeline`      | `<Timeline entries={[{ id, title: "Résolu", time, status: "operational" }]} />`                                                                                                                      |
| `relative-time` | `<RelativeTime date={deployment._creationTime} />` (« il y a 3 min », date exacte au survol)                                                                                                         |
| `copy-button`   | `<Snippet value="bun add @hgdc/ui" prompt />`, `<CopyButton value={url} />`                                                                                                                          |
| `secret-reveal` | `<SecretReveal label="Clé d'API" value={key} onDismiss={forget} />` : affichée une fois, puis retirée de la page                                                                                     |
| `skeleton`      | `<Pending pending={isLoading} fallback={<TableSkeleton columns={3} />}>…</Pending>` : après 200 ms, tenu 400 ms au moins                                                                             |

## Listes, journaux et retours

| Import               | Exemple                                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filter-bar`         | `<FilterBar search={{ value: q, onChange }} filters={[{ key: "status", label: "Statut", options }]} values={{ status }} onFilterChange={…} onReset={…} />` |
| `data-table`         | `<DataTable label="Déploiements" rows={rows} columns={columns} rowKey={(d) => d.id} sort={sort} onSortChange={…} filters={<FilterBar …/>} loadMore={…} />` |
| `dns-record-table`   | `<DnsRecordTable records={[{ type: "MX", name: "send", value, priority: 10, status: "pending" }]} />` (Vérifié, En attente, Échec, À ajouter)              |
| `log-viewer`         | `<LogViewer lines={[{ id, time, level: "error", message }]} live />` : niveaux, recherche, « Suivre », copie ; seules les lignes visibles sont rendues     |
| `sparkline`          | `<Sparkline label="Envois sur 7 jours" values={[3, 8, 5]} color={2} />`                                                                                    |
| `middle-truncate`    | `<MiddleTruncate text={deployment.url} />` : « …/routes/index.tsx », texte entier dans la page                                                             |
| `error-card`         | `<ErrorCard title="Impossible de charger les journaux" detail={message} reference={requestId} onRetry={refetch} />`                                        |
| `destructive-dialog` | `<DestructiveDialog open={open} onOpenChange={setOpen} title="Supprimer le domaine" question="…" name="acme.ch" onConfirm={remove} />`                     |
| `sonner`             | `<Toaster />` une fois, puis `toastUndo("Domaine retiré", { onUndo: restore })` ; `errorMessage(error)` pour un toast d'erreur                             |

Filtres, tri et page vivent dans l'URL du produit : les composants sont contrôlés et ne connaissent pas le routeur.

## Contrôles et surfaces flottantes

| Import        | Exemple                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `checkbox`    | `<label className="flex items-center gap-2.5"><Checkbox defaultChecked /> Résumé hebdomadaire</label>`                                                       |
| `radio-group` | `<RadioGroup aria-labelledby="role" defaultValue="member"><RadioGroupItem value="admin" />…</RadioGroup>`                                                    |
| `tabs`        | `<Tabs defaultValue="apercu"><TabsList><TabsTab value="apercu">Aperçu</TabsTab></TabsList><TabsPanel value="apercu">…</TabsPanel></Tabs>`                    |
| `tooltip`     | `<TooltipProvider>` autour de l'app, puis `<Tooltip><TooltipTrigger aria-label="Copier">…</TooltipTrigger><TooltipContent>Copier</TooltipContent></Tooltip>` |
| `popover`     | `<Popover><PopoverTrigger>Aide</PopoverTrigger><PopoverContent><PopoverTitle>…</PopoverTitle></PopoverContent></Popover>`                                    |

## Règles de la DA

- Chrome monochrome, un seul accent violet : focus, lien, un geste principal par écran. « Vous êtes ici » (barre, onglets) reste en teinte.
- Profondeur par la teinte : cartes `surface` sans ombre ni contour, ombre réservée à ce qui flotte, aucun flou.
- Au survol, seule la couleur change. Le rebond est réservé à l'appui. La palette de commandes s'ouvre sans animation.
- Un statut s'écrit toujours (point et libellé), jamais par la couleur seule. Chiffres en `tabular-nums`.
- Graphiques : `--chart-1` à `--chart-6` dans cet ordre, validées pour le daltonisme dans les deux thèmes ; au-delà de six séries, regrouper en « Autres ».
- Référence de l'interface : Host. Couleur d'un client : `--brand-accent`.

Mode d'emploi complet : [Adopter le kit](https://github.com/hugogebel-boop/hgdc-kit/blob/main/docs/guides/adopter-le-kit.md#7-interface). Décisions : [ADR 0005](https://github.com/hugogebel-boop/hgdc-kit/blob/main/docs/adr/0005-ui-css-brute-et-sous-chemins.md), [ADR 0006](https://github.com/hugogebel-boop/hgdc-kit/blob/main/docs/adr/0006-ui-composants-des-consoles.md).

Tous droits réservés, Hugo Gebel Développement Conseil.
