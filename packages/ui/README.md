# @hgdc/ui

Interface de la H Collection : jetons de la DA, thèmes clair et sombre, polices, composants de base et coque des consoles, pour une application React 19 + Tailwind v4.

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
| `@hgdc/ui/theme-switch`    | `ThemeSwitch` : Système, Clair, Sombre en trois icônes ; déjà dans `AccountMenu`, à poser seul ailleurs                       |
| `@hgdc/ui/cn`              | `cn()` (clsx + tailwind-merge)                                                                                                |
| `@hgdc/ui/use-media-query` | `useMediaQuery`, `useIsMobile`                                                                                                |
| `@hgdc/ui/floating`        | Classes des surfaces flottantes                                                                                               |

Sur écran tactile (pointeur grossier), les cibles font 44 px (variante `coarse:`, classes `touch-target` et `touch-field`) et les champs 16 px, pour qu'iOS ne zoome pas à la saisie ; `ResourceItem` et la barre du haut d'`AppShell` passent à la ligne sur un écran étroit ou à texte agrandi.

Avatars à initiales : `<AvatarFallback colorKey={user.email}>HG</AvatarFallback>` prend une des sept teintes des icônes des produits (`--avatar-1` à `--avatar-7`), stable pour une même adresse, initiales à 4,5:1 au moins en clair et en sombre ; la photo (`AvatarImage`) reste prioritaire.

Primitives déjà là : `avatar` `badge` `button` `dialog` `drawer` `dropdown-menu` `empty` `field` `input` `input-otp` `label` `segmented-control` `select` `separator` `sonner` `spinner` `switch` `textarea`.

## Coque des consoles

