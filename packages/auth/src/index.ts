import { z } from "zod"

/** Identifiant du fournisseur dans `genericOAuth` et dans la table `account` des produits. */
export const HGDC_PROVIDER_ID = "hgdc"

/** Émetteur OIDC de HGDC Account (`iss` des jetons, base de la découverte). */
export const HGDC_ISSUER = "https://account.hgdc.ch/api/auth"

/** Portée qui ajoute les organisations de la personne et son rôle dans chacune. */
export const ORGANIZATIONS_SCOPE = "organizations"

/** Portées demandées par défaut : identité, adresse vérifiée, renouvellement et organisations. */
export const HGDC_SCOPES: readonly string[] = ["openid", "profile", "email", "offline_access", ORGANIZATIONS_SCOPE]

/** Rôles d'organisation, du plus faible au plus fort. */
export const ORG_ROLES = ["member", "admin", "owner"] as const
export type OrgRole = (typeof ORG_ROLES)[number]

function isOrgRole(value: string): value is OrgRole {
  return (ORG_ROLES as readonly string[]).includes(value)
}

/**
 * Rôle le plus fort d'un champ `role` de better-auth. Le plugin `organization` accepte
 * plusieurs rôles séparés par des virgules (« admin,member ») ; un rôle inconnu ne
 * donne aucun droit. `null` quand aucun rôle connu.
 */
export function highestRole(role: string): OrgRole | null {
  let best: OrgRole | null = null
  for (const part of role.split(",")) {
    const name = part.trim()
    if (isOrgRole(name) && (best === null || ORG_ROLES.indexOf(name) > ORG_ROLES.indexOf(best))) best = name
  }
  return best
}

/** Vrai si `role` atteint au moins `minimum`. */
export function hasRole(role: string, minimum: OrgRole): boolean {
  const best = highestRole(role)
  return best !== null && ORG_ROLES.indexOf(best) >= ORG_ROLES.indexOf(minimum)
}

const organizationClaim = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(ORG_ROLES),
})

const profileClaims = z.object({
  sub: z.string().min(1),
  email: z.email(),
  // Une adresse non vérifiée ne doit jamais créer ni relier un compte (liaison par e-mail).
  email_verified: z.literal(true),
  name: z.string().min(1),
  picture: z.url().nullish(),
  organizations: z.array(organizationClaim).optional(),
})

export type HgdcOrganization = {
  id: string
  slug: string
  name: string
  role: OrgRole
}

/** Profil d'une personne tel que HGDC Account le donne (id_token ou userinfo). */
export type HgdcProfile = {
  sub: string
  email: string
  email_verified: true
  name: string
  picture?: string | null | undefined
  /** Présent seulement si la portée `organizations` a été accordée. */
  organizations?: HgdcOrganization[] | undefined
}

/**
 * Valide les claims reçus de HGDC Account. Lève une erreur si un champ attendu manque ou si
 * l'adresse n'est pas vérifiée : un tel profil ne doit jamais ouvrir de session.
 */
export function parseHgdcProfile(claims: unknown): HgdcProfile {
  const result = profileClaims.safeParse(claims)
  if (!result.success) throw new Error(`Profil HGDC invalide : ${z.prettifyError(result.error)}`)
  return result.data
}
