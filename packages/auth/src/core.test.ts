import { describe, expect, it } from "vitest"

import {
  applyCoreEvent,
  coreEventSchema,
  coreLogoUrl,
  coreNameSchema,
  coreProjectDomainsPath,
  fetchCoreSnapshot,
  handleCoreEventRequest,
  listCoreProjects,
  planMembershipReconcile,
  coreSnapshotSchema,
  purgeCoreCopy,
  purgeCoreTombstones,
  reconcileCoreCopy,
  runCoreRound,
  signCoreCall,
  signCoreEvent,
  verifyCoreCall,
  CORE_TOMBSTONE_RETENTION_MS,
  type CoreEvent,
  type CoreSnapshot,
} from "./core.ts"
import { signAccountEvent, verifyAccountEvent } from "./events.ts"

const SECRET = "s".repeat(32)
const NOW = 1_800_000_000_000
const project = { id: "p1", slug: "site", name: "Site", kind: "hosted", modules: ["host", "status"] } as const
const changed = (occurredAt = NOW): CoreEvent => ({
  id: "e".repeat(32),
  type: "project.changed",
  occurredAt,
  organizationId: "o1",
  project: { ...project, modules: [...project.modules] },
})

type Row = Record<string, unknown> & { _id: number }
type Range = {
  eq: (field: string, value: unknown) => Range
  gt: (field: string, value: number) => Range
  lt: (field: string, value: number) => Range
}

/** La part de la base Convex que `applyCoreEvent` emploie. */
function fakeDb() {
  const tables: Record<string, Array<Row>> = { coreProjects: [], coreBrandings: [] }
  let next = 1
  const find = (id: number) => Object.values(tables).find((rows) => rows.some((row) => row._id === id))
  return {
    tables,
    db: {
      query: (table: string) => ({
        withIndex: (_: string, range: (q: Range) => unknown) => {
          const tests: Array<(row: Row) => boolean> = []
          const q: Range = {
            eq: (f, value) => {
              tests.push((row) => row[f] === value)
              return q
            },
            gt: (f, value) => {
              tests.push((row) => typeof row[f] === "number" && (row[f] as number) > value)
              return q
            },
            lt: (f, value) => {
              tests.push((row) => typeof row[f] === "number" && (row[f] as number) < value)
              return q
            },
          }
          range(q)
          const rows = () => tables[table]!.filter((row) => tests.every((test) => test(row)))
          return { first: async () => rows()[0] ?? null, take: async (count: number) => rows().slice(0, count) }
        },
      }),
      patch: async (id: number, value: Record<string, unknown>) => {
        const rows = find(id)!
        const index = rows.findIndex((row) => row._id === id)
        rows[index] = { ...rows[index]!, ...value }
      },
      insert: async (table: string, value: Record<string, unknown>) => {
        tables[table]!.push({ ...value, _id: next++ })
      },
      replace: async (id: number, value: Record<string, unknown>) => {
        const rows = find(id)!
        rows[rows.findIndex((row) => row._id === id)] = { ...value, _id: id }
      },
      delete: async (id: number) => {
        const rows = find(id)!
        rows.splice(
          rows.findIndex((row) => row._id === id),
          1,
        )
      },
    },
  }
}

const requestFor = (signed: { body: string; headers: Record<string, string> }) =>
  new Request("https://module.test/hgdc/v1/core-events", { method: "POST", body: signed.body, headers: signed.headers })

