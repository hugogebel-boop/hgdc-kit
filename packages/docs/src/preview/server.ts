/**
 * Passerelle d'aperçu de HGDC Docs (ADR 0011, runbook `apercu.md`).
 *
 * Ne lance rien et n'exécute aucun contenu : elle attribue les emplacements (un conteneur
 * gVisor chacun, `agent.ts`), leur envoie les fichiers par leur socket, et relaie les
 * lectrices vers l'emplacement de leur session, avec la génération courante.
 *
 * - Pilotage (`POST /v1/sync`, `POST /v1/close` sur l'hôte du domaine) : signé par
 *   `PREVIEW_SECRET`, que seule la console (Convex) connaît.
 * - Lecture (`<session>.<domaine>`) : jeton d'entrée à usage unique donné par Convex à un
 *   membre, échangé contre un cookie `__Host-` d'une heure lié à la session et à la
 *   génération ; la console le renouvelle tant que l'accès au projet tient.
 * - Joignable seulement par son socket Unix (0660, groupe partagé avec Caddy) en production.
 *
 * Lancée par `node src/preview/server.ts` (types retirés par Node), hors de `node_modules`.
 */
import { chmodSync, chownSync, existsSync, rmSync } from "node:fs"
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http"
import { connect } from "node:net"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  classifyHost,
  COOKIE_TTL_MS,
  GENERATION_HEADER,
  PREVIEW_MESSAGE,
  PREVIEW_DIGEST_HEADER,
  PREVIEW_LIMITS,
  PREVIEW_SIGNATURE_HEADER,
  PREVIEW_TIMESTAMP_HEADER,
  randomId,
  RENEW_PATH,
  sessionOrigin,
  signAccess,
  TOKEN_PARAM,
  TOKEN_TTL_MS,
  verifyAccess,
  sha256Hex,
  verifyPreviewHeaders,
  type AccessGrant,
} from "../core/preview.ts"
import { isDocFile } from "../core/validate.ts"
import { AGENT_STATE_HEADER, CONTROL_HEADER } from "./agent.ts"
import { parseCloseRequest, parseSyncRequest, type SyncRequest } from "./protocol.ts"

export type GatewaySettings = {
  secret: string
  publicUrl: URL
  parentOrigin: string
  listen: number | string
  host: string
  /** Socket de l'agent de chaque emplacement. */
  slots: Array<string>
  maxPerOrganization: number
  /** Une session inactive depuis ce délai peut céder sa place. */
  evictAfterMs: number
  /** Une session inactive depuis ce délai est fermée. */
  closeAfterMs: number
  /** Durée absolue d'une session, active ou non. */
  maxSessionMs: number
  /** Attente d'un agent neuf après le recyclage d'un emplacement. */
  freshTimeoutMs: number
  socketGid: number | null
}

/** Socket de l'agent de l'emplacement `index` : un dossier par emplacement, ou un tube nommé sous Windows. */
export function slotSocket(dir: string | undefined, index: number): string {
  return dir ? join(dir, `slot-${index}`, "agent.sock") : `\\\\.\\pipe\\hgdc-docs-preview-slot-${index}`
}

