# @hgdc/auth

## 0.3.0

### Minor Changes

- 3f52deb: `organizationsFromIdToken` lit les organisations d'un id_token de HGDC Account et `planOrganizationSync` calcule ce qu'un produit doit écrire pour garder sa copie à jour à chaque connexion.

## 0.2.0

### Minor Changes

- b0ff781: Premier contenu de `@hgdc/auth` : bouton « Se connecter avec HGDC » (`@hgdc/auth/react`), fournisseur `hgdc` pour `genericOAuth` et proxy `/api/auth` vers Convex (`@hgdc/auth/server`), gardes Convex `requireIdentity` et `requireOrgMember` (`@hgdc/auth/convex`), rôles et validation du profil OIDC.

## 0.1.1

### Patch Changes

- 492a6be: Liens vers la documentation et le signalement de faille sur la page npm de chaque paquet. Première version publiée par la CI, avec provenance.
