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
 * `v1=` hex de HMAC(secret, "<id>.<horodatage>.<corps brut>"). L'identifiant de l'événement est
 * dans le MAC : rejouer une requête captée dans la fenêtre de 5 minutes ne passe pas la table des
 * événements déjà traités du produit.
 */

/** Chemin de l'endpoint de chaque produit, sur son déploiement Convex (`https://<…>.convex.site`). */
export const ACCOUNT_EVENTS_PATH = "/hgdc/v1/account-events"

/** En-têtes de la requête signée. */
export const ACCOUNT_EVENT_HEADERS: {
  readonly id: "x-hgdc-event-id"
  readonly timestamp: "x-hgdc-timestamp"
  readonly signature: "x-hgdc-signature"
} = {
  id: "x-hgdc-event-id",
  timestamp: "x-hgdc-timestamp",
  signature: "x-hgdc-signature",
} as const

/** Écart toléré entre l'horodatage signé et l'horloge du produit, en secondes. */
export const ACCOUNT_EVENT_TOLERANCE_SECONDS = 300

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

/** Ce que le produit a fait de l'événement : rendu dans la réponse, pour les journaux d'Account. */
export type AccountEventOutcome = "applied" | "ignored" | "duplicate"

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

/** Identifiant d'événement neuf (UUID sans tirets), à garder pour tous les essais. */
export function newAccountEventId(): string {
  return crypto.randomUUID().replaceAll("-", "")
}

/**
 * Côté Account : corps et en-têtes d'un envoi. À rappeler à chaque essai (horodatage neuf),
 * avec le même événement (même `id`).
 */
export async function signAccountEvent(
  event: AccountEvent,
  options: { secret: string; now: number },
): Promise<{ body: string; headers: Record<string, string> }> {
  assertSecret(options.secret)
  const parsed = accountEventSchema.parse(event)
  const body = JSON.stringify(parsed)
  const timestamp = String(Math.floor(options.now / 1000))
  const signature = `v1=${await hmacHex(options.secret, `${parsed.id}.${timestamp}.${body}`)}`
  return {
    body,
    headers: {
      "content-type": "application/json",
      [ACCOUNT_EVENT_HEADERS.id]: parsed.id,
      [ACCOUNT_EVENT_HEADERS.timestamp]: timestamp,
      [ACCOUNT_EVENT_HEADERS.signature]: signature,
    },
  }
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
 * Côté produit : vérifie taille, horodatage (±5 minutes), signature en temps constant, puis le
 * corps (`accountEventSchema`) et l'accord entre l'identifiant signé et celui du corps. Ne lit le
 * corps qu'une fois. Ne dit rien du rejeu : à écarter par la table des événements traités.
 */
export async function verifyAccountEvent(
  request: Request,
  options: { secret: string; now: number },
): Promise<AccountEventVerification> {
  assertSecret(options.secret)
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (declared > ACCOUNT_EVENT_MAX_BYTES) return reject(413, "too_large")
  const raw = await request.text()
  if (encoder.encode(raw).byteLength > ACCOUNT_EVENT_MAX_BYTES) return reject(413, "too_large")

  const eventId = request.headers.get(ACCOUNT_EVENT_HEADERS.id) ?? ""
  const timestamp = request.headers.get(ACCOUNT_EVENT_HEADERS.timestamp) ?? ""
  const signature = request.headers.get(ACCOUNT_EVENT_HEADERS.signature) ?? ""
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(eventId) || !/^\d{1,12}$/.test(timestamp)) return reject(401, "unauthorized")
  if (Math.abs(options.now / 1000 - Number(timestamp)) > ACCOUNT_EVENT_TOLERANCE_SECONDS)
    return reject(401, "unauthorized")
  const expected = `v1=${await hmacHex(options.secret, `${eventId}.${timestamp}.${raw}`)}`
  if (!constantTimeEqual(signature, expected)) return reject(401, "unauthorized")

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return reject(400, "invalid_body")
  }
  const parsed = accountEventSchema.safeParse(json)
  if (!parsed.success || parsed.data.id !== eventId) return reject(400, "invalid_body")
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
 *     secret: process.env.ACCOUNT_EVENTS_SECRET,
 *     apply: (event) => ctx.runMutation(internal.organizations.applyAccountEvent, { event }),
 *   }),
 * )
 * http.route({ path: ACCOUNT_EVENTS_PATH, method: "POST", handler: accountEvents })
 * ```
 *
 * `apply` est une mutation interne qui, dans la même transaction, écarte un `id` déjà traité,
 * l'enregistre et applique l'événement. Sans secret posé : 503, Account réessaie plus tard.
 * Une erreur de `apply` remonte (500) : Account réessaie aussi.
 */
export async function handleAccountEventRequest(
  request: Request,
  options: {
    secret: string | undefined
    apply: (event: AccountEvent) => Promise<AccountEventOutcome>
    now?: number
  },
): Promise<Response> {
  const { secret } = options
  if (typeof secret !== "string" || secret.length < ACCOUNT_EVENT_SECRET_MIN_LENGTH)
    return json(503, { error: "not_configured" })
  const verified = await verifyAccountEvent(request, { secret, now: options.now ?? Date.now() })
  if (!verified.ok) return json(verified.status, { error: verified.error })
  const outcome = await options.apply(verified.event)
  return json(200, { status: outcome })
}

/**
 * Vrai si l'appartenance a été confirmée par Account après l'événement (`syncedAt` plus récent) :
 * un essai en retard ne doit pas défaire une connexion plus récente (personne retirée puis
 * réinvitée, rôle changé deux fois). Une copie sans `syncedAt` n'est jamais plus récente.
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