export function settingsFromEnv(env: NodeJS.ProcessEnv): GatewaySettings {
  const secret = env.PREVIEW_SECRET ?? ""
  if (secret.length < 32) throw new Error("PREVIEW_SECRET manque (32 caractères au moins).")
  const listen = env.PREVIEW_LISTEN ?? "4400"
  const count = Number(env.PREVIEW_SLOTS ?? 4)
  const socketGid = env.PREVIEW_SOCKET_GID ? Number(env.PREVIEW_SOCKET_GID) : null
  const settings: GatewaySettings = {
    secret,
    publicUrl: new URL(env.PREVIEW_PUBLIC_URL ?? "http://localhost:4400"),
    parentOrigin: new URL(env.PREVIEW_PARENT_ORIGIN ?? "http://localhost:3400").origin,
    listen: /^\d+$/.test(listen) ? Number(listen) : listen,
    host: env.PREVIEW_HOST ?? "127.0.0.1",
    slots: Array.from({ length: count }, (_, index) => slotSocket(env.PREVIEW_SLOTS_DIR, index)),
    maxPerOrganization: Number(env.PREVIEW_MAX_PER_ORGANIZATION ?? 2),
    evictAfterMs: Number(env.PREVIEW_EVICT_MINUTES ?? 10) * 60_000,
    closeAfterMs: Number(env.PREVIEW_IDLE_MINUTES ?? 30) * 60_000,
    maxSessionMs: Number(env.PREVIEW_MAX_SESSION_MINUTES ?? 120) * 60_000,
    freshTimeoutMs: 90_000,
    socketGid,
  }
  // En production, aucun repli : la passerelle ne s'ouvre que par son socket, au groupe de Caddy.
  if (env.NODE_ENV === "production") {
    const missing = [
      typeof settings.listen !== "string" && "PREVIEW_LISTEN (socket Unix)",
      socketGid === null && "PREVIEW_SOCKET_GID",
      !env.PREVIEW_SLOTS_DIR && "PREVIEW_SLOTS_DIR",
      settings.publicUrl.protocol !== "https:" && "PREVIEW_PUBLIC_URL en https",
    ].filter(Boolean)
    if (missing.length) throw new Error(`Passerelle d'aperçu : isolement incomplet (${missing.join(", ")}).`)
  }
  if (!Number.isInteger(count) || count < 1 || count > 16) throw new Error("PREVIEW_SLOTS : entre 1 et 16.")
  return settings
}

// --- Appels aux agents ---------------------------------------------------------------------

async function agentCall(
  socket: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const text = body === undefined ? undefined : JSON.stringify(body)
  return await new Promise((done, fail) => {
    const req = httpRequest(
      {
        socketPath: socket,
        method,
        path,
        headers: { [CONTROL_HEADER]: "1", "content-type": "application/json", host: "agent" },
        timeout: 60_000,
      },
      (res) => {
        const chunks: Array<Buffer> = []
        res.on("data", (chunk: Buffer) => chunks.push(chunk))
        res.on("end", () => {
          try {
            done({ status: res.statusCode ?? 500, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) })
          } catch {
            done({ status: 502, json: {} })
          }
        })
      },
    )
    req.on("timeout", () => req.destroy(new Error("délai")))
    req.on("error", fail)
    req.end(text)
  })
}

// --- Sessions ------------------------------------------------------------------------------

type Session = {
  id: string
  key: string
  owner: string
  organization: string
  project: string
  slot: number
  generation: string
  repo: Map<string, string>
  /** Ce que l'agent a écrit à cette génération : chemin → empreinte et taille. */
  written: Map<string, { sha: string; size: number }>
  lastUsed: number
  /** Une session ne dure jamais plus de `maxSessionMs`, même active. */
  createdAt: number
  /** Débit de synchronisation : seau de jetons. */
  tokens: number
  refilledAt: number
}

// Sans propriété de paramètre : Node retire les types sans rien transformer.
type BusyCode = "busy" | "busy_organization" | "busy_person"
class Busy extends Error {
  readonly code: BusyCode
  constructor(code: BusyCode) {
    super(code)
    this.code = code
  }
}

