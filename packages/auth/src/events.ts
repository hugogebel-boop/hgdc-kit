import { defineTable, type TableDefinition } from "convex/server"
import { v, type Validator, type VFloat64, type VObject, type VString } from "convex/values"
import { z } from "zod"

import { ORG_ROLES, type OrgRole } from "./index.ts"

/*
 * Événements d'organisation poussés par Account vers chaque produit (ADR 0014 du kit) : un retrait,
 * un changement de rôle ou une organisation supprimée s'appliquent tout de suite, sans attendre la
 * relecture des organisations à la connexion suivante.
 *
 * Signature HMAC-SHA256 par produit, Web Crypto seulement (Convex, Node, Bun, navigateurs) :
 * `v2=` hex de HMAC(secret, "v2.<audience>.<id>.<horodatage>.<corps brut>"). L'audience (le
 * produit destinataire) et l'identifiant de l'événement sont dans le MAC : un événement destiné à
 * un autre produit est refusé même si deux secrets venaient à se confondre, et rejouer une requête
 * captée dans la fenêtre de 5 minutes ne passe pas la table des événements déjà traités.
 * L'ancien format `v1=` (sans audience) n'est plus accepté à la réception ; Account peut encore
 * l'ajouter (`legacy`) le temps que tous les produits soient montés.
 */

/** Chemin de l'endpoint de chaque produit, sur son déploiement Convex (`https://<…>.convex.site`). */
export const ACCOUNT_EVENTS_PATH = "/hgdc/v1/account-events"

/** Produits destinataires : l'audience signée de chaque événement. */
export const ACCOUNT_EVENT_AUDIENCES: readonly ["host", "mail", "status", "portal", "analytics", "docs"] = [
  "host",
  "mail",
  "status",
  "portal",
  "analytics",
  "docs",
] as const
export type AccountEventAudience = (typeof ACCOUNT_EVENT_AUDIENCES)[number]

/** En-têtes de la requête signée. */
export const ACCOUNT_EVENT_HEADERS: {
  readonly id: "x-hgdc-event-id"
  readonly timestamp: "x-hgdc-timestamp"
  readonly audience: "x-hgdc-audience"
  readonly signature: "x-hgdc-signature"
  readonly signatureV2: "x-hgdc-signature-v2"
} = {
  id: "x-hgdc-event-id",
  timestamp: "x-hgdc-timestamp",
  audience: "x-hgdc-audience",
  signature: "x-hgdc-signature",
  signatureV2: "x-hgdc-signature-v2",
} as const

/** Écart toléré entre l'horodatage signé et l'horloge du produit, en secondes. */
export const ACCOUNT_EVENT_TOLERANCE_SECONDS = 300

/** Avance tolérée de `occurredAt` sur l'horloge du produit, en millisecondes : au-delà, refusé. */
export const ACCOUNT_EVENT_FUTURE_TOLERANCE_MS: number = ACCOUNT_EVENT_TOLERANCE_SECONDS * 1000

/** Taille maximale du corps, en octets. Un événement en pèse moins de 400. */
export const ACCOUNT_EVENT_MAX_BYTES: number = 8 * 1024

/** Longueur minimale du secret partagé (32 octets aléatoires en base64url : 43 caractères). */
export const ACCOUNT_EVENT_SECRET_MIN_LENGTH = 32

/**
 * Conservation des identifiants d'événements déjà traités chez le produit : 1 jour. Les nouveaux
 * essais d'Account s'étalent sur 81 minutes, et une requête de plus de 5 minutes est refusée.
 */
export const ACCOUNT_EVENT_RETENTION_MS: number = 24 * 60 * 60 * 1000

const id = z.string().min(1).max(64)

const base = {
  id: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  occurredAt: z.number().int().positive(),
  organizationId: id,
}

type EventBase = {
  /** Identifiant unique, le même à chaque nouvel essai : clé d'idempotence. */
  id: string
  /** Instant du changement dans Account, en millisecondes. */
  occurredAt: number
  /** Organisation d'Account (`id` du claim `organizations`). */
  organizationId: string
}

/** Événement d'organisation poussé par Account. Les personnes sont désignées par leur `sub` Account. */
export type AccountEvent =
  | (EventBase & {
      type: "member.removed"
      /** Personne retirée : son `sub` Account, l'`accountId` de son compte `hgdc` chez le produit. */
      userId: string
      /** Retrait par un admin, départ volontaire, ou compte supprimé par HGDC. */
      reason: "removed" | "left" | "user_deleted"
    })
  | (EventBase & {
      type: "member.role_changed"
      userId: string
      /** Nouveau rôle, déjà ramené au plus fort (`highestRole`). */
      role: OrgRole
    })
  | (EventBase & { type: "organization.deleted" })