describe("copie locale du cœur", () => {
  it("crée puis remplace le projet, et ignore un événement plus ancien", async () => {
    const { db, tables } = fakeDb()
    expect(await applyCoreEvent({ db }, changed(NOW))).toBe("applied")
    expect(tables.coreProjects).toHaveLength(1)
    expect(tables.coreProjects![0]).toMatchObject({ projectId: "p1", organizationId: "o1", syncedAt: NOW })
    expect(await applyCoreEvent({ db }, changed(NOW - 1))).toBe("stale")
    expect(tables.coreProjects![0]!.syncedAt).toBe(NOW)
  })

  it("rejouer le même événement ne change rien", async () => {
    const { db, tables } = fakeDb()
    await applyCoreEvent({ db }, changed())
    await applyCoreEvent({ db }, changed())
    expect(tables.coreProjects).toHaveLength(1)
  })

  it("efface un projet retiré, et refuse un projet d'une autre organisation", async () => {
    const { db } = fakeDb()
    await applyCoreEvent({ db }, changed())
    await expect(applyCoreEvent({ db }, { ...changed(NOW + 1), organizationId: "o2" })).rejects.toThrow(
      "autre organisation",
    )
    await applyCoreEvent(
      { db },
      { id: "r".repeat(32), type: "project.removed", occurredAt: NOW + 1, organizationId: "o1", projectId: "p1" },
    )
    expect(await listCoreProjects({ db }, "o1")).toEqual([])
  })

  it("un changement en retard ne fait pas revenir un projet retiré", async () => {
    const { db } = fakeDb()
    const removed = {
      id: "r".repeat(32),
      type: "project.removed",
      occurredAt: NOW + 5,
      organizationId: "o1",
      projectId: "p1",
    } as const
    await applyCoreEvent({ db }, changed(NOW))
    await applyCoreEvent({ db }, removed)
    expect(await applyCoreEvent({ db }, changed(NOW + 1))).toBe("stale")
    expect(await listCoreProjects({ db }, "o1")).toEqual([])
  })

  it("même si le retrait arrive avant tout le reste", async () => {
    const { db } = fakeDb()
    await applyCoreEvent(
      { db },
      { id: "r".repeat(32), type: "project.removed", occurredAt: NOW + 5, organizationId: "o1", projectId: "p1" },
    )
    expect(await applyCoreEvent({ db }, changed(NOW))).toBe("stale")
    expect(await listCoreProjects({ db }, "o1")).toEqual([])
  })

  it("un projet réactivé après son retrait revient", async () => {
    const { db } = fakeDb()
    await applyCoreEvent(
      { db },
      { id: "r".repeat(32), type: "project.removed", occurredAt: NOW, organizationId: "o1", projectId: "p1" },
    )
    await applyCoreEvent({ db }, changed(NOW + 1))
    expect((await listCoreProjects({ db }, "o1")).map((row) => row.id)).toEqual(["p1"])
  })

  it("purge les traces anciennes seulement, et toute la copie d'une organisation supprimée", async () => {
    const { db, tables } = fakeDb()
    await applyCoreEvent(
      { db },
      { id: "r".repeat(32), type: "project.removed", occurredAt: NOW, organizationId: "o1", projectId: "p1" },
    )
    expect(await purgeCoreTombstones({ db }, NOW + 1000)).toBe(0)
    expect(await purgeCoreTombstones({ db }, NOW + CORE_TOMBSTONE_RETENTION_MS + 1)).toBe(1)
    await applyCoreEvent({ db }, changed(NOW))
    await applyCoreEvent(
      { db },
      { id: "b".repeat(32), type: "branding.changed", occurredAt: NOW, organizationId: "o1", branding: {} },
    )
    await purgeCoreCopy({ db }, "o1")
    expect(tables.coreProjects).toHaveLength(0)
    expect(tables.coreBrandings).toHaveLength(0)
  })

  it("tient une personnalisation par organisation", async () => {
    const { db, tables } = fakeDb()
    const event = (color: string, occurredAt: number): CoreEvent => ({
      id: "b".repeat(32),
      type: "branding.changed",
      occurredAt,
      organizationId: "o1",
      branding: { color },
    })
    await applyCoreEvent({ db }, event("#112233", NOW))
    await applyCoreEvent({ db }, event("#445566", NOW + 1))
    expect(tables.coreBrandings).toHaveLength(1)
    expect(tables.coreBrandings![0]!.color).toBe("#445566")
  })
})

describe("schéma", () => {
  it("refuse un logo hors https, et une couleur mal écrite", () => {
    const base = { id: "e".repeat(32), occurredAt: NOW, organizationId: "o1" }
    const branding = (value: object) =>
      coreEventSchema.safeParse({ ...base, type: "branding.changed", branding: value })
    expect(branding({ logoUrl: "http://x.test/a.png" }).success).toBe(false)
    expect(branding({ color: "red" }).success).toBe(false)
    expect(branding({ logoUrl: "https://x.test/a.png", color: "#aabbcc" }).success).toBe(true)
  })
})

