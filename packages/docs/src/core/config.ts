import { z } from "zod"

/**
 * `docs.json` : configuration d'un site HGDC Docs, à la racine du dépôt du client.
 *
 * Sous-ensemble du `docs.json` de Mintlify (name, colors, logo, favicon, navigation en
 * onglets, groupes et versions) pour qu'une doc Mintlify se reprenne sans réécriture,
 * plus trois champs HGDC : `project`, `assistant` et `language`. Les champs Mintlify que
 * nous ne gérons pas sont acceptés et ignorés, jamais refusés.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
/** Chemin de page relatif au dossier de la doc, sans extension : `guides/publier`. */
const PAGE = /^(?!\/)(?!.*\.\.)[a-z0-9][a-z0-9/_-]*$/i
/** Identifiant d'un projet de la console (id Convex). */
const PROJECT_ID_PATTERN = /^[a-z0-9]{8,64}$/

const hex = z.string().regex(HEX, "couleur attendue au format #rrggbb")
/** Sous-chemin du site (`/docs`) : un ou plusieurs segments, sans « / » final. */
const BASE = /^(?:\/[a-z0-9][a-z0-9_-]*)+$/i

export type NavPageRef = string
export type NavGroupInput = { group: string; pages: Array<NavPageRef | NavGroupInput>; expanded?: boolean }

const pageRef = z.string().regex(PAGE, "chemin de page attendu, sans extension ni « / » initial (ex. guides/publier)")

const navGroup: z.ZodType<NavGroupInput> = z.lazy(() =>
  z.object({
    group: z.string().min(1),
    pages: z.array(z.union([pageRef, navGroup])).min(1, "un groupe contient au moins une page"),
    expanded: z.boolean().optional(),
  }),
)

const groupsOrPages = {
  groups: z.array(navGroup).optional(),
  pages: z.array(z.union([pageRef, navGroup])).optional(),
}

const navTab = z.object({ tab: z.string().min(1), ...groupsOrPages })
const navVersion = z.object({
  version: z.string().min(1).max(32),
  default: z.boolean().optional(),
  tabs: z.array(navTab).optional(),
  ...groupsOrPages,
})

const navigation = z.object({
  versions: z.array(navVersion).optional(),
  tabs: z.array(navTab).optional(),
  ...groupsOrPages,
})

const logo = z.union([
  z.string(),
  z.object({ light: z.string(), dark: z.string().optional(), href: z.string().optional() }),
])

/**
 * Réseaux du pied de page : clé de `footer.socials` (celles de Mintlify), libellé, icône de
 * Starlight. Lu par le build et par le formulaire des réglages de la console.
 */
export const SOCIAL_NETWORKS = {
  linkedin: { label: "LinkedIn", icon: "linkedin" },
  github: { label: "GitHub", icon: "github" },
  gitlab: { label: "GitLab", icon: "gitlab" },
  x: { label: "X", icon: "x.com" },
  youtube: { label: "YouTube", icon: "youtube" },
  instagram: { label: "Instagram", icon: "instagram" },
  facebook: { label: "Facebook", icon: "facebook" },
  discord: { label: "Discord", icon: "discord" },
  mastodon: { label: "Mastodon", icon: "mastodon" },
  bluesky: { label: "Bluesky", icon: "blueSky" },
  website: { label: "Site web", icon: "external" },
} as const

/** Ancienne écriture acceptée : `x.com` (Starlight) et `twitter` désignent X. */
const SOCIAL_ALIASES: Record<string, keyof typeof SOCIAL_NETWORKS> = { "x.com": "x", twitter: "x" }

export function socialNetwork(key: string): (typeof SOCIAL_NETWORKS)[keyof typeof SOCIAL_NETWORKS] | null {
  const name = (SOCIAL_ALIASES[key] ?? key) as keyof typeof SOCIAL_NETWORKS
  return SOCIAL_NETWORKS[name] ?? null
}

/**
 * Lien du pied de page : un chemin du site (« /guides/publier », préfixé par `base`), une
 * adresse https:// ou mailto:. `icon` : image du site (« /images/x.svg ») affichée devant.
 */
const footerLink = z.object({
  label: z.string().min(1).max(60),
  href: z
    .string()
    .min(1)
    .refine(
      (value) => /^\/(?!\/)/.test(value) || /^https:\/\/[^\s]+$/.test(value) || /^mailto:[^\s@]+@[^\s@]+$/.test(value),
      "lien attendu : un chemin du site (« /… »), une adresse https:// ou mailto:",
    ),
  icon: z
    .string()
    .regex(/^\/(?!\/)[\w./-]+$/, "image attendue : un chemin du site (ex. /images/logo.svg)")
    .optional(),
})

const REDIRECT_SOURCE = /^\/(?!\/)[A-Za-z0-9._~\-/%]*$/

/** Ancienne adresse vers la nouvelle (champ `redirects` de Mintlify), sans motif. */
const redirect = z.object({
  source: z.string().regex(REDIRECT_SOURCE, "adresse source attendue, commençant par « / » (ex. /guides/ancien)"),
  destination: z
    .string()
    .min(1)
    .refine(
      (value) => /^\/(?!\/)/.test(value) || value.startsWith("https://"),
      "destination attendue : un chemin du site (« /… ») ou une adresse https://",
    ),
  permanent: z.boolean().optional(),
})