export const accountEventSchema: z.ZodType<AccountEvent> = z.discriminatedUnion("type", [
  z.strictObject({
    ...base,
    type: z.literal("member.removed"),
    userId: id,
    reason: z.enum(["removed", "left", "user_deleted"]),
  }),
  z.strictObject({
    ...base,
    type: z.literal("member.role_changed"),
    userId: id,
    role: z.enum(ORG_ROLES),
  }),
  z.strictObject({
    ...base,
    type: z.literal("organization.deleted"),
  }),
])

export type AccountEventType = AccountEvent["type"]

/**
 * Pourquoi un produit n'a rien appliqué :
 * - `unknown_organization` : aucun espace pour cette organisation (le seul cas normal) ;
 * - `unknown_user` : personne sans compte `hgdc` chez le produit ;
 * - `not_member` : personne connue, sans appartenance à cet espace ;
 * - `stale` : appartenance confirmée par Account après l'événement (`accountEventIsStale`).
 */
export const ACCOUNT_EVENT_IGNORED_REASONS: readonly ["unknown_organization", "unknown_user", "not_member", "stale"] = [
  "unknown_organization",
  "unknown_user",
  "not_member",
  "stale",
] as const
export type AccountEventIgnoredReason = (typeof ACCOUNT_EVENT_IGNORED_REASONS)[number]

/** Ce que le produit a fait de l'événement : `applied`, `duplicate` ou `ignored:<raison>`. */
export type AccountEventOutcome = "applied" | "duplicate" | `ignored:${AccountEventIgnoredReason}`

/** Réponse 200 du produit. */
export type AccountEventResponse =
  | { status: "applied" | "duplicate" }
  | { status: "ignored"; reason: AccountEventIgnoredReason }

function isIgnoredReason(value: unknown): value is AccountEventIgnoredReason {
  return (ACCOUNT_EVENT_IGNORED_REASONS as readonly unknown[]).includes(value)
}

function responseOf(outcome: AccountEventOutcome): AccountEventResponse {
  if (outcome === "applied" || outcome === "duplicate") return { status: outcome }
  const reason = outcome.slice("ignored:".length)
  return { status: "ignored", reason: isIgnoredReason(reason) ? reason : "not_member" }
}

/** Côté Account : l'issue lue dans la réponse 200 d'un produit, ou `null` si illisible. */
export function accountEventOutcomeOf(body: unknown): AccountEventOutcome | null {
  if (typeof body !== "object" || body === null) return null
  const { status, reason } = body as { status?: unknown; reason?: unknown }
  if (status === "applied" || status === "duplicate") return status
  if (status === "ignored" && isIgnoredReason(reason)) return `ignored:${reason}`
  return null
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
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function assertSecret(secret: string | undefined | null): asserts secret is string {
  if (typeof secret !== "string" || secret.length < ACCOUNT_EVENT_SECRET_MIN_LENGTH)
    throw new Error(
      `Secret des événements Account absent ou trop court (${ACCOUNT_EVENT_SECRET_MIN_LENGTH} caractères au moins).`,
    )
}

function assertAudience(audience: unknown): asserts audience is AccountEventAudience {
  if (!(ACCOUNT_EVENT_AUDIENCES as readonly unknown[]).includes(audience))
    throw new Error("Audience d'événement Account inconnue.")
}

function signedPayloadV2(audience: AccountEventAudience, eventId: string, timestamp: string, body: string): string {
  return `v2.${audience}.${eventId}.${timestamp}.${body}`
}

/** Identifiant d'événement neuf (UUID sans tirets), à garder pour tous les essais. */
export function newAccountEventId(): string {
  return crypto.randomUUID().replaceAll("-", "")
}

/**
 * Côté Account : corps et en-têtes d'un envoi à `audience`. À rappeler à chaque essai (horodatage
 * neuf), avec le même événement (même `id`). `legacy` ajoute l'ancienne signature `v1=` (sans
 * audience) pour un produit pas encore monté : `v1=` dans `x-hgdc-signature`, `v2=` dans
 * `x-hgdc-signature-v2`. Sans `legacy`, `x-hgdc-signature` porte `v2=`.
 */
export async function signAccountEvent(
  event: AccountEvent,
  options: { secret: string; now: number; audience: AccountEventAudience; legacy?: boolean },
): Promise<{ body: string; headers: Record<string, string> }> {
  assertSecret(options.secret)
  assertAudience(options.audience)
  const parsed = accountEventSchema.parse(event)
  const body = JSON.stringify(parsed)
  const timestamp = String(Math.floor(options.now / 1000))
  const v2 = `v2=${await hmacHex(options.secret, signedPayloadV2(options.audience, parsed.id, timestamp, body))}`
  const headers: Record<string, string> = {
    "content-type": "application/json",
    [ACCOUNT_EVENT_HEADERS.id]: parsed.id,
    [ACCOUNT_EVENT_HEADERS.timestamp]: timestamp,
    [ACCOUNT_EVENT_HEADERS.audience]: options.audience,
  }
  if (options.legacy) {
    headers[ACCOUNT_EVENT_HEADERS.signature] =
      `v1=${await hmacHex(options.secret, `${parsed.id}.${timestamp}.${body}`)}`
    headers[ACCOUNT_EVENT_HEADERS.signatureV2] = v2
  } else headers[ACCOUNT_EVENT_HEADERS.signature] = v2
  return { body, headers }
}

export type BodyText = { ok: true; text: string } | { ok: false; reason: "too_large" }

/**
 * Lecture bornée du corps d'une requête : par morceaux, abandonnée dès qu'elle dépasse `maxBytes`
 * (en octets, « é » en compte deux). `request.text()` lit tout avant qu'on puisse compter, y
 * compris un envoi sans `content-length` (chunked).
 */
export async function readBodyText(request: Request, maxBytes: number): Promise<BodyText> {
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > maxBytes) return { ok: false, reason: "too_large" }
  if (!request.body) return { ok: true, text: "" }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return { ok: false, reason: "too_large" }
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, text: new TextDecoder().decode(bytes) }
}

