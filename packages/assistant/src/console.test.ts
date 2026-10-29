import { anyApi, type ApiFromModules } from "convex/server"
import { ConvexError } from "convex/values"
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { TRIFECTA_DETAIL } from "./convex.ts"
import * as surface from "./convex.ts"
import type * as consoleModule from "./fixture/console.ts"
import type * as consoleNode from "./fixture/consoleNode.ts"
import schema from "./fixture/schema.ts"

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>
  }
}

const modules = import.meta.glob("./fixture/**/*.ts")
const api = anyApi as unknown as ApiFromModules<{ console: typeof consoleModule; consoleNode: typeof consoleNode }>
const fn = api.console

const ana = { organizationId: "org_1", userId: "ana" }
const ben = { organizationId: "org_1", userId: "ben" }

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

async function seedDeployment(t: ReturnType<typeof convexTest>, organizationId = "org_1") {
  return await t.run(
    async (ctx) => await ctx.db.insert("deployments", { organizationId, name: "API", status: "ready" }),
  )
}

describe("API de @hgdc/assistant/convex", () => {
  it("le découpage en modules garde exactement les mêmes exports", () => {
    expect(Object.keys(surface).sort()).toEqual(
      [
        "ACTION_TTL_MS",
        "MAX_TEXT",
        "PURGE_BATCH",
        "RESERVE_MICROS",
        "STUCK_AFTER_MS",
        "TRIFECTA_DETAIL",
        "TURN_TEXTS",
        "assistantTables",
        "cancelAction",
        "confirmAction",
        "deleteThread",
        "eraseUser",
        "exportUser",
        "failStuckTurns",
        "finishTurn",
        "listThreads",
        "noteEvent",
        "ownKey",
        "ownThread",
        "progressMessage",
        "purgeIdleThreads",
        "readOnly",
        "readStatus",
        "readThread",
        "removeKey",
        "runProposeTool",
        "runReadTool",
        "runWriteTool",
        "spentMicros",
        "startTurn",
        "storeKey",
        "threadTitle",
        "turnContext",
        "vActionDetail",
        "vActionStatus",
        "vFinishTurn",
        "vMessageStatus",
        "vProgress",
        "vToolChip",
      ].sort(),
    )
  })
})