| Import             | Exemple                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-shell`        | `<AppShell product="mail" organization={<OrgSwitcher …/>} nav={<SidebarNav label="Projet">…</SidebarNav>} links={{ documentation: "/docs", settings: { render: <Link to="/settings" /> } }} account={<AccountMenu …/>} onSearch={() => setOpen(true)} assistant={{ open, onOpenChange: setOpen, panel: <Conversation /> }}>` : Documentation, Réglages et État du service (la page de statut par défaut) juste au-dessus du compte ; bouton Assistant à côté de la recherche, panneau dans une colonne à droite (la page se rétrécit, vue dédiée sous 1280 px, Échap ferme, `shortcut: "j"` facultatif). `sidebarFooter` est déprécié |
|                    | `<SidebarNavItem icon={Rocket01Icon} label="Déploiements" render={<Link to="/deployments" />} />`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
|                    | Navigation imbriquée (l'espace d'une page, d'un projet) : `<SidebarNavBack label="Retour aux pages" render={<Link to="/pages" />} />` en tête, puis `<SidebarNavGroup label="Réglages">…</SidebarNavGroup>` (titre muet, trait en rail)                                                                                                                                                                                                                                                                                                                                                                                               |
| `org-switcher`     | `<OrgSwitcher organizations={orgs} activeId={org.id} onSelect={go} createHref="/organisations/nouvelle" />`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `project-switcher` | `<ProjectSwitcher projects={projects} activeId={project?.id} activeName={params.project} allHref="/o/acme" createHref="/o/acme/new" renderLink={(href) => <Link to={href} />} />` : projet actif ou « Tous les projets », marque du projet (`ProjectMark`), « Nouveau projet »                                                                                                                                                                                                                                                                                                                                                        |
| `account-menu`     | `<AccountMenu user={user} onProfile={…} onSecurity={…} onSignOut={signOut} product="Mail" />` : Account et les produits ouverts du catalogue, Mail coché. Dans l'ordre : identité, Profil, Sécurité, Thème (Système, Clair, Sombre, `ThemeSwitch`), entrées du produit, Se déconnecter. Ni « État du service » ni raccourcis : la coque pose le premier au-dessus du compte, l'aide garde sa touche `?`                                                                                                                                                                                                                               |
| `command-menu`     | `<CommandMenu groups={[{ label: "Aller à", items }, { label: "Créer", items }, { label: "Changer", items }]} />` (`Ctrl+K`), `<CommandMenuButton compact="mobile" …/>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `products`         | `HGDC_PRODUCTS` (mot, nom, sous-domaine, phrase, pastille `badge`, icône, état, `entryHref`), `HGDC_ACCOUNT`, `productMenuEntries({ current: "Mail" })` : chaque produit du menu pointe vers son entrée `/auth/hgdc` (ADR 0010)                                                                                                                                                                                                                                                                                                                                                                                                       |
| `service-status`   | Bandeau d'incident ou de maintenance posé par `AppShell` en tête du contenu (ADR 0018) : `useServiceStatus(pageUrl)`, `ServiceStatusBanner`. `statusPage={false}` pour ne rien lire                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `kbd`              | `<KbdGroup><Kbd>Ctrl</Kbd><Kbd>K</Kbd></KbdGroup>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `page-header`      | `<PageHeader title="Domaines" breadcrumbs={[{ label: "Acme", render: <Link to="/o/acme" /> }, { label: "Domaines" }]} actions={<Button>Ajouter</Button>} />`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `page-header`      | `<Page title="Réglages">…</Page>` (colonne de lecture de 768 px), `<Page title="Projets" wide actions={…}>…</Page>` (tableaux, listes, tableaux de bord)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `member-item`      | `<ResourceList><MemberItem name={m.name} email={m.email} orgRole={m.role} isMe={m.isMe} /></ResourceList>` : avatar à initiales, « (toi) », `RoleBadge`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `initials`         | `initials("Test vérif")` donne « TV » : la même règle pour une personne et une organisation (`OrgMark`, `AccountMenu`, `MemberItem`) ; `avatarTone(email)` donne la teinte stable (1 à 7) de l'avatar                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Le menu « Produits » et la palette (`badge` d'une commande) montrent la pastille de chaque produit.

### Mise en page (ADR 0012)

Une seule règle dans les sept produits, posée par la coque :

- **Barre du haut** : sur téléphone, menu puis marque du produit (pastille et mot), toujours. Puis le contexte du produit (`header`, à gauche : sélecteur de projet). La recherche passe par `onSearch` : toujours à droite, 384 px sur ordinateur, la loupe seule sous `lg`. Ne pas poser `CommandMenuButton` dans `header`.
- **Contenu** : la même boîte partout (`max-w-6xl`, marges `px-4`, `sm:px-6`, `lg:px-10`), donc le titre au même endroit. Pas de `mainClassName` (déprécié).
- **Largeur d'une page** : `Page`, alignée à gauche. Par défaut une colonne de lecture de 768 px (formulaires, réglages, fiches, membres) ; `wide` pour les tableaux, listes à colonnes, tableaux de bord et grilles de cartes.
- **États vides** : `<Empty variant="card">` pour une page vide, icône monochrome (`EmptyMedia variant="icon"`), sans teinte de couleur.
- **Rôles et initiales** : `RoleBadge` (neutre), `MemberItem`, `initials`. Jamais une fonction d'initiales ou un badge de rôle dans un produit.

## Identité H Collection

| Import                                  | Rôle                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product-badge`                         | `<ProductBadge product="host" className="size-8" />` (carré blanc arrondi, la même forme partout), `<FamilyMark />` (le H « Double », clair et sombre selon le thème), `PRODUCT_GRADIENT`                                                                                                                                                                        |
| `@hgdc/ui/family/<mot>.svg`             | Pictogrammes des produits (`account`, `host`, `mail`, `portal`, `status`, `analytics`, `docs`), originaux du site ; `family/tile/<mot>.svg` (carré blanc arrondi) ; `family/app/<mot>/` : favicon.svg, favicon.ico, apple-touch-icon.png, icon-192/512.png, icon-maskable-512.png, posés dans `public/` au build par `hgdc-brand sync <mot>` (jamais versionnés) |
| `@hgdc/ui/family/hcollection-icon*.svg` | Le H « Double », marque de la H Collection, sur fond clair (`hcollection-icon.svg`) ou sombre (`-dark`), jamais recoloré                                                                                                                                                                                                                                         |
| `styles.css`                            | `--product-<mot>-from` / `--product-<mot>-to` (dégradé de chaque icône sur fond clair), `--glow-blue`, `--glow-violet`, `--glow-pink`, `--glow-orange`                                                                                                                                                                                                           |

Couleurs pleines ; pour éclaircir, mélanger au blanc `color-mix(in oklab, …)`, jamais `in oklch`. Une icône de produit se pose toujours sur son fond blanc, en clair comme en sombre, sans bordure ni ombre : carré arrondi 22 % partout, pictogramme à 12 % de marge (barre, menu, « Propulsé par », e-mails, icône d'app), plein cadre pour apple-touch et maskable. Le favicon est sans fond et suit le thème du système (ADR 0017). Le H reste sans fond. Les originaux vivent dans le dépôt du site hgdc.ch : les recopier dans `packages/ui/family/`, puis `bun scripts/family.ts && bun run format` (SVG embarqués, PNG des e-mails, icônes d'application). Geste complet : `docs/runbooks/changer-une-icone.md`.

**`hgdc-brand`** (bin de ce paquet) pose les icônes du kit au build, rien n'est recopié à la main :

- produit : `"build": "hgdc-brand sync mail && vite build"` (et en tête de `dev`), les six fichiers de `family/app/<mot>/` dans `public/`, listés dans le `.gitignore` ; `--email-as <fichier>` y ajoute l'icône d'e-mail du produit sous un ancien nom ;
- site hgdc.ch : `hgdc-brand emails public/email`, les `<mot>.png` servis à `EMAIL_ICON_BASE`.

Sur ordinateur, la coque ouvre sur la barre des produits (ADR 0011) : organisation en haut, pastilles des produits ouverts, Account en bas, chacun par son entrée `/auth/hgdc?next=/`, le produit courant en teinte. Au survol (150 ms d'intention) ou au focus clavier, elle s'élargit par-dessus la page et écrit les noms. `productRail={false}` la coupe ; `accountHref` pointe vers un Account local. La barre latérale porte la marque du produit et se réduit en rail (`Ctrl+B`, mémorisé) : poser `sidebarInitScript` dans le `<head>`. En rail, la pastille du produit devient le bouton « Déplier » au survol. Le kit ne connaît ni routeur ni authentification : liens par `render={<Link />}`, actions par callbacks. Rôles d'organisation : `owner`, `admin`, `member` (Propriétaire, Admin, Membre).

## Contenu et données

| Import           | Exemple                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `card`           | `<Card><CardHeader><CardTitle>Domaines</CardTitle><CardAction>…</CardAction></CardHeader><CardContent>…</CardContent><CardFooter>…</CardFooter></Card>`                                                                                                                                                                                                                                                                                                 |
| `alert`          | `<Alert tone="warning" title="Quota presque atteint" action={<Button size="sm">Voir</Button>}>90 % utilisés.</Alert>`                                                                                                                                                                                                                                                                                                                                   |
| `table`          | `<TableHead sort="descending" onSort={…}>Date</TableHead>`, `<TableRowLink render={<Link … />}>Production</TableRowLink>`, `<TableEmpty colSpan={4}>…</TableEmpty>`, `<TableSkeleton columns={4} />`                                                                                                                                                                                                                                                    |
| `resource-list`  | `<ResourceList><ResourceItem icon={…} title="Site vitrine" meta="acme.ch" badge={…} actions={…} href="/p/site" /></ResourceList>`                                                                                                                                                                                                                                                                                                                       |
| `stat`           | `<StatGrid><StatTile label="Erreurs" value="12" delta={{ value: "8 %", direction: "up", good: "down" }} /></StatGrid>`                                                                                                                                                                                                                                                                                                                                  |
| `time-chart`     | `<TimeChart label="Envois par jour" timestamps={days} series={[{ key: "sent", label: "Envoyés", values }]} kind="bar" lastIncomplete />` (dernier point en pointillés : la journée n'est pas finie)                                                                                                                                                                                                                                                     |
| `status`         | `<StatusBadge status="degraded" />` (Opérationnel, Dégradé, Panne, Maintenance, Inconnu) ; hors services, `<StatusBadge tone="success" label="Remis" />` (`neutral`, `success`, `warning`, `danger`, `info`, `pending`)                                                                                                                                                                                                                                 |
| `uptime-bar`     | `<UptimeBar days={[{ date, status: "operational", uptime: "100 %", detail: { levels, incidents } }]} summary="99,95 % sur 90 jours" />`                                                                                                                                                                                                                                                                                                                 |
| `timeline`       | `<Timeline entries={[{ id, title: "Résolu", time, status: "operational" }]} />`                                                                                                                                                                                                                                                                                                                                                                         |
| `relative-time`  | `<RelativeTime date={deployment._creationTime} />` (« il y a 3 min », date exacte au survol)                                                                                                                                                                                                                                                                                                                                                            |
| `copy-button`    | `<Snippet value="bun add @hgdc/ui" prompt />`, `<CopyButton value={url} />`, `<CopyButton value={all} label="Tout copier" showLabel />`                                                                                                                                                                                                                                                                                                                 |
| `progress`       | `<Progress label="Envoi de la campagne" value={120} max={400} />` (`value={null}` : durée inconnue), `<Meter label="E-mails ce mois" value={8600} max={10000} />` (orange puis rouge près de la limite)                                                                                                                                                                                                                                                 |
| `rank-bar`       | `<RankBar label="Pages les plus vues" items={[{ key, label: "/tarifs", value: 640, render: <Link … /> }]} limit={5} />`                                                                                                                                                                                                                                                                                                                                 |
| `secret-reveal`  | `<SecretReveal label="Clé d'API" value={key} onDismiss={forget} />` : affichée une fois, puis retirée de la page                                                                                                                                                                                                                                                                                                                                        |
| `assistant-chat` | `<AssistantConversation><AssistantUserMessage>…</AssistantUserMessage><AssistantReply tools={chips} waiting={pending} actions={<AssistantActionCard title=… status="pending" onConfirm={…} onCancel={…} />}><Markdown>{text}</Markdown></AssistantReply></AssistantConversation>`, `<AssistantComposer value={v} onValueChange={setV} onSubmit={send} busy={busy} />`, `<AssistantExamples examples={…} onPick={setV} />` : le produit rend le Markdown |
| `assistant-view` | `<AssistantView status={status} threads={threads} threadId={id} onThreadChange={setId} thread={thread} renderText={(t) => <Markdown>{t}</Markdown>} onSend={send} onConfirm={confirm} onCancel={cancel} />` : le panneau complet pour `AppShell` (`assistant.panel`), aux formes de `@hgdc/assistant/convex` ; `subject` (page ouverte), `request` (demande venue de la page), `labels` (vouvoiement)                                                   |
| `family-loader`  | `<FamilyLoaderRoot>{children}</FamilyLoaderRoot>` une fois dans le `body` de la route racine : le seul H d'un chargement de page, fixe sur la zone de contenu de la coque, rendu par le serveur, calé sur l'horloge (même pixel et même phase d'une page et d'un produit à l'autre, ADR 0015). `<FamilyLoader size="lg" />` : le H en ligne (une boucle de 2 s, `transform` et `opacity`). Dans un bouton : `Spinner`                                   |
| `page-pending`   | `createRouter({ routeTree, ...routerPendingDefaults })` (préchargement au survol, chargement après 50 ms, au moins 300 ms) ; `AppShell {...useRouterState({ select: shellNavigation, structuralSharing: true })}` : la zone de contenu se couvre dès qu'une navigation attend, la coque reste ; `PagePending` : marque la place d'une page qui attend, le H du document s'affiche                                                                       |
| `skeleton`       | `<Pending pending={isLoading} fallback={<TableSkeleton columns={3} />}>…</Pending>` : après 200 ms, tenu 400 ms au moins                                                                                                                                                                                                                                                                                                                                |

## Listes, journaux et retours

| Import               | Exemple                                                                                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filter-bar`         | `<FilterBar search={{ value: q, onChange }} filters={[{ key: "status", label: "Statut", options }]} values={{ status }} onFilterChange={…} onReset={…} />`                                                                                          |
|                      | `variant="panel"` : un bouton « Filtres » (compteur des filtres posés) ouvre un panneau, bulle sur ordinateur et feuille du bas sur téléphone ; `onResetFilters` garde la recherche, `leading` pose une vue (`SegmentedControl`) avant la recherche |
| `data-table`         | `<DataTable label="Déploiements" rows={rows} columns={columns} rowKey={(d) => d.id} sort={sort} onSortChange={…} filters={<FilterBar …/>} loadMore={…} />`                                                                                          |
| `cursor-pages`       | `const pages = useCursorPages(JSON.stringify(filters))` : pile de curseurs, 200 lignes par page (`PAGE_SIZE`), retour à la page 1 quand la clé change, `pages.paginationOpts` pour `paginate` de Convex                                             |
| `cursor-pager`       | `<CursorPager pages={pages} result={result} scrollTarget={topRef} />` : Précédent, Suivant, « Lignes 201 à 400 », chargement sans saut ; règle des grandes listes dans le guide                                                                     |
| `board`              | `<Board label="Tableau du projet" columns={[{ id, label, title, cards }]} cardKey={(c) => c.id} cardLabel={(c) => c.title} renderCard={(c, { handle }) => …} onMove={…} />` : poignée souris, doigt, clavier                                        |
| `dns-record-table`   | `<DnsRecordTable records={[{ type: "MX", name: "send", value, priority: 10, status: "pending" }]} />` (Vérifié, En attente, Échec, À ajouter)                                                                                                       |
| `log-viewer`         | `<LogViewer lines={[{ id, time, level: "error", message }]} live />` : niveaux, recherche, « Suivre », copie ; seules les lignes visibles sont rendues                                                                                              |
| `sparkline`          | `<Sparkline label="Envois sur 7 jours" values={[3, 8, 5]} color={2} />`                                                                                                                                                                             |
| `middle-truncate`    | `<MiddleTruncate text={deployment.url} />` : « …/routes/index.tsx », texte entier dans la page                                                                                                                                                      |
| `error-card`         | `<ErrorCard title="Impossible de charger les journaux" detail={message} reference={requestId} onRetry={refetch} />`                                                                                                                                 |
| `destructive-dialog` | `<DestructiveDialog open={open} onOpenChange={setOpen} title="Supprimer le domaine" question="…" name="acme.ch" onConfirm={remove} />`                                                                                                              |
| `sonner`             | `<Toaster />` une fois, puis `toastUndo("Domaine retiré", { onUndo: restore })` ; `errorMessage(error)` pour un toast d'erreur                                                                                                                      |

Filtres, tri et page vivent dans l'URL du produit : les composants sont contrôlés et ne connaissent pas le routeur.

## Formulaires et réglages

| Import              | Exemple                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `settings-section`  | `<SettingsSection title="Nom de l'espace" description="…" dirty={changed} saving={saving} onSave={save}>…</SettingsSection>` : un Enregistrer par bloc |
| `date-range-picker` | `<DateRangePicker value={{ from: "2026-10-01", to: "2026-10-15" }} onChange={(range, preset) => …} />` : raccourcis et période libre                   |
| `date-time-field`   | `<DateTimeField value={sendAt} onChange={setSendAt} min={Date.now()} />` : millisecondes, heure du navigateur                                          |
| `color-field`       | `<ColorField value="#7c3aed" onChange={…} />` : pastille, code hexadécimal, contraste avec le texte blanc et son verdict                               |
| `money-field`       | `<MoneyField value={centimes} onChange={…} />` : CHF en centimes, « 1’250.50 », accepte « 12.– » ; `formatChf`, `parseMoney`                           |
| `address-fields`    | `<AddressFields value={address} onChange={…} errors={validatePostalAddress(address)} />` : rue, numéro, NPA, localité, pays (facture QR)               |

`access-request` : `<AccessRequest endpoint="https://<deploiement>.convex.site/f/<id>" product="Mail" signInRender={<Link to="/sign-in" />} />`, la page « Demander un accès » d'un produit (les comptes HGDC s'ouvrent sur invitation). Poste en JSON vers un formulaire HGDC Mail Forms : prénom, nom, entreprise, e-mail professionnel, message facultatif, `produit` caché, piège `_gotcha`. États envoi, réussite, erreur, champ refusé ; `submitAccessRequest` s'appelle seul.