/** Pourquoi une requête est refusée. La réponse ne porte que le code, jamais le détail. */
export type AccountEventRejection = "too_large" | "unauthorized" | "invalid_body"

export type AccountEventVerification =
  | { ok: true; event: AccountEvent }
  | { ok: false; status: 400 | 401 | 413; error: AccountEventRejection }

const reject = (status: 400 | 401 | 413, error: AccountEventRejection): AccountEventVerification => ({
  ok: false,
  status,
  error,
})

/**
 * Côté produit : lit le corps en flux (plafond `ACCOUNT_EVENT_MAX_BYTES`), vérifie horodatage
 * (±5 minutes), audience (celle du produit), signature `v2=` en temps constant, puis le corps
 * (`accountEventSchema`), l'accord entre l'identifiant signé et celui du corps, et un
 * `occurredAt` sans plus de 5 minutes d'avance. Ne dit rien du rejeu : à écarter par la table
 * des événements traités.
 */
export async function verifyAccountEvent(
  request: Request,
  options: { secret: string; now: number; audience: AccountEventAudience },
): Promise<AccountEventVerification> {
  assertSecret(options.secret)
  assertAudience(options.audience)
  const read = await readBodyText(request, ACCOUNT_EVENT_MAX_BYTES)
  if (!read.ok) return reject(413, "too_large")
  const raw = read.text

  const eventId = request.headers.get(ACCOUNT_EVENT_HEADERS.id) ?? ""
  const timestamp = request.headers.get(ACCOUNT_EVENT_HEADERS.timestamp) ?? ""
  const audience = request.headers.get(ACCOUNT_EVENT_HEADERS.audience) ?? ""
  const signature = [
    request.headers.get(ACCOUNT_EVENT_HEADERS.signatureV2),
    request.headers.get(ACCOUNT_EVENT_HEADERS.signature),
  ].find((value) => value?.startsWith("v2="))
  if (!signature || audience !== options.audience) return reject(401, "unauthorized")
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(eventId) || !/^\d{1,12}$/.test(timestamp)) return reject(401, "unauthorized")
  if (Math.abs(options.now / 1000 - Number(timestamp)) > ACCOUNT_EVENT_TOLERANCE_SECONDS)
    return reject(401, "unauthorized")
  const expected = `v2=${await hmacHex(options.secret, signedPayloadV2(options.audience, eventId, timestamp, raw))}`
  if (!constantTimeEqual(signature, expected)) return reject(401, "unauthorized")

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return reject(400, "invalid_body")
  }
  const parsed = accountEventSchema.safeParse(json)
  if (!parsed.success || parsed.data.id !== eventId) return reject(400, "invalid_body")
  if (parsed.data.occurredAt > options.now + ACCOUNT_EVENT_FUTURE_TOLERANCE_MS) return reject(400, "invalid_body")
  return { ok: true, event: parsed.data }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