describe("endpoint du module", () => {
  const handle = (request: Request, now = NOW, seen: Array<CoreEvent> = []) =>
    handleCoreEventRequest(request, {
      audience: "status",
      secret: SECRET,
      now,
      apply: async (event) => {
        seen.push(event)
        return "applied"
      },
    })

  it("applique un événement bien signé", async () => {
    const seen: Array<CoreEvent> = []
    const signed = await signCoreEvent(changed(), { secret: SECRET, now: NOW, audience: "status" })
    const response = await handle(requestFor(signed), NOW, seen)
    expect(response.status).toBe(200)
    expect(seen).toHaveLength(1)
  })

  it("refuse une autre audience, une signature fausse et une requête périmée", async () => {
    const other = await signCoreEvent(changed(), { secret: SECRET, now: NOW, audience: "mail" })
    expect((await handle(requestFor(other))).status).toBe(401)
    const signed = await signCoreEvent(changed(), { secret: SECRET, now: NOW, audience: "status" })
    const forged = { ...signed, body: signed.body.replace('"Site"', '"Autre"') }
    expect((await handle(requestFor(forged))).status).toBe(401)
    expect((await handle(requestFor(signed), NOW + 301_000)).status).toBe(401)
  })

  it("répond 503 sans secret, pour que le cœur réessaie", async () => {
    const signed = await signCoreEvent(changed(), { secret: SECRET, now: NOW, audience: "status" })
    const response = await handleCoreEventRequest(requestFor(signed), {
      audience: "status",
      secret: undefined,
      apply: async () => "applied",
    })
    expect(response.status).toBe(503)
  })

  it("une signature d'une route ne vaut pas sur l'autre", async () => {
    const event = { id: "e".repeat(32), type: "organization.deleted", occurredAt: NOW, organizationId: "o1" } as const
    const account = await signAccountEvent(event, { secret: SECRET, now: NOW, audience: "status" })
    expect((await handle(requestFor(account))).status).toBe(401)
    const core = await signCoreEvent(changed(), { secret: SECRET, now: NOW, audience: "status" })
    const verified = await verifyAccountEvent(requestFor(core), { secret: SECRET, now: NOW, audience: "status" })
    expect(verified.ok).toBe(false)
  })
})

describe("relecture du cœur", () => {
  const snapshot = (readAt: number, ...ids: Array<string>): CoreSnapshot => ({
    readAt,
    projects: ids.map((id) => ({ ...project, id, modules: [...project.modules] })),
    branding: {},
  })

  it("ajoute ce qui manque et marque ce qui n'existe plus", async () => {
    const { db } = fakeDb()
    await applyCoreEvent({ db }, changed(NOW))
    await reconcileCoreCopy({ db }, "o1", snapshot(NOW + 10, "p2"))
    expect((await listCoreProjects({ db }, "o1")).map((row) => row.id)).toEqual(["p2"])
  })

  it("une lecture plus ancienne qu'un retrait ne fait pas revenir le projet", async () => {
    const { db } = fakeDb()
    await applyCoreEvent(
      { db },
      { id: "r".repeat(32), type: "project.removed", occurredAt: NOW + 50, organizationId: "o1", projectId: "p1" },
    )
    await reconcileCoreCopy({ db }, "o1", snapshot(NOW, "p1"))
    expect(await listCoreProjects({ db }, "o1")).toEqual([])
  })

  it("une lecture plus ancienne qu'un changement le garde", async () => {
    const { db, tables } = fakeDb()
    await applyCoreEvent({ db }, changed(NOW + 50))
    await reconcileCoreCopy({ db }, "o1", snapshot(NOW))
    expect(tables.coreProjects![0]!.removedAt).toBeUndefined()
  })

  it("ne crée pas de doublon pour un projet déjà marqué dans une autre organisation", async () => {
    const { db, tables } = fakeDb()
    await applyCoreEvent(
      { db },
      { id: "r".repeat(32), type: "project.removed", occurredAt: NOW, organizationId: "o0", projectId: "p1" },
    )
    await reconcileCoreCopy({ db }, "o1", snapshot(NOW + 1, "p1"))
    expect(tables.coreProjects).toHaveLength(1)
    expect((await listCoreProjects({ db }, "o1")).map((row) => row.id)).toEqual(["p1"])
  })
})