Les champs de date sont ceux du navigateur, sans calendrier maison (ADR 0006). Les fonctions pures (`parseMoney`, `contrastRatio`, `validatePostalAddress`, `formatDateRange`) s'importent seules, côté serveur aussi.

## Contrôles et surfaces flottantes

| Import        | Exemple                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `checkbox`    | `<label className="flex items-center gap-2.5"><Checkbox defaultChecked /> Résumé hebdomadaire</label>`                                                       |
| `radio-group` | `<RadioGroup aria-labelledby="role" defaultValue="member"><RadioGroupItem value="admin" />…</RadioGroup>`                                                    |
| `tabs`        | `<Tabs defaultValue="apercu"><TabsList><TabsTab value="apercu">Aperçu</TabsTab></TabsList><TabsPanel value="apercu">…</TabsPanel></Tabs>`                    |
| `tooltip`     | `<TooltipProvider>` autour de l'app, puis `<Tooltip><TooltipTrigger aria-label="Copier">…</TooltipTrigger><TooltipContent>Copier</TooltipContent></Tooltip>` |
| `popover`     | `<Popover><PopoverTrigger>Aide</PopoverTrigger><PopoverContent><PopoverTitle>…</PopoverTitle></PopoverContent></Popover>`                                    |

## E-mails