export const docsConfigSchema = z.object({
  $schema: z.string().optional(),
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  /** Identifiant du projet dans la console : relie la publication à l'assistant et à l'index. */
  project: z
    .string()
    .regex(PROJECT_ID_PATTERN, "identifiant de projet attendu, copié depuis la console docs.hgdc.ch")
    .optional(),
  language: z.enum(["fr", "en", "de", "it"]).default("fr"),
  /**
   * Sous-chemin où la doc est servie, quand un produit la publie derrière un proxy
   * (`https://app.exemple.ch/docs`). Liens, médias, recherche, `llms.txt` et pages `.md`
   * le portent ; le site est écrit dans `dist/<base>/`.
   */
  base: z.string().regex(BASE, "sous-chemin attendu, sans « / » final (ex. /docs)").optional(),
  colors: z.object({ primary: hex, light: hex.optional(), dark: hex.optional() }).optional(),
  logo: logo.optional(),
  favicon: z.string().optional(),
  navigation,
  navbar: z
    .object({
      links: z
        .array(z.object({ label: z.string(), href: z.url() }))
        .max(5)
        .optional(),
      primary: z.object({ label: z.string(), href: z.url() }).optional(),
    })
    .optional(),
  /**
   * Application que la doc accompagne (champ HGDC) : bouton « Ouvrir <name> » dans l'en-tête
   * et en tête du menu de téléphone. Sans lui, la lectrice n'a aucun chemin vers le produit.
   */
  app: z
    .object({
      href: z.url({ protocol: /^https$/, error: "adresse attendue, en https://" }),
      /** Libellé du bouton ; « Ouvrir <name> » par défaut. */
      label: z.string().min(1).max(40).optional(),
    })
    .optional(),
  footer: z
    .object({
      socials: z.record(z.string(), z.url()).optional(),
      /** Colonnes de liens (champ `footer.links` de Mintlify), plus une `icon` facultative par lien. */
      links: z
        .array(
          z.object({
            header: z.string().min(1).max(40).optional(),
            items: z.array(footerLink).min(1, "une colonne contient au moins un lien").max(12),
          }),
        )
        .max(6, "6 colonnes au plus")
        .optional(),
      /** Titulaire affiché après « © <année> » au bas du pied (champ HGDC) ; `name` par défaut. */
      copyright: z.string().min(1).max(80).optional(),
    })
    .optional(),
  redirects: z.array(redirect).max(500, "500 redirections au plus").optional(),
  assistant: z
    .object({
      enabled: z.boolean().default(true),
      /** Adresse de l'API de l'assistant ; par défaut celle de HGDC Docs. */
      endpoint: z.url().optional(),
    })
    .optional(),
})

export type DocsConfigInput = z.input<typeof docsConfigSchema>
export type DocsConfig = z.output<typeof docsConfigSchema>

export type ConfigResult = { ok: true; config: DocsConfig } | { ok: false; errors: Array<string> }

/** Lit et valide un `docs.json`. Les erreurs disent où corriger, en français. */
export function parseDocsConfig(raw: string): ConfigResult {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (error) {
    return { ok: false, errors: [`docs.json n'est pas un JSON valide : ${(error as Error).message}`] }
  }
  const parsed = docsConfigSchema.safeParse(json)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`),
    }
  }
  const structural = checkNavigation(parsed.data)
  return structural.length ? { ok: false, errors: structural } : { ok: true, config: parsed.data }
}

/**
 * Projet annoncé par HGDC Host au build (`HGDC_DOCS_PROJECT`, doc activée en un clic) : il
 * remplit `project` quand docs.json n'en a pas, et doit concorder quand les deux existent.
 */
export function withHostProject(config: DocsConfig, fromHost: string | undefined): ConfigResult {
  const project = fromHost?.trim()
  if (!project) return { ok: true, config }
  if (!PROJECT_ID_PATTERN.test(project))
    return { ok: false, errors: [`HGDC_DOCS_PROJECT : identifiant de projet invalide (${project.slice(0, 64)})`] }
  if (config.project && config.project !== project)
    return {
      ok: false,
      errors: [
        `project : docs.json porte ${config.project}, HGDC Host annonce ${project}. Retire « project » de docs.json ou recopie celui de la console.`,
      ],
    }
  return { ok: true, config: { ...config, project } }
}

function checkNavigation(config: DocsConfig): Array<string> {
  const errors: Array<string> = []
  const nav = config.navigation
  const shapes = [nav.versions, nav.tabs, nav.groups, nav.pages].filter(Boolean).length
  if (shapes !== 1) errors.push("navigation : utiliser une seule forme parmi versions, tabs, groups ou pages")
  const versions = nav.versions ?? []
  if (versions.filter((v) => v.default).length > 1) errors.push("navigation.versions : une seule version par défaut")
  const ids = versions.map((v) => slugifySegment(v.version))
  if (new Set(ids).size !== ids.length) errors.push("navigation.versions : deux versions ont le même nom")
  return errors
}

/** Segment d'URL stable à partir d'un libellé (« Version 2.x » → « version-2-x »). */
export function slugifySegment(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
