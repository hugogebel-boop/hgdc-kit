import {
  defineSchema,
  defineTable,
  type DataModelFromSchemaDefinition,
  type GenericDatabaseWriter,
  type TableDefinition,
} from "convex/server"
import { v, type Validator, type VFloat64, type VObject, type VString } from "convex/values"
import { z } from "zod"

import {
  ACCOUNT_EVENT_FUTURE_TOLERANCE_MS,
  ACCOUNT_EVENT_HEADERS,
  ACCOUNT_EVENT_MAX_BYTES,
  ACCOUNT_EVENT_SECRET_MIN_LENGTH,
  ACCOUNT_EVENT_TOLERANCE_SECONDS,
  assertAudience,
  assertSecret,
  readBodyText,
  type AccountEventAudience,
} from "./events.ts"

/*
 * Le cœur de Basalte vu d'un module : projets et personnalisation, dont ID est le seul propriétaire.
 * Chaque module en garde une copie locale, tenue à jour par des événements signés et rattrapée par
 * une relecture périodique : il répond vite, et continue si le cœur tombe.
 *
 * Un événement porte l'état complet du projet, pas un changement : l'appliquer deux fois ou dans le
 * désordre donne le même résultat (`syncedAt` écarte le plus ancien, une ligne retirée reste marquée
 * le temps que les essais en retard passent). Route à part de celle des événements d'organisation : un
 * produit qui ne connaît pas encore le cœur n'a rien à refuser.
 * Signature : HMAC par produit, avec le même secret que `@hgdc/auth/events`. La chaîne signée commence
 * par `core.` : une requête captée sur une route ne vaut rien sur l'autre.
 *
 * Montée de version : un module ignore un mot de module ou un champ qu'il ne connaît pas, pour qu'ID
 * puisse en ajouter un sans figer les organisations d'un module resté sur l'ancien kit.
 */

/** Chemin de l'endpoint de chaque module, sur son déploiement Convex. */
export const CORE_EVENTS_PATH = "/hgdc/v1/core-events"

/** Les modules d'un projet, par mot technique. */
export const CORE_MODULES = ["host", "mail", "status", "analytics", "id", "docs", "iassistant"] as const
export type CoreModule = (typeof CORE_MODULES)[number]

/** `hosted` : servi par Déploiements. `external` : hébergé ailleurs, donc sans Déploiements. */
export const CORE_PROJECT_KINDS = ["hosted", "external"] as const
export type CoreProjectKind = (typeof CORE_PROJECT_KINDS)[number]

/**
 * Durée de la trace d'un projet retiré : plus que les essais d'un événement (81 minutes) et que
 * l'écart entre deux relectures. À purger par le cron du module (`purgeCoreTombstones`).
 */
export const CORE_TOMBSTONE_RETENTION_MS: number = 7 * 24 * 60 * 60 * 1000

/** Au-delà, un état du cœur daté du futur figerait la copie : il est refusé. */
const SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024

const id = z.string().min(1).max(64)

/** Ni caractère de contrôle ni caractère de mise en forme (retour à la ligne, inversion du sens de lecture). */
const hasNoControl = (value: string) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)
export const coreNameSchema: z.ZodType<string> = z.string().trim().min(1).max(100).refine(hasNoControl)

/**
 * Adresse d'un logo : https publique sous sa forme normale. Ni identifiants, ni port, ni fragment,
 * ni adresse IP, ni nom local : un administrateur d'organisation la choisit, et elle s'affiche chez
 * les visiteurs et dans les e-mails. Toute lecture côté serveur passe en plus par un relais protégé
 * (le DNS peut changer après ce contrôle).
 */
export function coreLogoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.href !== value || url.protocol !== "https:" || url.username || url.password || url.port || url.hash)
    return null
  const host = url.hostname
  if (!host.includes(".") || host.endsWith(".") || host.startsWith("[") || /^[\d.]+$/.test(host) || /^0x/i.test(host))
    return null
  if (/\.(?:local|localhost|internal|intranet|lan|home|corp|ts\.net)$/i.test(host)) return null
  return value
}

export type CoreProject = {
  id: string
  /** Segment d'adresse, unique dans l'organisation. */
  slug: string
  name: string
  kind: CoreProjectKind
  modules: Array<CoreModule>
}

const isCoreModule = (word: string): word is CoreModule => (CORE_MODULES as ReadonlyArray<string>).includes(word)