`@hgdc/ui/email` : le modèle commun des e-mails transactionnels, rendu par React Email (`bun add --exact react-email@6.11.1`, version de la stack). Rendu côté serveur, dans une action Convex `"use node"`.

```tsx
import { EmailButton, EmailHeading, EmailLayout, EmailText, renderEmail } from "@hgdc/ui/email"

const { html, text } = await renderEmail(
  <EmailLayout product="Portal" preview="Claire t'invite à rejoindre Atelier Dupont.">
    <EmailHeading>Claire t'invite dans Atelier Dupont</EmailHeading>
    <EmailText>Tu pourras suivre le projet, signer et payer au même endroit.</EmailText>
    <EmailButton href={url}>Voir l'invitation</EmailButton>
  </EmailLayout>,
)
```

| Bloc           | Rôle                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmailLayout`  | Icône et nom du produit, carte, pied « Envoyé avec Mail de la H Collection » et mentions légales ; `footer` (désabonnement), `name`, `iconSrc`, `accent` |
| `EmailHeading` | Titre                                                                                                                                                    |
| `EmailText`    | Paragraphe ; `small` pour une note secondaire                                                                                                            |
| `EmailButton`  | Lien direct, jamais réécrit ; absolu (`https:`, `mailto:`) ou erreur                                                                                     |
| `EmailLink`    | Lien dans le texte                                                                                                                                       |
| `EmailCode`    | Code à usage unique, en deux groupes à l'œil, d'un bloc au copier                                                                                        |
| `EmailCallout` | Encadré `neutral`, `info`, `success`, `warning`, `danger`, avec titre                                                                                    |
| `EmailDivider` | Séparateur                                                                                                                                               |
| `EmailDetails` | Liste clé / valeur                                                                                                                                       |
| `renderEmail`  | `{ html, text }` : HTML pour clients mail, texte tiré du même rendu                                                                                      |

L'accent vient du catalogue (`accent` de `@hgdc/ui/products`), les icônes de `emailIconUrl(mot)` (aussi dans `@hgdc/ui/email-icon`, sans React Email, pour un HTML assemblé à la main) : `https://hgdc.ch/email/<mot>.png?v=<empreinte>` (fichiers dans `@hgdc/ui/email-icons/`, tirés des pastilles par `bun scripts/family.ts` ; l'empreinte `EMAIL_ICON_VERSION` change avec l'image et fait recharger les clients mail qui l'ont en cache). Un exemple par type : `scripts/email-showcase.tsx`.

