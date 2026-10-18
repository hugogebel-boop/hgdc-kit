import { anyApi, type ApiFromModules } from "convex/server"
import { ConvexError } from "convex/values"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { RESERVE_MICROS, STUCK_AFTER_MS } from "./convex.ts"
import type * as assistant from "./fixture/assistant.ts"
import schema from "./fixture/schema.ts"

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>
  }
}

const modules = import.meta.glob("./fixture/**/*.ts")
const api = anyApi as unknown as ApiFromModules<{ assistant: typeof assistant }>
const fn = api.assistant

const ana = { organizationId: "org_1", userId: "ana" }
const ben = { organizationId: "org_1", userId: "ben" }
const elsewhere = { organizationId: "org_2", userId: "ana" }

function setup() {
  return convexTest(schema, modules)
}
type T = ReturnType<typeof setup>

async function convexMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data
    if (error instanceof Error) return error.message
    throw error
  }
  throw new Error("aucune erreur levée")
}

const done = (messageId: string, costMicros = 400) => ({
  messageId: messageId as never,
  organizationId: "org_1",
  status: "done" as const,
  text: "Voilà.",
  tools: [],
  history: '[{"role":"user","content":"x"}]',
  historyFull: false,
  notesDelivered: 0,
  costMicros,
  inputTokens: 1000,
  outputTokens: 100,
})

async function turn(t: T, who = ana, text = "Bonjour", limit = 300) {
  return await t.mutation(fn.start, { ...who, text, limit, platformKey: true })
}

describe("conversations à la personne", () => {
  it("un collègue ou une autre organisation ne lit, n'écrit ni n'efface rien", async () => {
    const t = setup()
    const { threadId, messageId } = await turn(t)
    await t.mutation(fn.finish, done(messageId))
    expect(await convexMessage(t.query(fn.thread, { ...ben, threadId }))).toBe("Introuvable.")
    expect(await convexMessage(t.query(fn.thread, { ...elsewhere, threadId }))).toBe("Introuvable.")
    expect(
      await convexMessage(t.mutation(fn.start, { ...ben, threadId, text: "Et moi ?", limit: 300, platformKey: true })),
    ).toBe("Introuvable.")
    expect(await convexMessage(t.mutation(fn.remove, { ...ben, threadId }))).toBe("Introuvable.")
    await t.mutation(fn.remove, { ...ana, threadId })
    expect(await convexMessage(t.query(fn.thread, { ...ana, threadId }))).toBe("Introuvable.")
  })
})

describe("crédits", () => {
  it("des tours parallèles ne passent pas tous : la réservation se prend dans la transaction du contrôle", async () => {
    const t = setup()
    // 10 crédits = 100 000 micro-dollars : trois réservations de 30 000 tiennent, pas quatre.
    const outcomes = await Promise.allSettled(
      ["a", "b", "c", "d", "e"].map((u) => turn(t, { organizationId: "org_1", userId: u }, "Salut", 10)),
    )
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(3)
    const [usage] = (await t.query(fn.raw, { table: "assistantUsage" })) as Array<{ reservedMicros: number }>
    expect(usage?.reservedMicros).toBe(3 * RESERVE_MICROS)
  })

  it("la fin d'un tour lève la réservation et débite le coût exact, cumulé en micro-dollars", async () => {
    const t = setup()
    for (let i = 0; i < 3; i++) {
      const { messageId } = await turn(t, ana, `Question ${i}`)
      // 400 micro-dollars par tour : arrondi par tour, il serait perdu.
      await t.mutation(fn.finish, done(messageId, 400))
    }
    const [usage] = (await t.query(fn.raw, { table: "assistantUsage" })) as Array<{
      costMicros: number
      reservedMicros: number
    }>
    expect(usage).toMatchObject({ costMicros: 1200, reservedMicros: 0 })
    expect((await t.query(fn.status, { organizationId: "org_1" })).credits.used).toBe(0.1)
  })

  it("un fil ne s'efface pas pendant une réponse ; une réponse jamais finie garde sa réservation comme coût", async () => {
    const t = setup()
    const { threadId, messageId } = await turn(t)
    expect(await convexMessage(t.mutation(fn.remove, { ...ana, threadId }))).toBe(
      "L'assistant répond encore. Un instant.",
    )
    expect(await t.mutation(fn.sweep, { now: Date.now() + STUCK_AFTER_MS + 60_000 })).toBe(1)
    const [usage] = (await t.query(fn.raw, { table: "assistantUsage" })) as Array<{
      costMicros: number
      reservedMicros: number
    }>
    expect(usage).toMatchObject({ costMicros: RESERVE_MICROS, reservedMicros: 0 })
    // Le tour est soldé : un `finish` tardif ne débite pas deux fois.
    await t.mutation(fn.finish, done(messageId, 999))
    const [after] = (await t.query(fn.raw, { table: "assistantUsage" })) as Array<{ costMicros: number }>
    expect(after?.costMicros).toBe(RESERVE_MICROS)
  })

  it("avec la clé de l'organisation, rien n'est réservé ni débité", async () => {
    const t = setup()
    await t.mutation(fn.saveKey, { organizationId: "org_1", updatedBy: "ana" })
    const { messageId } = await t.mutation(fn.start, { ...ana, text: "Salut", limit: 0, platformKey: false })
    await t.mutation(fn.finish, done(messageId))
    expect(await t.query(fn.raw, { table: "assistantUsage" })).toEqual([])
  })
})