export const coreProjectSchema: z.ZodType<CoreProject> = z.object({
  id,
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/),
  name: coreNameSchema,
  kind: z.enum(CORE_PROJECT_KINDS),
  modules: z
    .array(z.string().max(32))
    .max(32)
    .transform((words) => words.filter(isCoreModule)),
})

export type CoreBranding = {
  displayName?: string | undefined
  logoUrl?: string | undefined
  /** Couleur d'accent : `#rrggbb`. */
  color?: string | undefined
}

export const coreBrandingSchema: z.ZodType<CoreBranding> = z.object({
  displayName: coreNameSchema.optional(),
  logoUrl: z
    .string()
    .refine((value) => coreLogoUrl(value) !== null)
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/)
    .optional(),
})

type EventBase = { id: string; occurredAt: number; organizationId: string }

export type CoreEvent =
  | (EventBase & { type: "project.changed"; project: CoreProject })
  /** Projet supprimé, ou module retiré de ce projet : ce module n'a plus à le connaître. */
  | (EventBase & { type: "project.removed"; projectId: string })
  | (EventBase & { type: "branding.changed"; branding: CoreBranding })

const base = {
  id: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  occurredAt: z.number().int().positive(),
  organizationId: id,
}

export const coreEventSchema: z.ZodType<CoreEvent> = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("project.changed"), project: coreProjectSchema }),
  z.object({ ...base, type: z.literal("project.removed"), projectId: id }),
  z.object({ ...base, type: z.literal("branding.changed"), branding: coreBrandingSchema }),
])

const vModules = v.array(v.union(...CORE_MODULES.map((word) => v.literal(word)))) as Validator<
  Array<CoreModule>,
  "required",
  string
>
const vKind = v.union(...CORE_PROJECT_KINDS.map((kind) => v.literal(kind))) as Validator<
  CoreProjectKind,
  "required",
  string
>
const vProject = v.object({ id: v.string(), slug: v.string(), name: v.string(), kind: vKind, modules: vModules })
const vBranding = v.object({
  displayName: v.optional(v.string()),
  logoUrl: v.optional(v.string()),
  color: v.optional(v.string()),
})

/** Validateur Convex d'un `CoreEvent` : argument de la mutation interne qui l'applique. */
export const vCoreEvent: Validator<CoreEvent, "required", string> = v.union(
  v.object({
    id: v.string(),
    type: v.literal("project.changed"),
    occurredAt: v.number(),
    organizationId: v.string(),
    project: vProject,
  }),
  v.object({
    id: v.string(),
    type: v.literal("project.removed"),
    occurredAt: v.number(),
    organizationId: v.string(),
    projectId: v.string(),
  }),
  v.object({
    id: v.string(),
    type: v.literal("branding.changed"),
    occurredAt: v.number(),
    organizationId: v.string(),
    branding: vBranding,
  }),
) as Validator<CoreEvent, "required", string>

type OptionalString = VString<string | undefined, "optional">

type CoreProjectsTable = TableDefinition<
  VObject<
    {
      organizationId: string
      projectId: string
      slug: string
      name: string
      kind: CoreProjectKind
      modules: Array<CoreModule>
      syncedAt: number
      removedAt?: number
    },
    {
      organizationId: VString
      projectId: VString
      slug: VString
      name: VString
      kind: Validator<CoreProjectKind, "required", string>
      modules: Validator<Array<CoreModule>, "required", string>
      syncedAt: VFloat64
      removedAt: VFloat64<number | undefined, "optional">
    }
  >,
  {
    by_organization: ["organizationId", "removedAt", "_creationTime"]
    by_project: ["projectId", "_creationTime"]
    by_removed: ["removedAt", "_creationTime"]
  }
>

type CoreBrandingsTable = TableDefinition<
  VObject<
    { organizationId: string; displayName?: string; logoUrl?: string; color?: string; syncedAt: number },
    {
      organizationId: VString
      displayName: OptionalString
      logoUrl: OptionalString
      color: OptionalString
      syncedAt: VFloat64
    }
  >,
  { by_organization: ["organizationId", "_creationTime"] }
>

