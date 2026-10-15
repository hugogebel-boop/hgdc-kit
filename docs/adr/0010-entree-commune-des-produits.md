---
owner: Hugo Gebel
last_reviewed: 2026-10-16
status: accepted
---

# 0010. Entrée commune des produits : `/auth/hgdc`

## Contexte

Le menu « Produits » de l'avatar (`AccountMenu`) pointait vers la racine de chaque produit. Sans session dans ce produit, cette racine est la page d'accueil publique (Host, Mail) ou la page de connexion (Portal, Status, Analytics, Docs). Il fallait donc recliquer « Se connecter avec HGDC » alors que la session d'Account était ouverte et que le produit ne demandait aucun formulaire. Chaque produit a sa propre page de connexion (`/sign-in`, `/connexion`, `/`) : le menu ne pouvait pas viser une page commune.

## Décision

- **Une route serveur au même chemin dans chaque produit** : `GET /auth/hgdc?next=<chemin>`, construite par `createHgdcEntry` (`@hgdc/auth/server`). Session du produit ouverte (`/api/auth/get-session`) : redirection vers `next`. Sinon le serveur appelle `/api/auth/sign-in/oauth2` à travers le proxy du produit, comme `HgdcSignInButton`, et renvoie un 302 vers l'autorisation d'Account avec le cookie d'état. Account, session ouverte et client sans consentement, renvoie aussitôt : aucun clic, aucune page intermédiaire.
- **Côté serveur plutôt qu'une page qui lance la connexion dans le navigateur** : pas de rendu React ni d'écran d'attente, la navigation n'est qu'une suite de redirections, et le produit n'a qu'un fichier à monter.
- **`next` filtré par `safeNextPath`** : seul un chemin du produit passe (`/`, pas `//`, pas de `\`, pas de caractère de contrôle, même origine après résolution), jamais `/auth/hgdc` ni `/api/auth` (boucle). Le reste devient `/`, que chaque produit redirige vers son app une fois la session ouverte. better-auth revérifie ensuite `callbackURL` contre ses `trustedOrigins`.
- **Pas de paramètre d'organisation** : les chemins d'organisation diffèrent d'un produit à l'autre. Un lien précis passe par `next` (`hgdcEntryUrl(origine, "/o/acme")`).
- `@hgdc/ui` ne dépend pas de `@hgdc/auth` : le chemin y est recopié (`PRODUCT_ENTRY_PATH`), et un test du kit vérifie qu'il est égal à `HGDC_ENTRY_PATH`. Account garde sa racine dans le menu.

## Conséquences

- Un produit doit monter la route avant d'adopter `@hgdc/ui` 0.8 : sinon le menu des autres produits mène à une 404 chez lui.
- La route démarre une connexion sur simple `GET`. Sans risque de connexion forcée : l'identité vient de la session Account de la personne elle-même, et le `state` OAuth est créé à chaque appel.
- Une personne sans accès au produit (Host sur invitation) arrive sur la page d'erreur du produit (`errorCallbackURL`), comme avec le bouton.