describe("progression", () => {
  it("refuse un recul d'état et une autre organisation", async () => {
    const t = setup()
    const { threadId, messageId } = await turn(t)
    expect(await t.mutation(fn.progress, { messageId, organizationId: "org_2", text: "fuite", tools: [] })).toBe(false)
    expect(await t.mutation(fn.progress, { messageId, organizationId: "org_1", text: "Je regarde", tools: [] })).toBe(
      true,
    )
    await t.mutation(fn.finish, done(messageId))
    expect(await t.mutation(fn.progress, { messageId, organizationId: "org_1", text: "trop tard", tools: [] })).toBe(
      false,
    )
    const view = await t.query(fn.thread, { ...ana, threadId })
    expect(view.messages.at(-1)).toMatchObject({ status: "done", text: "Voilà." })
  })
})

async function proposed(t: T) {
  const deploymentId = await t.mutation(fn.seed, { organizationId: "org_1", name: "site", status: "ready" })
  const { threadId, messageId } = await turn(t, ana, "Redéploie")
  const result = await t.mutation(fn.proposeTool, {
    ...ana,
    threadId,
    messageId,
    name: "redeploy",
    input: { deploymentId },
  })
  const { actionId } = JSON.parse(result) as { actionId: string }
  await t.mutation(fn.finish, done(messageId))
  return { deploymentId, threadId, messageId, actionId: actionId as never }
}

describe("outils imposés par leur classe", () => {
  it("un outil confirm ne passe que par la carte, et la carte ne peut pas écrire", async () => {
    const t = setup()
    const deploymentId = await t.mutation(fn.seed, { organizationId: "org_1", name: "site", status: "ready" })
    const { threadId, messageId } = await turn(t)
    const call = { ...ana, threadId, messageId }
    expect(
      await convexMessage(t.mutation(fn.writeTool, { ...call, name: "redeploy", input: { deploymentId } })),
    ).toContain("pas un outil « write »")
    expect(
      await convexMessage(
        t.mutation(fn.proposeTool, { ...call, name: "rename_deployment", input: { deploymentId, name: "x" } }),
      ),
    ).toContain("pas un outil « confirm »")
    expect(await convexMessage(t.mutation(fn.proposeTool, { ...call, name: "sneaky", input: {} }))).toMatch(/insert/)
    // Un champ inventé par le modèle est refusé avant tout gestionnaire.
    expect(
      await convexMessage(
        t.mutation(fn.writeTool, { ...call, name: "rename_deployment", input: { deploymentId, name: "x", force: 1 } }),
      ),
    ).toContain("Paramètres invalides")
    expect(await t.query(fn.readTool, { ...ana, name: "list_deployments", input: {} })).toContain("site")
    // Une fois le tour fini, plus aucune écriture par l'assistant.
    await t.mutation(fn.finish, done(messageId))
    expect(
      await convexMessage(
        t.mutation(fn.writeTool, { ...call, name: "rename_deployment", input: { deploymentId, name: "x" } }),
      ),
    ).toBe("Introuvable.")
  })
})

