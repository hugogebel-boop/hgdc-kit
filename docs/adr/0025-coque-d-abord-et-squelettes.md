---
owner: Hugo Gebel
last_reviewed: 2026-11-11
status: accepted
---

# 0025. La coque d'abord, le contenu à sa place : barre de progression et squelettes

Remplace en partie l'ADR 0015 (le H n'est plus le chargement d'une page dans la coque) et l'ADR 0012 sur le rythme du chargement. Le H unique de l'ADR 0015 (même pixel, même phase, horloge commune) et le passage entre modules de l'ADR 0020 restent valables.

## Contexte

Audit du 2026-11-11, en production, avec la session de Hugo :

| Constat                                           | Mesure                                                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deux chargeurs à la suite pour une page           | Projet → Déploiements : ancienne page, H pendant 300 ms, 20 lignes de squelette, contenu, en 950 ms                                                               |
| Le H couvre tout pour une navigation courte       | H montré après 50 ms, au moins 300 ms : une navigation de 100 ms le fait clignoter sur toute la zone de contenu                                                   |
| La coque attend les données dans certains modules | Surveillance : le HTML du serveur ne porte que le H, la barre latérale arrive avec l'organisation                                                                 |
| Sept façons de charger                            | Déploiements : `loader` + `useSuspenseQuery`, contenu dès le serveur. Surveillance, E-mails : `useQuery` dans les composants, sans `loader`. Les autres mélangent |

Ce que disent les docs officielles :

- TanStack Router : `pendingMs` 1000 ms et `pendingMinMs` 500 ms par défaut ; `defaultPreloadStaleTime: 0` quand TanStack Query tient le cache ; les `loader` partent en parallèle, les `beforeLoad` en série ([Data Loading](https://tanstack.com/router/latest/docs/guide/data-loading)).
- Convex avec TanStack Start : précharger dans le `loader` (`queryClient.ensureQueryData` ou `queryClient.query`), lire avec `useSuspenseQuery(convexQuery(...))` ; le rendu serveur porte les données et le client reprend l'abonnement sans second chargement ([docs.convex.dev](https://docs.convex.dev/client/tanstack/tanstack-start/)).
- React : pendant une transition, l'écran déjà affiché reste, un indicateur signale l'attente ([useTransition](https://react.dev/reference/react/useTransition)).
- Nielsen : sous une seconde, le fil de pensée tient sans indicateur ; au-delà, il en faut un ([Response Times](https://www.nngroup.com/articles/response-times-3-important-limits/)).

## Décision

Une règle : **la coque s'affiche tout de suite, le contenu se charge à sa place, une seule zone de chargement à la fois.**

| Situation                                                           | Ce qu'on voit                                                                           |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Document sans coque (page d'entrée, rendu serveur hors de la coque) | Le H du document, dans le cadre de la coque (ADR 0015, 0020)                            |
| Départ vers un autre module                                         | Le H sur la zone de contenu, la coque en place (ADR 0020)                               |
| Navigation dans le module, moins de 150 ms                          | Rien : la page s'ouvre                                                                  |
| Navigation dans le module, au-delà de 150 ms                        | L'ancienne page reste ; une barre de 2 px court sous la barre du haut (au moins 300 ms) |
| Navigation dont la page attend encore après 1 s                     | Le squelette de la page la remplace (au moins 500 ms)                                   |
| Page qui suspend dans la coque (`Suspense`)                         | Son squelette                                                                           |
| Bloc secondaire d'une page (graphique, liste annexe)                | Son propre squelette, à sa place (`Pending`, `Skeleton`)                                |

Le kit :

- `routerPendingDefaults` : `defaultPendingMs` 1000, `defaultPendingMinMs` 500 (les défauts de TanStack Router).
- `PagePending` : dans la coque, `PageSkeleton` ; hors de la coque, la place de la page et le H du document. `variant` (`list` par défaut, `dashboard`, `form`) donne sa forme. Une route qui n'est pas une liste la passe : `pendingComponent: () => <PagePending variant="dashboard" />`.
- `PageSkeleton` reprend la mise en page de `Page` : en-tête de même hauteur, même colonne.
- `AppShell` : `navigating` allume la barre de progression (`data-navigating`) au lieu du calque ; le calque et le H (`data-loading`) ne servent plus qu'au départ vers un autre module. La zone de contenu n'est plus `inert` pendant une navigation.
- Le CSS ne montre plus le H pour une page qui attend dans une coque pas encore hydratée : le squelette est déjà dans le HTML du serveur.

Les modules :

1. La route de mise en page (`/o/$org`) charge dans son `loader` ce que la coque affiche (l'organisation, la liste des organisations) et rend `AppShell` sans attendre les données des pages. Jamais de `return <Spinner />` avant la coque.
2. Chaque page charge ses données principales dans son `loader` (`context.queryClient.ensureQueryData(convexQuery(...))`) et les lit avec `useSuspenseQuery`. Le rendu serveur porte le contenu.
3. Les données secondaires restent en `useQuery` avec un squelette à leur place.
4. Le modèle est celui de Déploiements (`host/src/routes/_app/o/$team.tsx`).

## Conséquences

- Une navigation courte ne montre plus rien, une navigation moyenne garde l'ancienne page lisible, une longue montre la forme de la nouvelle. Plus de H puis squelette pour la même page.
- Retrait d'API publiques sans utilisateur dans les produits : `ContentLoadingContext` (remplacé par `ShellContentContext`), `useContentLoading` (remplacé par `useShellCover`), `ContentLoadingStage`.
- Un module qui garde des `useQuery` sans `loader` fonctionne comme avant, mais ne profite ni du rendu serveur ni du préchargement au survol : chaque module passe au modèle des `loader` (journal ci-dessous).

## Journal

- 2026-11-11 : kit (cette ADR). Modules ensuite, un par un.
- 2026-11-11 : le H du document devient la lueur du bord (`EdgeGlow`), mêmes situations ; `FamilyLoader` en ligne garde le H.