describe("lecture signée", () => {
  const read = (response: Response, now = NOW) =>
    fetchCoreSnapshot({
      baseUrl: "https://id.test",
      product: "status",
      secret: SECRET,
      organizationId: "o1",
      now,
      fetcher: (async () => response) as unknown as typeof fetch,
    })

  it("signe la route, le produit et un nonce neuf", async () => {
    const options = { product: "status", secret: SECRET, method: "GET", path: "/a", body: "", now: NOW } as const
    const [first, second] = [await signCoreCall(options), await signCoreCall(options)]
    expect(first["x-hgdc-product"]).toBe("status")
    expect(first["x-hgdc-signature"]).toMatch(/^v2=[0-9a-f]{64}$/)
    expect(first["x-hgdc-nonce"]).not.toBe(second["x-hgdc-nonce"])
    await expect(signCoreCall({ ...options, secret: "court" })).rejects.toThrow("Secret")
  })

  it("ignore un mot de module ou un champ inconnus, pour suivre une version plus récente d'ID", async () => {
    const body = {
      readAt: NOW,
      branding: { nouveau: 1 },
      projects: [{ ...project, modules: ["host", "futur"], plus: 1 }],
    }
    const result = await read(new Response(JSON.stringify(body)))
    expect(result.projects[0]).toEqual({ ...project, modules: ["host"] })
    expect(result.branding).toEqual({})
  })

  it("lève une erreur à message fixe, et garde donc la copie, sur tout ce qui ne va pas", async () => {
    await expect(read(new Response("{}", { status: 404 }))).rejects.toThrow("organisation inconnue (404)")
    await expect(read(new Response("<html>secret"))).rejects.toThrow(/^Cœur de Basalte : réponse illisible\.$/)
    await expect(read(new Response('{"readAt":"x"}'))).rejects.toThrow("réponse invalide")
    const future = JSON.stringify({ readAt: NOW + 3_600_000, projects: [], branding: {} })
    await expect(read(new Response(future))).rejects.toThrow("futur")
  })
})

describe("adresse d'un logo", () => {
  it("n'accepte qu'une adresse https publique et normale", () => {
    expect(coreLogoUrl("https://cdn.example.ch/logo.png")).toBe("https://cdn.example.ch/logo.png")
    for (const bad of [
      "http://cdn.example.ch/a.png",
      "https://169.254.169.254/latest",
      "https://127.0.0.1/",
      "https://[::1]/",
      "https://localhost/",
      "https://10.0.0.1/",
      "https://0x7f.0.0.1/",
      "https://user:pw@cdn.example.ch/a.png",
      "https://cdn.example.ch:8443/a.png",
      "https://cdn.example.ch/a.png#x",
      "https://machine.tail1.ts.net/a.png",
      "https://serveur.internal/a.png",
      "HTTPS://CDN.example.ch/a.png",
      "https:\\\\cdn.example.ch\\a.png",
      "javascript:alert(1)",
    ])
      expect(coreLogoUrl(bad), bad).toBeNull()
  })
})

