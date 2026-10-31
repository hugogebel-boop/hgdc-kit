import { describe, expect, it } from "vitest"

import {
  classifyHost,
  isPreviewCommand,
  isPreviewEvent,
  randomId,
  sessionOrigin,
  signAccess,
  PREVIEW_DIGEST_HEADER,
  PREVIEW_SIGNATURE_HEADER,
  PREVIEW_TIMESTAMP_HEADER,
  signPreviewRequest,
  verifyAccess,
  verifyPreviewHeaders,
  verifyPreviewRequest,
} from "./preview.ts"

const SECRET = "test-secret-".padEnd(48, "0")
const SESSION = "abcdefghij0123456789abcdef"
const GENERATION = "generation0123456789"

describe("aperçu : jetons et appels signés", () => {
  it("un jeton ouvre sa session à sa génération seulement, avant son expiration, pour son usage", async () => {
    const now = Date.now()
    const at = { session: SESSION, generation: GENERATION }
    const token = await signAccess(SECRET, "token", { ...at, expires: now + 60_000, nonce: "nonce12345" })
    expect(await verifyAccess(SECRET, "token", at, token, now)).toMatchObject({ nonce: "nonce12345" })
    expect(await verifyAccess(SECRET, "token", { ...at, session: "zzzzzzzzzz0123456789abcdef" }, token, now)).toBeNull()
    // Emplacement rendu à un autre locataire : nouvelle génération, l'ancien jeton ne vaut plus rien.
    expect(await verifyAccess(SECRET, "token", { ...at, generation: "autre0123456789abcd" }, token, now)).toBeNull()
    expect(await verifyAccess(SECRET, "cookie", at, token, now)).toBeNull()
    expect(await verifyAccess(SECRET, "token", at, token, now + 61_000)).toBeNull()
    expect(await verifyAccess("autre-secret-0123456789abcdef0123456", "token", at, token, now)).toBeNull()
    const parts = token.split(".")
    parts[2] = String(now + 999_999)
    expect(await verifyAccess(SECRET, "token", at, parts.join("."), now)).toBeNull()
    expect(await verifyAccess(SECRET, "token", at, null, now)).toBeNull()
  })

  it("un appel signé n'est accepté qu'avec son corps exact, sa taille et une horloge proche", async () => {
    const now = Date.now()
    const headers = await signPreviewRequest(SECRET, '{"a":1}', now)
    const given = {
      timestamp: headers[PREVIEW_TIMESTAMP_HEADER]!,
      digest: headers[PREVIEW_DIGEST_HEADER]!,
      signature: headers[PREVIEW_SIGNATURE_HEADER]!,
    }
    expect(await verifyPreviewRequest(SECRET, given, '{"a":1}', now)).toBe(true)
    expect(await verifyPreviewRequest(SECRET, given, '{"a":2}', now)).toBe(false)
    expect(await verifyPreviewRequest(SECRET, given, '{"a":1}', now + 6 * 60_000)).toBe(false)
    expect(await verifyPreviewRequest(SECRET, { ...given, timestamp: null }, '{"a":1}', now)).toBe(false)
    // Les en-têtes seuls suffisent à refuser, avant toute lecture du corps.
    expect(await verifyPreviewHeaders(SECRET, { ...given, length: 7 }, now)).toBe(true)
    expect(await verifyPreviewHeaders(SECRET, { ...given, length: 40_000_000 }, now)).toBe(false)
  })

  it("des identifiants aléatoires utilisables comme nom DNS", () => {
    const ids = new Set(Array.from({ length: 200 }, () => randomId(26)))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]{26}$/)
  })
})

describe("aperçu : adresses et messages", () => {
  it("une session vit sous le domaine de la passerelle ; un hôte mal formé n'atteint rien", () => {
    expect(sessionOrigin("https://preview.hgdc.cloud", SESSION)).toBe(`https://${SESSION}.preview.hgdc.cloud`)
    expect(sessionOrigin("http://localhost:4400", SESSION)).toBe(`http://${SESSION}.localhost:4400`)
    const domain = "preview.hgdc.cloud"
    expect(classifyHost(`${SESSION}.preview.hgdc.cloud`, domain)).toEqual({ kind: "session", id: SESSION })
    expect(classifyHost("preview.hgdc.cloud", domain)).toEqual({ kind: "control" })
    expect(classifyHost("preview.hgdc.cloud:443", domain)).toEqual({ kind: "control" })
    expect(classifyHost(`${SESSION}.localhost:4400`, "localhost")).toEqual({ kind: "session", id: SESSION })
    for (const host of [
      `a.${SESSION}.preview.hgdc.cloud`,
      `${SESSION}.evil.ch`,
      "evil.ch",
      "preview.hgdc.cloud.evil.ch",
      "preview.hgdc.cloud@evil",
      "",
      undefined,
    ])
      expect(classifyHost(host, domain)).toEqual({ kind: "invalid" })
  })

  it("ne lit que les messages attendus", () => {
    expect(isPreviewCommand({ type: "theme", theme: "dark" })).toBe(true)
    expect(isPreviewCommand({ type: "theme", theme: "rose" })).toBe(false)
    expect(isPreviewCommand({ type: "navigate", url: "javascript:alert(1)" })).toBe(false)
    expect(isPreviewCommand({ type: "renew", token: "x" })).toBe(false)
    expect(
      isPreviewCommand({ type: "renew", token: `${SESSION}.${GENERATION}.123.nonce12345.${"a".repeat(43)}` }),
    ).toBe(true)
    expect(isPreviewEvent({ type: "location", path: "/guides/", hash: "", title: "Guides" })).toBe(true)
    expect(isPreviewEvent({ type: "location", path: "https://evil.ch/", hash: "", title: "" })).toBe(false)
    expect(isPreviewEvent({ type: "closed" })).toBe(true)
    expect(isPreviewEvent({ type: "closed", path: "/" })).toBe(false)
  })
})