/** Tables de la copie locale, à déployer dans le schéma du module : `...coreTables`. */
export const coreTables: { coreProjects: CoreProjectsTable; coreBrandings: CoreBrandingsTable } = {
  coreProjects: defineTable({
    organizationId: v.string(),
    projectId: v.string(),
    slug: v.string(),
    name: v.string(),
    kind: vKind,
    modules: vModules,
    /** Instant du cœur de la dernière version recopiée : un événement plus ancien est ignoré. */
    syncedAt: v.number(),
    /** Présent : projet retiré. La ligne reste pour écarter un événement en retard, puis se purge. */
    removedAt: v.optional(v.number()),
  })
    // `removedAt` dans l'index : les traces de projets retirés ne prennent jamais la place d'un projet en ligne.
    .index("by_organization", ["organizationId", "removedAt"])
    .index("by_project", ["projectId"])
    .index("by_removed", ["removedAt"]),
  coreBrandings: defineTable({
    organizationId: v.string(),
    displayName: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    color: v.optional(v.string()),
    syncedAt: v.number(),
  }).index("by_organization", ["organizationId"]),
}

const coreSchema = defineSchema(coreTables)
type CoreDataModel = DataModelFromSchemaDefinition<typeof coreSchema>
type CoreDb = GenericDatabaseWriter<CoreDataModel>

export type CoreOutcome = "applied" | "stale"

// Le kit ne connaît pas le schéma du module : seules ses tables `coreTables` sont touchées.
const coreDb = (ctx: { db: unknown }) => ctx.db as CoreDb

const projectRow = (db: CoreDb, projectId: string) =>
  db
    .query("coreProjects")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .first()

const brandingRow = (db: CoreDb, organizationId: string) =>
  db
    .query("coreBrandings")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .first()

async function writeBranding(db: CoreDb, organizationId: string, branding: CoreBranding, syncedAt: number) {
  const row = await brandingRow(db, organizationId)
  if (row && row.syncedAt > syncedAt) return "stale" as const
  const value = { organizationId, ...branding, syncedAt }
  if (row) await db.replace(row._id, value)
  else await db.insert("coreBrandings", value)
  return "applied" as const
}

async function writeProject(db: CoreDb, organizationId: string, project: CoreProject, syncedAt: number) {
  const row = await projectRow(db, project.id)
  if (row && row.syncedAt > syncedAt) return "stale" as const
  // Un identifiant de projet n'appartient qu'à une organisation, sauf trace d'un projet déjà retiré.
  if (row && row.organizationId !== organizationId && row.removedAt === undefined)
    throw new Error("Projet du cœur rattaché à une autre organisation.")
  const { id: projectId, ...fields } = project
  const value = { organizationId, projectId, ...fields, syncedAt }
  if (row) await db.replace(row._id, value)
  else await db.insert("coreProjects", value)
  return "applied" as const
}

/**
 * Applique un événement à la copie locale, dans la mutation du module (qui écarte d'abord un `id`
 * déjà traité par `accountEventsTable`). Un événement plus ancien que la copie est ignoré ; à égalité,
 * le dernier arrivé gagne, et la prochaine relecture tranche.
 */
export async function applyCoreEvent(ctx: { db: unknown }, event: CoreEvent): Promise<CoreOutcome> {
  const db = coreDb(ctx)
  const { occurredAt: syncedAt, organizationId } = event
  if (event.type === "branding.changed") return await writeBranding(db, organizationId, event.branding, syncedAt)
  if (event.type === "project.changed") return await writeProject(db, organizationId, event.project, syncedAt)
  const row = await projectRow(db, event.projectId)
  if (row && row.syncedAt > syncedAt) return "stale"
  if (row && row.organizationId !== organizationId) throw new Error("Projet du cœur rattaché à une autre organisation.")
  // Sans ligne, un `project.changed` en retard ferait revenir le projet : on laisse une trace.
  if (row) await db.patch(row._id, { removedAt: syncedAt, syncedAt })
  else
    await db.insert("coreProjects", {
      organizationId,
      projectId: event.projectId,
      slug: "",
      name: "",
      kind: "external",
      modules: [],
      syncedAt,
      removedAt: syncedAt,
    })
  return "applied"
}