## Règles de la DA

- Chrome monochrome, un seul accent violet : focus, lien, un geste principal par écran. « Vous êtes ici » (barre, onglets) reste en teinte.
- Profondeur par la teinte : cartes `surface` sans ombre ni contour, ombre réservée à ce qui flotte, aucun flou.
- Au survol, seule la couleur change. Le rebond est réservé à l'appui. La palette de commandes s'ouvre sans animation.
- Un statut s'écrit toujours (point et libellé), jamais par la couleur seule. Chiffres en `tabular-nums`.
- Graphiques : `--chart-1` à `--chart-6` dans cet ordre, validées pour le daltonisme dans les deux thèmes ; au-delà de six séries, regrouper en « Autres ».
- Référence de l'interface : Host. Couleur d'un client : `--brand-accent`.

Mode d'emploi complet : [Adopter le kit](https://github.com/hugogebel-boop/hgdc-kit/blob/main/docs/guides/adopter-le-kit.md#7-interface). Décisions : [ADR 0005](https://github.com/hugogebel-boop/hgdc-kit/blob/main/docs/adr/0005-ui-css-brute-et-sous-chemins.md), [ADR 0006](https://github.com/hugogebel-boop/hgdc-kit/blob/main/docs/adr/0006-ui-composants-des-consoles.md), [ADR 0007](https://github.com/hugogebel-boop/hgdc-kit/blob/main/docs/adr/0007-ui-modele-des-e-mails.md).

Tous droits réservés, Hugo Gebel Développement Conseil.