export function createGateway(settings: GatewaySettings) {
  const sessions = new Map<string, Session>()
  const byKey = new Map<string, string>()
  const slotOf: Array<string | null> = settings.slots.map(() => null)
  /** Nonces des jetons d'entrée déjà servis (usage unique), jusqu'à leur expiration. */
  const usedNonces = new Map<string, number>()
  /** Attributions récentes par personne : pas de démarrages à froid en rafale. */
  const allocations = new Map<string, Array<number>>()
  let lock: Promise<unknown> = Promise.resolve()

  function serial<T>(run: () => Promise<T>): Promise<T> {
    const next = lock.then(run, run)
    lock = next.catch(() => {})
    return next
  }

  /**
   * Fin d'une session : l'agent cesse de servir et sort, son conteneur repart neuf
   * (/tmp, /dev/shm, IPC et processus compris). L'emplacement redevient libre ; il ne sera
   * attribué qu'une fois l'agent suivant prêt (`ensureFresh`).
   */
  async function release(session: Session) {
    sessions.delete(session.id)
    byKey.delete(session.key)
    slotOf[session.slot] = null
    await recycleSlot(session.slot)
  }

  async function recycleSlot(slot: number) {
    await agentCall(settings.slots[slot]!, "POST", "/_agent/recycle", {}).catch(() => null)
  }

  /** Attend un agent neuf sur l'emplacement (conteneur relancé par Docker), au plus 90 s. */
  async function ensureFresh(slot: number) {
    const until = Date.now() + settings.freshTimeoutMs
    while (Date.now() < until) {
      const status = await agentCall(settings.slots[slot]!, "GET", "/_agent/status").catch(() => null)
      if (status?.json.state === "fresh") return
      if (status && status.json.state !== "recycling") await recycleSlot(slot)
      await new Promise((done) => setTimeout(done, 250))
    }
    console.error(`[passerelle] emplacement ${slot} sans agent neuf`)
    throw new Error("Emplacement indisponible.")
  }

  function countAllocation(owner: string) {
    const now = Date.now()
    const recent = (allocations.get(owner) ?? []).filter((at) => now - at < ALLOCATION_WINDOW_MS)
    if (recent.length >= ALLOCATIONS_PER_WINDOW) throw new Busy("busy_person")
    recent.push(now)
    allocations.set(owner, recent)
  }

  async function allocate(sync: SyncRequest): Promise<Session> {
    countAllocation(sync.owner)
    // Une session par personne : la sienne (autre doc ou branche) cède la place.
    for (const other of Array.from(sessions.values()))
      // copie : `release` retire de la table
      if (other.owner === sync.owner && other.key !== sync.key) await release(other)
    const now = Date.now()
    const idle = (session: Session) => now - session.lastUsed > settings.evictAfterMs
    const ofOrganization = [...sessions.values()].filter((s) => s.organization === sync.organization)
    if (ofOrganization.length >= settings.maxPerOrganization) {
      const oldest = ofOrganization.filter(idle).sort((a, b) => a.lastUsed - b.lastUsed)[0]
      if (!oldest) throw new Busy("busy_organization")
      await release(oldest)
    }
    let slot = slotOf.findIndex((owner) => owner === null)
    if (slot === -1) {
      // Jamais une session active : seulement une inactive depuis `evictAfterMs`.
      const oldest = [...sessions.values()].filter(idle).sort((a, b) => a.lastUsed - b.lastUsed)[0]
      if (!oldest) throw new Busy("busy")
      await release(oldest)
      slot = slotOf.findIndex((owner) => owner === null)
      if (slot === -1) throw new Busy("busy")
    }
    // L'emplacement est réservé pendant l'attente de son agent neuf.
    slotOf[slot] = "réservé"
    try {
      await ensureFresh(slot)
    } catch (error) {
      slotOf[slot] = null
      throw error
    }
    const generation = randomId(24)
    const assigned = await agentCall(settings.slots[slot]!, "POST", "/_agent/assign", { generation })
    if (assigned.status !== 200 || assigned.json.generation !== generation) {
      slotOf[slot] = null
      throw new Error("Emplacement non attribué.")
    }
    const session: Session = {
      id: randomId(26),
      key: sync.key,
      owner: sync.owner,
      organization: sync.organization,
      project: sync.project,
      slot,
      generation,
      repo: new Map(),
      written: new Map(),
      lastUsed: now,
      createdAt: now,
      tokens: SYNC_BURST,
      refilledAt: now,
    }
    sessions.set(session.id, session)
    byKey.set(session.key, session.id)
    slotOf[slot] = session.id
    return session
  }

  /** Trop de synchronisations d'affilée pour une session : deux par seconde, dix d'avance. */
  function takeToken(session: Session): boolean {
    const now = Date.now()
    session.tokens = Math.min(SYNC_BURST, session.tokens + ((now - session.refilledAt) / 1000) * SYNC_RATE)
    session.refilledAt = now
    if (session.tokens < 1) return false
    session.tokens -= 1
    return true
  }

  async function sync(body: SyncRequest): Promise<{ status: number; json: unknown }> {
    return await serial(async () => {
      let existing = byKey.get(body.key)
      // Durée absolue dépassée : la session est rendue, une nouvelle s'ouvre (et compte).
      const expired = existing ? sessions.get(existing)! : null
      if (expired && Date.now() - expired.createdAt > settings.maxSessionMs) {
        await release(expired)
        existing = undefined
      }
      // Emplacement mort puis reparti neuf (OOM, plantage) : la session ne vaut plus rien.
      const current = existing ? sessions.get(existing)! : null
      if (current && !(await slotHolds(current))) {
        drop(current)
        existing = undefined
      }
      if (!existing && !body.repo)
        return { status: 409, json: { code: current && !sessions.has(current.id) ? "slot_lost" : "unknown_session" } }
      let session: Session
      try {
        session = existing ? sessions.get(existing)! : await allocate(body)
      } catch (error) {
        if (error instanceof Busy)
          return { status: 503, json: { code: error.code, message: "Tous les aperçus sont occupés." } }
        throw error
      }
      if (!takeToken(session)) return { status: 429, json: { code: "rate_limited" } }
      if (body.repo) session.repo = new Map(body.repo.map((file) => [file.path, file.sha]))

      const wanted = new Map(session.repo)
      for (const file of body.overlay) {
        if (file.sha === null) wanted.delete(file.path)
        else wanted.set(file.path, file.sha)
      }
      const blobs = new Map(body.blobs.map((blob) => [blob.sha, blob]))
      const changed = [...wanted].filter(([path, sha]) => session.written.get(path)?.sha !== sha)
      const missing = [...new Set(changed.map(([, sha]) => sha).filter((sha) => !blobs.has(sha)))]
      if (missing.length) return { status: 200, json: { session: session.id, missing } }

      // Quotas de la session : nombre de fichiers et taille totale, avant toute écriture.
      const sizeOf = (sha: string) => {
        const blob = blobs.get(sha)!
        return blob.encoding === "base64" ? Math.floor((blob.content.length * 3) / 4) : Buffer.byteLength(blob.content)
      }
      let total = 0
      for (const [path, sha] of wanted)
        total += session.written.get(path)?.sha === sha ? session.written.get(path)!.size : sizeOf(sha)
      if (wanted.size > PREVIEW_LIMITS.files || total > PREVIEW_LIMITS.sessionBytes)
        return { status: 413, json: { code: "too_large", message: "Doc trop volumineuse pour l'aperçu." } }

      const deletes = [...session.written.keys()].filter((path) => !wanted.has(path))
      const writes = changed.map(([path, sha]) => {
        const blob = blobs.get(sha)!
        return { path, encoding: blob.encoding, content: blob.content }
      })
      const socket = settings.slots[session.slot]!
      if (writes.length || deletes.length) {
        const written = await agentCall(socket, "POST", "/_agent/files", {
          generation: session.generation,
          writes,
          deletes,
        })
        if (written.status !== 200) return lost(session)
        for (const path of deletes) session.written.delete(path)
        for (const [path, sha] of changed) session.written.set(path, { sha, size: sizeOf(sha) })
      }
      // Les contenus reçus ne sont gardés nulle part : l'agent les a écrits, la requête s'arrête.
      const started = await agentCall(socket, "POST", "/_agent/start", { generation: session.generation })
      if (started.status !== 200) return lost(session)
      // Seule une synchronisation réussie compte comme activité : une session refusée se libère.
      session.lastUsed = Date.now()
      return { status: 200, json: { session: session.id, generation: session.generation, missing: [] } }
    })
  }

  /** L'agent de l'emplacement sert-il encore cette session (même génération) ? */
  async function slotHolds(session: Session): Promise<boolean> {
    const status = await agentCall(settings.slots[session.slot]!, "GET", "/_agent/status").catch(() => null)
    return status?.status === 200 && status.json.generation === session.generation
  }

  /**
   * Retire une session dont l'emplacement est mort : rien à recycler (l'agent est déjà
   * reparti neuf, ou repart), l'emplacement redevient libre et attendra un agent neuf.
   */
  function drop(session: Session) {
    sessions.delete(session.id)
    byKey.delete(session.key)
    if (slotOf[session.slot] === session.id) slotOf[session.slot] = null
    console.warn(`[passerelle] emplacement ${session.slot} reparti : session fermée`)
  }

  /** Refus de l'agent en cours de synchronisation : session fermée si l'emplacement l'a perdue. */
  async function lost(session: Session): Promise<{ status: number; json: unknown }> {
    if (await slotHolds(session)) return { status: 502, json: { code: "slot_refused" } }
    drop(session)
    return { status: 409, json: { code: "slot_lost" } }
  }

  async function close(match: { owner?: string; organization?: string; project?: string }) {
    await serial(async () => {
      for (const session of Array.from(sessions.values()))
        if (
          (match.owner && session.owner === match.owner) ||
          (match.organization && session.organization === match.organization) ||
          (match.project && session.project === match.project)
        )
          await release(session)
    })
  }

  function sweep() {
    const now = Date.now()
    for (const [nonce, expires] of usedNonces) if (expires <= now) usedNonces.delete(nonce)
    const stale = [...sessions.values()].filter(
      (session) => now - session.lastUsed > settings.closeAfterMs || now - session.createdAt > settings.maxSessionMs,
    )
    if (stale.length) void serial(async () => Promise.all(stale.map(release)))
  }

  /** Jeton d'entrée valable et jamais servi ; il est consommé. */
  async function consumeToken(session: Session, token: string | null): Promise<AccessGrant | null> {
    const grant = await verifyAccess(
      settings.secret,
      "token",
      { session: session.id, generation: session.generation },
      token,
    )
    if (!grant || usedNonces.has(grant.nonce)) return null
    usedNonces.set(grant.nonce, Date.now() + TOKEN_TTL_MS)
    return grant
  }

  async function cookieFor(session: Session): Promise<string> {
    const value = await signAccess(settings.secret, "cookie", {
      session: session.id,
      generation: session.generation,
      expires: Date.now() + COOKIE_TTL_MS,
      nonce: randomId(12),
    })
    return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Max-Age=${COOKIE_TTL_MS / 1000}; Secure; SameSite=None; Partitioned`
  }

  async function allowed(session: Session, req: IncomingMessage): Promise<boolean> {
    for (const value of cookiesOf(req))
      if (await verifyAccess(settings.secret, "cookie", { session: session.id, generation: session.generation }, value))
        return true
    return false
  }

  /** Au démarrage : aucun emplacement ne garde un locataire d'avant (passerelle relancée). */
  function recycleAll() {
    for (let slot = 0; slot < settings.slots.length; slot++) void recycleSlot(slot)
  }

  return { sessions, slotOf, sync, close, sweep, consumeToken, cookieFor, allowed, recycleAll, slotHolds, drop }
}

/** Six attributions par personne en dix minutes : changer de doc ne lance pas des démarrages en rafale. */
const ALLOCATIONS_PER_WINDOW = 6
const ALLOCATION_WINDOW_MS = 10 * 60_000
const SYNC_RATE = 2
const SYNC_BURST = 10

// --- Lecture --------------------------------------------------------------------------------

/**
 * `__Host-` : ni `Domain` ni autre chemin possibles. Les sessions sont des sous-domaines
 * voisins : le contenu d'une session ne peut pas poser un cookie qui masquerait celui d'une autre.
 */
const COOKIE_NAME = "__Host-hd_preview"

function cookiesOf(req: IncomingMessage): Array<string> {
  const values: Array<string> = []
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=")
    if (name === COOKIE_NAME) values.push(value.join("="))
  }
  return values.slice(0, 5)
}

/** En-têtes de toute réponse de l'aperçu, pages d'erreur comprises. */
function guardHeaders(settings: GatewaySettings): Record<string, string> {
  return {
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": `frame-ancestors ${settings.parentOrigin}`,
  }
}

function page(
  settings: GatewaySettings,
  res: ServerResponse,
  status: number,
  title: string,
  text: string,
  refresh = false,
  /** Session fermée : la console qui encadre l'aperçu en rouvre une neuve (une fois). */
  closed = false,
) {
  res.writeHead(status, { ...guardHeaders(settings), "content-type": "text/html; charset=utf-8" })
  const notify = closed
    ? `<script>parent.postMessage(${JSON.stringify({ [PREVIEW_MESSAGE]: { type: "closed" } })}, ${JSON.stringify(settings.parentOrigin)})</script>`
    : ""
  res.end(
    `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">${
      refresh ? '<meta http-equiv="refresh" content="2">' : ""
    }${notify}<title>${title}</title><body style="font:15px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;color:#3f3f46"><div style="max-width:28rem;text-align:center"><p style="font-weight:600;color:#18181b">${title}</p><p>${text}</p></div></body></html>`,
  )
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
  res.end(JSON.stringify(body))
}

async function readBytes(req: IncomingMessage, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const chunks: Array<Buffer> = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > limit) return null
    chunks.push(chunk)
  }
  const bytes = new Uint8Array(new ArrayBuffer(size))
  bytes.set(Buffer.concat(chunks))
  return bytes
}

async function readBody(req: IncomingMessage, limit: number): Promise<string | null> {
  const chunks: Array<Buffer> = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > limit) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

const header = (req: IncomingMessage, name: string): string | null => {
  const value = req.headers[name]
  return typeof value === "string" ? value : null
}

export function startGateway(settings: GatewaySettings = settingsFromEnv(process.env)) {
  const gateway = createGateway(settings)
  const domain = settings.publicUrl.hostname

  async function control(req: IncomingMessage, res: ServerResponse) {
    if (req.method === "GET" && req.url === "/health")
      return json(res, 200, { ok: true, sessions: gateway.sessions.size, slots: settings.slots.length })
    if (req.method !== "POST" || (req.url !== "/v1/sync" && req.url !== "/v1/close"))
      return json(res, 404, { message: "Inconnu." })
    // Signature, empreinte et taille annoncées vérifiées sur les seuls en-têtes : rien n'est
    // lu d'un appel non signé, et jamais plus que la taille signée.
    const length = Number(req.headers["content-length"])
    if (!Number.isSafeInteger(length) || length < 0 || length > PREVIEW_LIMITS.requestBytes)
      return json(res, 413, { message: "Taille absente ou trop grande." })
    const signed = await verifyPreviewHeaders(settings.secret, {
      timestamp: header(req, PREVIEW_TIMESTAMP_HEADER),
      digest: header(req, PREVIEW_DIGEST_HEADER),
      signature: header(req, PREVIEW_SIGNATURE_HEADER),
      length,
    })
    if (!signed) return json(res, 401, { message: "Signature refusée." })
    const raw = await readBytes(req, length)
    if (raw === null || raw.length !== length || (await sha256Hex(raw)) !== header(req, PREVIEW_DIGEST_HEADER))
      return json(res, 400, { message: "Corps différent de celui signé." })
    const body = Buffer.from(raw).toString("utf8")
    if (req.url === "/v1/close") {
      const match = parseCloseRequest(body)
      if (!match) return json(res, 400, { message: "Requête invalide." })
      await gateway.close(match)
      return json(res, 200, { ok: true })
    }
    const sync = parseSyncRequest(body, isDocFile)
    if (!sync.ok) return json(res, 400, { message: sync.message })
    const result = await gateway.sync(sync.value)
    return json(res, result.status, result.json)
  }

  async function view(id: string, req: IncomingMessage, res: ServerResponse) {
    const session = gateway.sessions.get(id)
    if (!session)
      return page(
        settings,
        res,
        404,
        "Aperçu fermé",
        "Il a été fermé. Rouvre-le depuis l'éditeur de Docs.",
        false,
        true,
      )
    const url = new URL(req.url ?? "/", "http://apercu")
    // Le pilotage des agents n'est jamais atteignable par une lectrice.
    if (url.pathname.startsWith("/_agent")) return page(settings, res, 404, "Introuvable", "")
    const origin = sessionOrigin(settings.publicUrl.href, session.id)

    if (url.pathname === RENEW_PATH && req.method === "POST") {
      if (req.headers.origin !== origin) return json(res, 403, { message: "Origine refusée." })
      const token = await readBody(req, 300)
      if (!(await gateway.consumeToken(session, token))) return json(res, 403, { message: "Jeton refusé." })
      res.writeHead(204, { ...guardHeaders(settings), "set-cookie": await gateway.cookieFor(session) })
      return res.end()
    }

    const token = url.searchParams.get(TOKEN_PARAM)
    if (token !== null) {
      if (!(await gateway.consumeToken(session, token)))
        return page(settings, res, 403, "Lien d'aperçu expiré", "Rouvre l'aperçu depuis l'éditeur de Docs.")
      url.searchParams.delete(TOKEN_PARAM)
      res.writeHead(303, {
        ...guardHeaders(settings),
        // Un seul « / » en tête : `//autre.site` serait une redirection vers un autre hôte.
        location: `/${url.pathname.replace(/^\/+/, "")}${url.search}`,
        "set-cookie": await gateway.cookieFor(session),
      })
      return res.end()
    }
    if (!(await gateway.allowed(session, req)))
      return page(settings, res, 403, "Aperçu réservé aux membres du projet", "Ouvre-le depuis l'éditeur de Docs.")
    const headers: Record<string, string | Array<string>> = {}
    for (const [name, value] of Object.entries(req.headers))
      if (value !== undefined && name !== "cookie" && name !== "authorization" && !name.startsWith("x-hgdc-"))
        headers[name] = value
    headers[GENERATION_HEADER] = session.generation
    const upstream = httpRequest(
      { socketPath: settings.slots[session.slot]!, method: req.method, path: req.url, headers },
      (reply) => {
        const state = reply.headers[AGENT_STATE_HEADER]
        if (state) {
          reply.resume()
          if (state === "gone") {
            // L'emplacement est reparti neuf (OOM, plantage) : la session est fermée, la console en rouvre une.
            void gateway.slotHolds(session).then((holds) => holds || gateway.drop(session))
            return page(settings, res, 404, "Aperçu fermé, relance en cours", "Un aperçu neuf s'ouvre.", false, true)
          }
          if (state === "stopped")
            return page(
              settings,
              res,
              503,
              "Le site ne démarre pas",
              "Vérifie docs.json et les pages citées dans la navigation, puis enregistre : l'aperçu repart.",
            )
          return page(
            settings,
            res,
            503,
            "Préparation de l'aperçu…",
            "Le site se construit, encore quelques secondes.",
            true,
          )
        }
        session.lastUsed = Date.now()
        const out: Record<string, string | Array<string>> = {}
        for (const [name, value] of Object.entries(reply.headers))
          if (value !== undefined && name !== "set-cookie") out[name] = value
        res.writeHead(reply.statusCode ?? 502, { ...out, ...guardHeaders(settings) })
        reply.pipe(res)
      },
    )
    upstream.on("error", () => {
      if (!res.headersSent) page(settings, res, 502, "Aperçu indisponible", "Réessaie dans un instant.")
      else res.destroy()
    })
    req.pipe(upstream)
  }

  const server = createServer((req, res) => {
    const target = classifyHost(req.headers.host, domain)
    const fail = (error: unknown) => {
      console.error("[passerelle]", error instanceof Error ? error.message : "erreur")
      if (!res.headersSent) page(settings, res, 500, "Aperçu indisponible", "Réessaie dans un instant.")
    }
    if (target.kind === "invalid") return page(settings, res, 400, "Adresse inconnue", "")
    if (target.kind === "control") return void control(req, res).catch(fail)
    void view(target.id, req, res).catch(fail)
  })

  // Rechargement en direct de Vite : même session, même cookie, et l'origine de la session.
  server.on("upgrade", (req, socket, head) => {
    const target = classifyHost(req.headers.host, domain)
    const session = target.kind === "session" ? gateway.sessions.get(target.id) : undefined
    void (async () => {
      if (!session || req.headers.origin !== sessionOrigin(settings.publicUrl.href, session.id)) return socket.destroy()
      if (!(await gateway.allowed(session, req))) return socket.destroy()
      const upstream = connect(settings.slots[session.slot]!, () => {
        const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          const name = req.rawHeaders[i]!.toLowerCase()
          if (name !== "cookie" && !name.startsWith("x-hgdc-"))
            lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
        }
        lines.push(`${GENERATION_HEADER}: ${session.generation}`)
        upstream.write(`${lines.join("\r\n")}\r\n\r\n`)
        if (head.length) upstream.write(head)
        socket.pipe(upstream).pipe(socket)
      })
      upstream.on("error", () => socket.destroy())
      socket.on("error", () => upstream.destroy())
    })()
  })

  gateway.recycleAll()
  const sweep = setInterval(() => gateway.sweep(), 60_000)
  sweep.unref()

  const ready = () => {
    if (typeof settings.listen === "string" && !settings.listen.startsWith("\\\\")) {
      // Caddy seul (groupe dédié) : 0660, jamais 0666.
      if (settings.socketGid !== null) chownSync(settings.listen, -1, settings.socketGid)
      chmodSync(settings.listen, 0o660)
    }
    console.warn(`[passerelle] ${settings.publicUrl.origin}, ${settings.slots.length} emplacements`)
  }
  if (typeof settings.listen === "string") {
    // Socket laissé par un arrêt brutal : sans le retirer, l'écoute échoue.
    if (!settings.listen.startsWith("\\\\") && existsSync(settings.listen)) rmSync(settings.listen, { force: true })
    server.listen(settings.listen, ready)
  } else server.listen(settings.listen, settings.host, ready)
  return { server, gateway }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startGateway()