describe("verifyCoreCall", () => {
  const path = coreProjectDomainsPath("o1", "p1")
  const signed = () => signCoreCall({ product: "status", secret: SECRET, method: "GET", path, body: "", now: NOW })
  const verify = async (
    headers: Record<string, string>,
    overrides: Partial<Parameters<typeof verifyCoreCall>[1]> = {},
  ) =>
    await verifyCoreCall(new Headers(headers), {
      method: "GET",
      path,
      body: "",
      secrets: { status: SECRET },
      now: NOW,
      ...overrides,
    })

  it("accepte un appel signé et rend le produit et le nonce", async () => {
    const headers = await signed()
    expect(await verify(headers)).toEqual({ product: "status", nonce: headers["x-hgdc-nonce"] })
  })

  it("refuse une autre route, un autre corps, un secret faux ou un produit non prévu", async () => {
    const headers = await signed()
    expect(await verify(headers, { path: coreProjectDomainsPath("o2", "p1") })).toBeNull()
    expect(await verify(headers, { method: "POST" })).toBeNull()
    expect(await verify(headers, { body: "x" })).toBeNull()
    expect(await verify(headers, { secrets: { status: "t".repeat(32) } })).toBeNull()
    expect(await verify(headers, { secrets: { mail: SECRET } })).toBeNull()
    expect(await verify(headers, { secrets: { status: undefined } })).toBeNull()
    expect(await verify(headers, { secrets: { status: "court" } })).toBeNull()
    expect(await verify({ ...headers, "x-hgdc-product": "constructor" })).toBeNull()
  })

  it("refuse un appel hors de la fenêtre ou mal formé", async () => {
    const headers = await signed()
    expect(await verify(headers, { now: NOW + 3_600_000 })).toBeNull()
    expect(await verify({ ...headers, "x-hgdc-nonce": "court" })).toBeNull()
    expect(await verify({ ...headers, "x-hgdc-timestamp": "abc" })).toBeNull()
    expect(await verify({})).toBeNull()
  })
})

describe("revue du cœur", () => {
  it("ne laisse pas des traces cacher un projet en ligne", async () => {
    const { db, tables } = fakeDb()
    for (let index = 0; index < 1000; index++)
      await db.insert("coreProjects", { organizationId: "o1", projectId: `t${index}`, syncedAt: NOW, removedAt: NOW })
    await applyCoreEvent({ db }, changed())
    expect((await listCoreProjects({ db }, "o1")).map((row) => row.id)).toEqual(["p1"])
    await purgeCoreCopy({ db }, "o1")
    expect(tables.coreProjects!.filter((row) => row.removedAt === undefined)).toEqual([])
  })

  it("refuse un logo dont l'hôte finit par un point et un nom avec un séparateur de ligne", () => {
    expect(coreLogoUrl("https://localhost./a.png")).toBeNull()
    expect(coreLogoUrl("https://metadata.google.internal./a.png")).toBeNull()
    expect(coreNameSchema.safeParse("Un\u2028deux").success).toBe(false)
    expect(coreNameSchema.safeParse("Un\u2029deux").success).toBe(false)
  })
})

describe("runCoreRound", () => {
  const snapshot = { readAt: Date.now() - 1000, projects: [], branding: {} }
  const base = { product: "status", secret: SECRET, baseUrl: "https://coeur.exemple" } as const

  it("écrit chaque organisation de chaque page", async () => {
    const written: Array<string> = []
    const fetcher = (async () => Response.json(snapshot)) as unknown as typeof fetch
    const pages: Record<string, { organizationIds: Array<string>; cursor: string | null }> = {
      start: { organizationIds: ["a", "b"], cursor: "suite" },
      suite: { organizationIds: ["c"], cursor: null },
    }
    const result = await runCoreRound({
      ...base,
      fetcher,
      nextPage: async (cursor) => pages[cursor ?? "start"]!,
      write: async (organizationId) => void written.push(organizationId),
    })
    expect(written).toEqual(["a", "b", "c"])
    expect(result).toEqual({ failures: 0, missing: 0, lastFailure: null, stopped: false })
  })

  it("s'arrête après trop d'échecs de suite, sans rien écrire", async () => {
    let calls = 0
    const fetcher = (async () => {
      calls += 1
      return new Response(null, { status: 503 })
    }) as unknown as typeof fetch
    const write = async () => {
      throw new Error("jamais")
    }
    const result = await runCoreRound({
      ...base,
      fetcher,
      maxFailuresInARow: 2,
      nextPage: async () => ({ organizationIds: ["a", "b", "c", "d"], cursor: null }),
      write,
    })
    expect(calls).toBe(2)
    expect(result.stopped).toBe(true)
    expect(result.failures).toBe(2)
  })

  it("passe une organisation inconnue du cœur sans la compter comme un échec", async () => {
    const written: Array<string> = []
    const fetcher = (async (url: string) =>
      url.includes("/supprimee-")
        ? new Response(null, { status: 404 })
        : Response.json(snapshot)) as unknown as typeof fetch
    const result = await runCoreRound({
      ...base,
      fetcher,
      maxFailuresInARow: 2,
      nextPage: async () => ({
        organizationIds: ["supprimee-1", "supprimee-2", "supprimee-3", "vivante"],
        cursor: null,
      }),
      write: async (organizationId) => void written.push(organizationId),
    })
    expect(written).toEqual(["vivante"])
    expect(result).toEqual({ failures: 0, missing: 3, lastFailure: null, stopped: false })
  })
})