/** Les projets de la copie locale d'une organisation, triés par nom, traces écartées. */
export async function listCoreProjects(ctx: { db: unknown }, organizationId: string): Promise<Array<CoreProject>> {
  const rows = await coreDb(ctx)
    .query("coreProjects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId).eq("removedAt", undefined))
    .take(1000)
  return rows
    .map(({ projectId, slug, name, kind, modules }) => ({ id: projectId, slug, name, kind, modules }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
}

/** La personnalisation de la copie locale : `null` si l'organisation n'en a pas. */
export async function readCoreBranding(ctx: { db: unknown }, organizationId: string): Promise<CoreBranding | null> {
  const row = await brandingRow(coreDb(ctx), organizationId)
  if (!row) return null
  const { displayName, logoUrl, color } = row
  return { displayName, logoUrl, color }
}

/** Efface la copie d'une organisation supprimée : à appeler sur `organization.deleted`. Ses traces partent avec la purge. */
export async function purgeCoreCopy(ctx: { db: unknown }, organizationId: string): Promise<void> {
  const db = coreDb(ctx)
  const rows = await db
    .query("coreProjects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId).eq("removedAt", undefined))
    .take(1000)
  for (const row of rows) await db.delete(row._id)
  const branding = await brandingRow(db, organizationId)
  if (branding) await db.delete(branding._id)
}

/** Efface les traces de projets retirés devenues inutiles, par lots : à appeler par un cron du module. */
export async function purgeCoreTombstones(ctx: { db: unknown }, now: number = Date.now()): Promise<number> {
  const db = coreDb(ctx)
  const rows = await db
    .query("coreProjects")
    .withIndex("by_removed", (q) => q.gt("removedAt", 0).lt("removedAt", now - CORE_TOMBSTONE_RETENTION_MS))
    .take(500)
  for (const row of rows) await db.delete(row._id)
  return rows.length
}

const encoder = new TextEncoder()

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ])
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

const corePayload = (audience: string, eventId: string, timestamp: string, body: string) =>
  `core.${audience}.${eventId}.${timestamp}.${body}`

/** Côté cœur : corps et en-têtes d'un envoi à `audience`. À rappeler à chaque essai, avec le même `id`. */
export async function signCoreEvent(
  event: CoreEvent,
  options: { secret: string; now: number; audience: AccountEventAudience },
): Promise<{ body: string; headers: Record<string, string> }> {
  assertSecret(options.secret)
  assertAudience(options.audience)
  const parsed = coreEventSchema.parse(event)
  const body = JSON.stringify(parsed)
  const timestamp = String(Math.floor(options.now / 1000))
  return {
    body,
    headers: {
      "content-type": "application/json",
      [ACCOUNT_EVENT_HEADERS.id]: parsed.id,
      [ACCOUNT_EVENT_HEADERS.timestamp]: timestamp,
      [ACCOUNT_EVENT_HEADERS.audience]: options.audience,
      [ACCOUNT_EVENT_HEADERS.signature]: `core=${await hmacHex(options.secret, corePayload(options.audience, parsed.id, timestamp, body))}`,
    },
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

/**
 * Endpoint complet d'un module. `apply` est une mutation interne qui, dans la même transaction,
 * écarte un `id` déjà traité, l'enregistre et appelle `applyCoreEvent` ; son issue est rendue au cœur.
 * Sans secret : 503, le cœur réessaie. Une erreur de `apply` remonte (500) : le cœur réessaie.
 */
export async function handleCoreEventRequest(
  request: Request,
  options: {
    audience: AccountEventAudience
    secret: string | undefined
    apply: (event: CoreEvent) => Promise<CoreOutcome | "duplicate">
    now?: number
  },
): Promise<Response> {
  const { secret, audience } = options
  if (typeof secret !== "string" || secret.length < ACCOUNT_EVENT_SECRET_MIN_LENGTH)
    return json(503, { error: "not_configured" })
  const now = options.now ?? Date.now()
  const read = await readBodyText(request, ACCOUNT_EVENT_MAX_BYTES)
  if (!read.ok) return json(413, { error: "too_large" })

  const eventId = request.headers.get(ACCOUNT_EVENT_HEADERS.id) ?? ""
  const timestamp = request.headers.get(ACCOUNT_EVENT_HEADERS.timestamp) ?? ""
  const signature = request.headers.get(ACCOUNT_EVENT_HEADERS.signature) ?? ""
  const unauthorized = json(401, { error: "unauthorized" })
  if (request.headers.get(ACCOUNT_EVENT_HEADERS.audience) !== audience) return unauthorized
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(eventId) || !/^\d{1,12}$/.test(timestamp)) return unauthorized
  if (Math.abs(now / 1000 - Number(timestamp)) > ACCOUNT_EVENT_TOLERANCE_SECONDS) return unauthorized
  const expected = `core=${await hmacHex(secret, corePayload(audience, eventId, timestamp, read.text))}`
  if (!constantTimeEqual(signature, expected)) return unauthorized

  let body: unknown
  try {
    body = JSON.parse(read.text)
  } catch {
    return json(400, { error: "invalid_body" })
  }
  const parsed = coreEventSchema.safeParse(body)
  if (!parsed.success || parsed.data.id !== eventId) return json(400, { error: "invalid_body" })
  if (parsed.data.occurredAt > now + ACCOUNT_EVENT_FUTURE_TOLERANCE_MS) return json(400, { error: "invalid_body" })
  return json(200, { status: await options.apply(parsed.data) })
}

/** Routes des modules vers le cœur, sur `actions.account`. */
export const coreSnapshotPath = (organizationId: string): string =>
  `/products/v1/organizations/${encodeURIComponent(organizationId)}/core`
export const coreProjectsPath = (organizationId: string): string =>
  `/products/v1/organizations/${encodeURIComponent(organizationId)}/projects`

/** Route de Déploiements, sur `actions.host` : domaines de production vérifiés d'un projet du cœur. */
export const coreProjectDomainsPath = (organizationId: string, projectId: string): string =>
  `/hgdc/v1/organizations/${encodeURIComponent(organizationId)}/projects/${encodeURIComponent(projectId)}/domains`

export type CoreSnapshot = { readAt: number; projects: Array<CoreProject>; branding: CoreBranding }

/** Ce que le cœur rend à un module : ses seuls projets activés, et la personnalisation de l'organisation. */
export const coreSnapshotSchema: z.ZodType<CoreSnapshot> = z.object({
  readAt: z.number().int().positive(),
  projects: z.array(coreProjectSchema).max(500),
  branding: coreBrandingSchema,
})

/**
 * En-têtes d'un appel signé vers l'API des produits d'ID (signature `v2`, ADR 0012 d'Account). `secret` :
 * celui de l'API des produits (`SIGNUP_ALLOWLIST_SECRET_<PRODUIT>` chez ID), pas celui des événements.
 */
export async function signCoreCall(options: {
  product: AccountEventAudience
  secret: string
  method: "GET" | "POST"
  path: string
  body: string
  now?: number
}): Promise<Record<string, string>> {
  assertSecret(options.secret)
  assertAudience(options.product)
  const timestamp = String(Math.floor((options.now ?? Date.now()) / 1000))
  const nonce = crypto.randomUUID().replaceAll("-", "")
  const route = `${options.method} ${options.path}`
  const mac = await hmacHex(options.secret, `v2.${options.product}.${timestamp}.${nonce}.${route}.${options.body}`)
  return {
    "x-hgdc-product": options.product,
    "x-hgdc-timestamp": timestamp,
    "x-hgdc-nonce": nonce,
    "x-hgdc-signature": `v2=${mac}`,
  }
}

/**
 * Vérifie un appel signé par `signCoreCall` reçu par un module (ADR 0019, chemin d'un module à un autre) :
 * produit connu de `secrets`, horodatage dans la fenêtre, route et corps signés. `null` : refus, sans
 * dire pourquoi. Le nonce revient à l'appelant : à réserver dès qu'une route écrit.
 */
export async function verifyCoreCall(
  headers: Headers,
  options: {
    method: "GET" | "POST"
    path: string
    body: string
    secrets: Partial<Record<AccountEventAudience, string | undefined>>
    now?: number
  },
): Promise<{ product: AccountEventAudience; nonce: string } | null> {
  const product = headers.get("x-hgdc-product") ?? ""
  const timestamp = headers.get("x-hgdc-timestamp") ?? ""
  const nonce = headers.get("x-hgdc-nonce") ?? ""
  const signature = headers.get("x-hgdc-signature") ?? ""
  if (!Object.hasOwn(options.secrets, product)) return null
  const secret = options.secrets[product as AccountEventAudience]
  if (typeof secret !== "string" || secret.length < ACCOUNT_EVENT_SECRET_MIN_LENGTH) return null
  if (!/^\d{1,12}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return null
  const now = options.now ?? Date.now()
  if (Math.abs(now / 1000 - Number(timestamp)) > ACCOUNT_EVENT_TOLERANCE_SECONDS) return null
  const route = `${options.method} ${options.path}`
  const expected = `v2=${await hmacHex(secret, `v2.${product}.${timestamp}.${nonce}.${route}.${options.body}`)}`
  if (!constantTimeEqual(signature, expected)) return null
  return { product: product as AccountEventAudience, nonce }
}

/**
 * Lit l'état du cœur pour une organisation. Lève une erreur à message fixe, sans rien de la réponse :
 * la copie locale reste telle quelle, et l'appelant la signale.
 */
export async function fetchCoreSnapshot(options: {
  baseUrl: string
  product: AccountEventAudience
  secret: string
  organizationId: string
  fetcher?: typeof fetch
  now?: number
}): Promise<CoreSnapshot> {
  const path = coreSnapshotPath(options.organizationId)
  const headers = await signCoreCall({ ...options, method: "GET", path, body: "" })
  const response = await (options.fetcher ?? fetch)(`${options.baseUrl}${path}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Cœur de Basalte : lecture refusée (${response.status}).`)
  const read = await readBodyText(response, SNAPSHOT_MAX_BYTES)
  if (!read.ok) throw new Error("Cœur de Basalte : réponse trop grande.")
  let body: unknown
  try {
    body = JSON.parse(read.text)
  } catch {
    throw new Error("Cœur de Basalte : réponse illisible.")
  }
  const parsed = coreSnapshotSchema.safeParse(body)
  if (!parsed.success) throw new Error("Cœur de Basalte : réponse invalide.")
  if (parsed.data.readAt > (options.now ?? Date.now()) + ACCOUNT_EVENT_FUTURE_TOLERANCE_MS)
    throw new Error("Cœur de Basalte : réponse datée du futur.")
  return parsed.data
}

/**
 * Un tour de relecture pour toutes les organisations d'un module, depuis son action de cron. L'échec d'une
 * organisation laisse sa copie telle quelle. S'arrête après `maxFailuresInARow` échecs de suite (le cœur est
 * injoignable ou le plafond atteint) ou à `deadline`, pour que le bilan parte toujours : le tour suivant reprend.
 */
export async function runCoreRound(options: {
  product: AccountEventAudience
  secret: string
  baseUrl: string
  nextPage: (cursor: string | null) => Promise<{ organizationIds: Array<string>; cursor: string | null }>
  write: (organizationId: string, snapshot: CoreSnapshot) => Promise<void>
  deadline?: number
  maxFailuresInARow?: number
  fetcher?: typeof fetch
}): Promise<{ failures: number; lastFailure: string | null; stopped: boolean }> {
  const deadline = options.deadline ?? Date.now() + 8 * 60_000
  const maxFailures = options.maxFailuresInARow ?? 5
  let failures = 0
  let inARow = 0
  let lastFailure: string | null = null
  let cursor: string | null = null
  const mustStop = () => inARow >= maxFailures || Date.now() > deadline
  do {
    const page: { organizationIds: Array<string>; cursor: string | null } = await options.nextPage(cursor)
    for (const organizationId of page.organizationIds) {
      if (mustStop()) break
      try {
        const snapshot = await fetchCoreSnapshot({
          baseUrl: options.baseUrl,
          product: options.product,
          secret: options.secret,
          organizationId,
          ...(options.fetcher ? { fetcher: options.fetcher } : {}),
        })
        await options.write(organizationId, snapshot)
        inARow = 0
      } catch (error) {
        failures += 1
        inARow += 1
        lastFailure = error instanceof Error ? error.message : "échec inconnu"
      }
    }
    cursor = page.cursor
  } while (cursor !== null && !mustStop())
  return { failures, lastFailure, stopped: mustStop() }
}

/**
 * Rattrape un événement perdu : la copie locale de l'organisation devient l'état lu. Une ligne plus
 * récente que la lecture (événement arrivé entre-temps, retrait compris) reste telle quelle.
 */
export async function reconcileCoreCopy(
  ctx: { db: unknown },
  organizationId: string,
  snapshot: CoreSnapshot,
): Promise<void> {
  const db = coreDb(ctx)
  const { readAt: syncedAt } = snapshot
  const rows = await db
    .query("coreProjects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId).eq("removedAt", undefined))
    .take(1000)
  const wanted = new Set(snapshot.projects.map((project) => project.id))
  for (const row of rows)
    if (!wanted.has(row.projectId) && row.syncedAt <= syncedAt)
      await db.patch(row._id, { removedAt: syncedAt, syncedAt })
  for (const project of snapshot.projects) await writeProject(db, organizationId, project, syncedAt)
  await writeBranding(db, organizationId, snapshot.branding, syncedAt)
}