describe("cartes à confirmer", () => {
  it("deux confirmations simultanées : une seule exécution", async () => {
    const t = setup()
    const { actionId, deploymentId } = await proposed(t)
    const outcomes = await Promise.allSettled([
      t.mutation(fn.confirm, { ...ana, actionId }),
      t.mutation(fn.confirm, { ...ana, actionId }),
    ])
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1)
    const rejected = outcomes.find((o) => o.status === "rejected")
    expect(rejected && (rejected.reason as ConvexError<string>).data).toBe("Cette action a déjà été traitée.")
    const deployments = (await t.query(fn.raw, { table: "deployments" })) as Array<{ _id: string; status: string }>
    expect(deployments.find((d) => d._id === deploymentId)?.status).toBe("building")
  })

  it("un collègue ne confirme pas ; un contenu changé ou une carte expirée ne s'exécutent pas", async () => {
    const t = setup()
    const first = await proposed(t)
    expect(await convexMessage(t.mutation(fn.confirm, { ...ben, actionId: first.actionId }))).toBe("Introuvable.")
    await t.mutation(fn.setDeployment, { id: first.deploymentId, name: "site-v2" })
    expect(await t.mutation(fn.confirm, { ...ana, actionId: first.actionId })).toEqual({
      ok: false,
      message: "Le contenu a changé depuis la proposition. Relis-le, puis redemande l'action.",
    })

    const second = await proposed(t)
    expect(
      await t.mutation(fn.confirm, { ...ana, actionId: second.actionId, now: Date.now() + 25 * 60 * 60_000 }),
    ).toMatchObject({ ok: false, message: "Cette proposition a expiré. Redemande-la." })
  })

  it("le résultat revient au modèle comme événement de l'application, au tour suivant", async () => {
    const t = setup()
    const { actionId, threadId } = await proposed(t)
    await t.mutation(fn.confirm, { ...ana, actionId })
    const next = await t.mutation(fn.start, { ...ana, threadId, text: "Merci", limit: 300, platformKey: true })
    const context = await t.query(fn.context, { messageId: next.messageId, organizationId: "org_1" })
    expect(context?.notes).toEqual([expect.stringContaining("La personne a confirmé : Redéployer « site »")])
    await t.mutation(fn.finish, { ...done(next.messageId), notesDelivered: 1 })
    const again = await t.mutation(fn.start, { ...ana, threadId, text: "Et ?", limit: 300, platformKey: true })
    expect((await t.query(fn.context, { messageId: again.messageId, organizationId: "org_1" }))?.notes).toEqual([])
  })

  it("un refus métier passe la carte en échec ; une annulation est notée", async () => {
    const t = setup()
    const first = await proposed(t)
    await t.mutation(fn.setDeployment, { id: first.deploymentId, status: "archived" })
    // La carte montre l'état : l'archivage la rend obsolète avant même l'exécution.
    expect((await t.mutation(fn.confirm, { ...ana, actionId: first.actionId })).ok).toBe(false)
    const second = await proposed(t)
    await t.mutation(fn.cancel, { ...ana, actionId: second.actionId })
    const view = await t.query(fn.thread, { ...ana, threadId: second.threadId })
    expect(view.actions[0]?.status).toBe("cancelled")
  })
})

describe("nLPD", () => {
  it("export avec les cartes, effacement par lots, clé anonymisée", async () => {
    const t = setup()
    await proposed(t)
    for (let i = 0; i < 2; i++) await t.mutation(fn.finish, done((await turn(t, ana, `Q${i}`)).messageId))
    await t.mutation(fn.saveKey, { organizationId: "org_1", updatedBy: "ana" })
    const exported = await t.query(fn.exportOf, { userId: "ana" })
    expect(exported).toHaveLength(3)
    expect(exported.some((thread) => thread.actions.length === 1)).toBe(true)
    expect(await t.mutation(fn.erase, { userId: "ana", limit: 2 })).toEqual({ erased: 2, done: false })
    expect(await t.mutation(fn.erase, { userId: "ana", limit: 2 })).toEqual({ erased: 1, done: true })
    const keys = (await t.query(fn.raw, { table: "assistantKeys" })) as Array<{ updatedBy: string }>
    expect(keys[0]?.updatedBy).toBe("personne-effacee")
  })
})