describe("planMembershipReconcile", () => {
  type Row = { id: string; syncedAt?: number }
  const u1: Row = { id: "u1", syncedAt: NOW - 10 }
  const u2: Row = { id: "u2", syncedAt: NOW - 10 }
  const recent: Row = { id: "u3", syncedAt: NOW + 10 }
  const undated: Row = { id: "u4" }
  const unlinked: Row = { id: "u5", syncedAt: NOW - 10 }
  const rows = [
    { row: u1, sub: "sub-1" },
    { row: u2, sub: "sub-2" },
    { row: recent, sub: "sub-3" },
    { row: undated, sub: "sub-4" },
    { row: unlinked, sub: null },
  ]
  const members = [{ userId: "sub-1", role: "member" as const }]

  it("retire qui n’est plus membre, rend le rôle du cœur à qui l’est encore", () => {
    const plan = planMembershipReconcile(rows, { readAt: NOW, members })
    expect(plan?.removed).toEqual([u2, undated])
    expect(plan?.kept).toEqual([{ row: u1, role: "member" }])
  })

  it("ne retire jamais une appartenance sans compte connu chez ID", () => {
    const plan = planMembershipReconcile(rows, { readAt: NOW, members })
    expect(plan?.removed).not.toContain(unlinked)
  })

  it("laisse une appartenance confirmée après la lecture, à la milliseconde près", () => {
    const edge: Row = { id: "u6", syncedAt: NOW }
    const plan = planMembershipReconcile([...rows, { row: edge, sub: "sub-6" }], { readAt: NOW, members })
    expect(plan?.removed).not.toContain(recent)
    expect(plan?.kept.some(({ row }) => row === recent)).toBe(false)
    expect(plan?.removed).toContain(edge)
  })

  it("ne fait rien sans liste, avec une liste vide, ou si personne ne correspond", () => {
    expect(planMembershipReconcile(rows, { readAt: NOW })).toBeNull()
    expect(planMembershipReconcile(rows, { readAt: NOW, members: [] })).toBeNull()
    const strangers = [{ userId: "sub-inconnu", role: "owner" as const }]
    expect(planMembershipReconcile(rows, { readAt: NOW, members: strangers })).toBeNull()
  })

  it("une appartenance récente qui figure dans la liste suffit à prouver que la liste est la bonne", () => {
    const plan = planMembershipReconcile(rows, { readAt: NOW, members: [{ userId: "sub-3", role: "owner" }] })
    expect(plan?.removed).toEqual([u1, u2, undated])
    expect(plan?.kept).toEqual([])
  })

  it("sans appartenance locale comparable, il n’y a rien à faire ni à refuser", () => {
    expect(planMembershipReconcile([{ row: unlinked, sub: null }], { readAt: NOW, members })).toEqual({
      removed: [],
      kept: [],
    })
  })

  it("le schéma accepte un instantané sans membres ; une liste illisible vaut pas de liste", () => {
    const base = { readAt: NOW, projects: [], branding: {} }
    expect(coreSnapshotSchema.parse(base).members).toBeUndefined()
    expect(coreSnapshotSchema.parse({ ...base, members }).members).toEqual(members)
    expect(coreSnapshotSchema.parse({ ...base, members: [{ userId: "s", role: "root" }] }).members).toBeUndefined()
    const tooMany = Array.from({ length: 1001 }, (_, n) => ({ userId: `s${n}`, role: "member" }))
    expect(coreSnapshotSchema.parse({ ...base, members: tooMany }).members).toBeUndefined()
  })
})