describe("createConsoleAssistant", () => {
  it("chaque fonction publique passe par la garde ; un collègue ne lit pas la conversation", async () => {
    const t = convexTest(schema, modules)
    expect(await convexMessage(t.query(fn.status, { organizationId: "bloquee", userId: "ana" }))).toBe("Accès refusé.")
    const threadId = await t.mutation(fn.send, { ...ana, text: "Bonjour" })
    expect((await t.query(fn.threads, ana)).map((r) => r._id)).toEqual([threadId])
    expect(await t.query(fn.threads, ben)).toEqual([])
    expect(await convexMessage(t.query(fn.thread, { ...ben, threadId }))).toBe("Introuvable.")
    expect(await convexMessage(t.mutation(fn.remove, { ...ben, threadId }))).toBe("Introuvable.")
  })

  it("l'envoi réserve toujours le tour (clé propre ignorée) et planifie l'action Node avec la page vérifiée", async () => {
    const t = convexTest(schema, modules)
    const deploymentId = await seedDeployment(t)
    const foreign = await seedDeployment(t, "org_2")
    await t.mutation(fn.seedKey, { organizationId: "org_1" })
    expect((await t.query(fn.status, ana)).ownKey).toBeNull()

    const threadId = await t.mutation(fn.send, { ...ana, text: "Et ce déploiement ?", page: { id: deploymentId } })
    const message = await t.query(fn.lastMessage, {})
    expect(message?.reservedMicros).toBeGreaterThan(0)
    const turn = await t.query(fn.context, { messageId: message!._id, organizationId: "org_1" })
    expect(turn).toMatchObject({ sealedKey: null, maxCostMicros: message?.reservedMicros })

    // Une page d'une autre organisation n'ajoute rien.
    await t.mutation(fn.send, { ...ana, text: "Et l'autre ?", page: { id: foreign } })
    const jobs = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect())
    expect(jobs[0]).toMatchObject({ name: "consoleNode:idle" })
    expect(jobs[0]?.args[0]).toMatchObject({
      threadId,
      speaker: ana,
      text: "Et ce déploiement ?\n\n(Page ouverte) Déploiement « API ».",
    })
    expect(jobs[1]?.args[0]).toMatchObject({ text: "Et l'autre ?" })
  })

  it("un outil send ne passe jamais par write ; sa carte porte la mise en garde trifecta ; le clic l'exécute", async () => {
    const t = convexTest(schema, modules)
    const deploymentId = await seedDeployment(t)
    const threadId = await t.mutation(fn.send, { ...ana, text: "Préviens le client." })
    const message = await t.query(fn.lastMessage, {})
    const call = { speaker: ana, threadId, messageId: message!._id }

    expect(await t.query(fn.runRead, { speaker: ana, name: "list_deployments", input: {} })).toContain("API")
    expect(
      await convexMessage(
        t.mutation(fn.runWrite, { ...call, name: "notify_client", input: { deploymentId, text: "Salut" } }),
      ),
    ).toContain("pas un outil « write »")

    await t.mutation(fn.runPropose, {
      ...call,
      name: "notify_client",
      input: { deploymentId, text: "Salut" },
      trifecta: true,
    })
    const view = await t.query(fn.thread, { ...ana, threadId })
    expect(view.actions[0]?.details[0]).toEqual(TRIFECTA_DETAIL)
    expect(view.actions[0]?.details[1]).toEqual({ label: "Texte", value: "Salut" })

    // La mise en garde n'entre pas dans l'empreinte : la carte redécrite au clic reste la même.
    expect(await t.mutation(fn.confirm, { ...ana, actionId: view.actions[0]!._id })).toEqual({
      ok: true,
      message: "Message envoyé.",
    })
    const deployment = await t.run(async (ctx) => await ctx.db.get(deploymentId))
    expect(deployment?.status).toBe("notified")
  })

  it("crons et nLPD : balayage, purge, export et effacement d'une personne", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(fn.send, { ...ana, text: "Bonjour" })
    expect(await t.mutation(fn.sweep, {})).toBe(0)
    expect(await t.mutation(fn.purge, {})).toBe(0)
    expect(await t.query(fn.exportOf, { userId: "ana" })).toHaveLength(1)
    expect(await t.mutation(fn.eraseOf, { userId: "ana" })).toBe(true)
    expect(await t.query(fn.exportOf, { userId: "ana" })).toEqual([])
  })
})

describe("createConsoleRunner", () => {
  it("joue le tour de bout en bout : lecture, carte d'envoi marquée, texte final, coût soldé", async () => {
    const t = convexTest(schema, modules)
    await seedDeployment(t)
    const threadId = await t.mutation(fn.send, { ...ana, text: "Préviens le client." })
    const message = await t.query(fn.lastMessage, {})
    await t.action(api.consoleNode.run, {
      messageId: message!._id,
      threadId,
      text: "Préviens le client.",
      speaker: ana,
    })

    const view = await t.query(fn.thread, { ...ana, threadId })
    const answer = view.messages.at(-1)
    expect(answer).toMatchObject({ status: "done", text: "Carte proposée." })
    expect(answer?.tools.map((c) => c.status)).toEqual(["done", "done"])
    expect(view.actions).toHaveLength(1)
    expect(view.actions[0]).toMatchObject({ tool: "notify_client", status: "pending" })
    expect(view.actions[0]?.details[0]).toEqual(TRIFECTA_DETAIL)
    // Trois étapes à (100 + 50) jetons, à 1 $ par million : 450 micro-dollars.
    expect((await t.query(fn.lastMessage, {}))?.costMicros).toBe(450)
  }, 30_000)

  it("s'arrête après maxSteps appels au modèle", async () => {
    const t = convexTest(schema, modules)
    await seedDeployment(t)
    const threadId = await t.mutation(fn.send, { ...ana, text: "Préviens le client." })
    const message = await t.query(fn.lastMessage, {})
    await t.action(api.consoleNode.runShort, {
      messageId: message!._id,
      threadId,
      text: "Préviens le client.",
      speaker: ana,
    })

    const view = await t.query(fn.thread, { ...ana, threadId })
    expect(view.messages.at(-1)?.text).toContain("beaucoup d'étapes")
    expect(view.actions).toHaveLength(0)
  }, 30_000)
})