/**
 * Endpoint complet d'un produit, à envelopper dans une `httpAction` Convex :
 *
 * ```ts
 * export const accountEvents = httpAction(async (ctx, request) =>
 *   handleAccountEventRequest(request, {
 *     audience: "host",
 *     secret: process.env.ACCOUNT_EVENTS_SECRET,
 *     apply: (event) => ctx.runMutation(internal.organizations.applyAccountEvent, { event }),
 *   }),
 * )
 * http.route({ path: ACCOUNT_EVENTS_PATH, method: "POST", handler: accountEvents })
 * ```
 *
 * `apply` est une mutation interne qui, dans la même transaction, écarte un `id` déjà traité,
 * l'enregistre et applique l'événement ; elle rend son issue détaillée (`AccountEventOutcome`),
 * renvoyée à Account et journalisée en avertissement quand rien n'est appliqué. Sans secret
 * posé : 503, Account réessaie plus tard. Une erreur de `apply` remonte (500) : Account réessaie.
 */
export async function handleAccountEventRequest(
  request: Request,
  options: {
    audience: AccountEventAudience
    secret: string | undefined
    apply: (event: AccountEvent) => Promise<AccountEventOutcome>
    now?: number
  },
): Promise<Response> {
  const { secret } = options
  if (typeof secret !== "string" || secret.length < ACCOUNT_EVENT_SECRET_MIN_LENGTH)
    return json(503, { error: "not_configured" })
  const verified = await verifyAccountEvent(request, {
    secret,
    now: options.now ?? Date.now(),
    audience: options.audience,
  })
  if (!verified.ok) return json(verified.status, { error: verified.error })
  const { event } = verified
  const outcome = await options.apply(event)
  // Des identifiants seulement, jamais d'adresse : de quoi retrouver l'événement chez Account.
  if (outcome !== "applied")
    console.warn(
      "Événement Account non appliqué",
      JSON.stringify({ id: event.id, type: event.type, organizationId: event.organizationId, outcome }),
    )
  return json(200, responseOf(outcome))
}

/**
 * Vrai si l'appartenance a été confirmée par Account après l'événement : un essai en retard ne
 * doit pas défaire une connexion plus récente (personne retirée puis réinvitée, rôle changé deux
 * fois). `syncedAt` doit être l'instant où Account a émis les droits recopiés, soit l'`iat` de
 * l'id_token (`verifyHgdcIdToken(...).issuedAt`), jamais l'heure de la copie : un jeton émis avant
 * un retrait puis lu après ne doit pas masquer ce retrait. Une copie sans `syncedAt` n'est jamais
 * plus récente.
 */
export function accountEventIsStale(
  event: Pick<AccountEvent, "occurredAt">,
  syncedAt: number | null | undefined,
): boolean {
  return typeof syncedAt === "number" && syncedAt > event.occurredAt
}

const vRole = v.union(...ORG_ROLES.map((role) => v.literal(role)))

/** Validateur Convex d'un `AccountEvent` : argument de la mutation interne qui l'applique. */
export const vAccountEvent: Validator<AccountEvent, "required", string> = v.union(
  v.object({
    id: v.string(),
    type: v.literal("member.removed"),
    occurredAt: v.number(),
    organizationId: v.string(),
    userId: v.string(),
    reason: v.union(v.literal("removed"), v.literal("left"), v.literal("user_deleted")),
  }),
  v.object({
    id: v.string(),
    type: v.literal("member.role_changed"),
    occurredAt: v.number(),
    organizationId: v.string(),
    userId: v.string(),
    role: vRole,
  }),
  v.object({
    id: v.string(),
    type: v.literal("organization.deleted"),
    occurredAt: v.number(),
    organizationId: v.string(),
  }),
)

/** Validateur Convex de l'issue rendue par la mutation qui applique un événement. */
export const vAccountEventOutcome: Validator<AccountEventOutcome, "required", string> = v.union(
  v.literal("applied"),
  v.literal("duplicate"),
  v.literal("ignored:unknown_organization"),
  v.literal("ignored:unknown_user"),
  v.literal("ignored:not_member"),
  v.literal("ignored:stale"),
)

type AccountEventRow = { eventId: string; type: string; receivedAt: number }

/**
 * Table des événements déjà traités, pour l'idempotence (`accountEvents: accountEventsTable` dans
 * le schéma du produit). Purge après `ACCOUNT_EVENT_RETENTION_MS` par l'index `by_received`.
 */
export const accountEventsTable: TableDefinition<
  VObject<AccountEventRow, { eventId: VString; type: VString; receivedAt: VFloat64 }>,
  { by_event_id: ["eventId", "_creationTime"]; by_received: ["receivedAt", "_creationTime"] }
> = defineTable({
  eventId: v.string(),
  type: v.string(),
  receivedAt: v.number(),
})
  .index("by_event_id", ["eventId"])
  .index("by_received", ["receivedAt"])
