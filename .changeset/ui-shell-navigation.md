---
"@hgdc/ui": patch
---

`shellNavigation` (`@hgdc/ui/page-pending`) : les props `navigating` et `contentKey` d'`AppShell` tirées de l'état de TanStack Router (`useRouterState({ select: shellNavigation })`), sans la recopier dans chaque produit.
