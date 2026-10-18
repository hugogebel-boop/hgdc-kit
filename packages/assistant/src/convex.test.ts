import {
  defineSchema,
  defineTable,
  type DataModelFromSchemaDefinition,
  type GenericMutationCtx,
  type GenericQueryCtx,
} from "convex/server"
import { ConvexError, v } from "convex/values"
import { beforeEach, describe, expect, it } from "vitest"

import {
  assistantTables,
  cancelAction,
  confirmAction,
  deleteThread,
  failStuckTurns,
  finishTurn,
  listThreads,
  proposeAction,
  readStatus,
  readThread,
  startTurn,
  storeKey,
  threadTitle,
  type ActionId,
  type AssistantWriter,
  type MessageId,
  type Speaker,
  type ThreadId,
} from "./convex.ts"

// ── Le ctx d'un produit passe tel quel : schéma du produit = tables de l'assistant + les siennes ──

const appSchema = defineSchema({ ...assistantTables(), projects: defineTable({ name: v.string() }) })
type AppDataModel = DataModelFromSchemaDefinition<typeof appSchema>

export async function productWiring(
  mutationCtx: GenericMutationCtx<AppDataModel>,
  queryCtx: GenericQueryCtx<AppDataModel>,
): Promise<void> {
  const speaker = { organizationId: "org_1", userId: "user_1" }
  await startTurn(mutationCtx, speaker, { text: "Bonjour", limit: 300, platformKey: true })
  await readStatus(queryCtx, "org_1", { limit: 300, platformKey: true })
}

// ── Base en mémoire : juste ce que les fonctions utilisent (index, eq, lt, ordre, take) ──

const INDEXES: Record<string, string[]> = {
  by_org_user: ["organizationId", "userId", "updatedAt"],
  by_user: ["userId"],
  by_updated: ["updatedAt"],
  by_thread: ["threadId"],
  by_status: ["status"],
  by_org_month: ["organizationId", "month"],
  by_org: ["organizationId"],
}

type Row = Record<string, unknown> & { _id: string; _creationTime: number }

class FakeDb {
  rows = new Map<string, Row>()
  private seq = 0
  clock = Date.now()

  async get(id: string): Promise<Row | null> {
    return this.rows.get(id) ?? null
  }
  async insert(table: string, doc: Record<string, unknown>): Promise<string> {
    const id = `${table}|${++this.seq}`
    this.rows.set(id, { ...doc, _id: id, _creationTime: this.clock++ })
    return id
  }
  async patch(id: string, fields: Record<string, unknown>): Promise<void> {
    const row = this.rows.get(id)
    if (!row) throw new Error(`absent : ${id}`)
    this.rows.set(id, { ...row, ...fields })
  }
  async delete(id: string): Promise<void> {
    this.rows.delete(id)
  }
  query(table: string) {
    let rows = [...this.rows.values()].filter((r) => r._id.startsWith(`${table}|`))
    let desc = false
    const builder = {
      withIndex: (name: string, range: (q: Record<string, unknown>) => unknown) => {
        const fields = [...(INDEXES[name] ?? []), "_creationTime"]
        const checks: Array<(r: Row) => boolean> = []
        const q = {
          eq: (field: string, value: unknown) => {
            checks.push((r) => r[field] === value)
            return q
          },
          lt: (field: string, value: number) => {
            checks.push((r) => (r[field] as number) < value)
            return q
          },
        }
        range(q)
        rows = rows
          .filter((r) => checks.every((c) => c(r)))
          .sort((a, b) => {
            for (const f of fields) {
              const x = a[f] as string | number
              const y = b[f] as string | number
              if (x !== y) return x < y ? -1 : 1
            }
            return 0
          })
        return builder
      },
      order: (direction: "asc" | "desc") => {
        desc = direction === "desc"
        return builder
      },
      first: async () => (desc ? rows.at(-1) : rows[0]) ?? null,
      take: async (n: number) => (desc ? [...rows].reverse() : rows).slice(0, n),
      collect: async () => (desc ? [...rows].reverse() : rows),
    }
    return builder
  }
}

let db: FakeDb
let ctx: AssistantWriter
const ana: Speaker = { organizationId: "org_1", userId: "ana" }
const ben: Speaker = { organizationId: "org_1", userId: "ben" }
const elsewhere: Speaker = { organizationId: "org_2", userId: "ana" }

beforeEach(() => {
  db = new FakeDb()
  ctx = { db } as unknown as AssistantWriter
})

async function convexMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data
    throw error
  }
  throw new Error("aucune erreur levée")
}

describe("startTurn", () => {
  it("écrit la demande et la réponse en attente, dans une conversation à la personne", async () => {
    const { threadId, messageId, text } = await startTurn(ctx, ana, {
      text: "  Où en sont mes déploiements ?  ",
      limit: 300,
      platformKey: true,
    })
    expect(text).toBe("Où en sont mes déploiements ?")
    expect((await db.get(messageId))?.status).toBe("pending")
    expect(await listThreads(ctx, ana)).toEqual([
      expect.objectContaining({ _id: threadId, title: "Où en sont mes déploiements ?" }),
    ])
    expect(await listThreads(ctx, ben)).toEqual([])
    // Un collègue ou la même personne dans une autre organisation : introuvable.
    expect(await convexMessage(readThread(ctx, ben, threadId))).toBe("Introuvable.")
    expect(await convexMessage(readThread(ctx, elsewhere, threadId))).toBe("Introuvable.")
    expect(
      await convexMessage(startTurn(ctx, ben, { threadId, text: "Et moi ?", limit: 300, platformKey: true })),
    ).toBe("Introuvable.")
  })

  it("refuse une demande vide, trop longue, pendant une réponse, sans clé ni crédits", async () => {
    expect(await convexMessage(startTurn(ctx, ana, { text: "  ", limit: 300, platformKey: true }))).toBe(
      "Écris ta demande.",
    )
    expect(
      await convexMessage(startTurn(ctx, ana, { text: "x".repeat(4001), limit: 300, platformKey: true })),
    ).toContain("4000")
    expect(await convexMessage(startTurn(ctx, ana, { text: "Salut", limit: 300, platformKey: false }))).toContain(
      "pas encore branché",
    )
    const { threadId } = await startTurn(ctx, ana, { text: "Salut", limit: 300, platformKey: true })
    expect(await convexMessage(startTurn(ctx, ana, { threadId, text: "Encore", limit: 300, platformKey: true }))).toBe(
      "L'assistant répond encore. Un instant.",
    )

    await finishTurn(ctx, {
      threadId,
      organizationId: "org_1",
      history: "[]",
      credits: 300,
      inputTokens: 1,
      outputTokens: 1,
      charge: true,
    })
    expect(await convexMessage(startTurn(ctx, ben, { text: "Salut", limit: 300, platformKey: true }))).toContain(
      "crédits du mois",
    )
    // La clé de l'organisation lève la limite.
    await storeKey(ctx, { organizationId: "org_1", sealed: "v1.a.b", hint: "abcd", updatedBy: "ana" })
    await expect(startTurn(ctx, ben, { text: "Salut", limit: 300, platformKey: false })).resolves.toBeTruthy()
    expect(await readStatus(ctx, "org_1", { limit: 300, platformKey: false })).toMatchObject({
      ready: true,
      ownKey: { hint: "abcd" },
      credits: { used: 300, limit: 300 },
    })
  })

  it("une réponse bloquée depuis plus de 11 minutes ne bloque plus la conversation", async () => {
    const { threadId } = await startTurn(ctx, ana, { text: "Salut", limit: 300, platformKey: true })
    const later = db.clock + 12 * 60_000
    await expect(
      startTurn(ctx, ana, { threadId, text: "Tu es là ?", limit: 300, platformKey: true, now: later }),
    ).resolves.toBeTruthy()
    expect(await failStuckTurns(ctx, { now: later + 12 * 60_000 })).toBe(2)
  })

  it("garde le profil d'une conversation (équipe ou client)", async () => {
    const { threadId } = await startTurn(ctx, ana, { text: "Salut", limit: 300, platformKey: true, mode: "client" })
    expect(await convexMessage(readThread(ctx, ana, threadId, "team"))).toBe("Introuvable.")
    await expect(readThread(ctx, ana, threadId, "client")).resolves.toBeTruthy()
  })
})

async function pendingCard(): Promise<{ threadId: ThreadId; messageId: MessageId; actionId: ActionId }> {
  const { threadId, messageId } = await startTurn(ctx, ana, { text: "Redéploie", limit: 300, platformKey: true })
  const actionId = await proposeAction(ctx, {
    threadId,
    messageId,
    organizationId: "org_1",
    tool: "redeploy",
    input: { deploymentId: "d1" },
    summary: "Redéployer « site »",
    details: [{ label: "Projet", value: "site" }],
  })
  return { threadId, messageId, actionId }
}

describe("cartes à confirmer", () => {
  it("n'exécute qu'au clic de la personne, une seule fois, et le note pour le modèle", async () => {
    const { threadId, actionId } = await pendingCard()
    const view = await readThread(ctx, ana, threadId)
    expect(view.actions[0]).toMatchObject({ status: "pending", details: [{ label: "Projet", value: "site" }] })
    expect(view.actions[0]).not.toHaveProperty("input")

    expect(await convexMessage(confirmAction(ctx, ben, actionId, async () => "fait"))).toBe("Introuvable.")
    const outcome = await confirmAction(ctx, ana, actionId, async (action) => {
      expect(action.input).toEqual({ deploymentId: "d1" })
      return "Déploiement relancé."
    })
    expect(outcome).toEqual({ ok: true, message: "Déploiement relancé." })
    expect(await convexMessage(confirmAction(ctx, ana, actionId, async () => "encore"))).toBe(
      "Cette action a déjà été traitée.",
    )
    const thread = await db.get(threadId)
    expect(String(thread?.history)).toContain("La personne a confirmé : Redéployer « site »")
  })

  it("un refus métier passe la carte en échec ; une autre erreur remonte", async () => {
    const first = await pendingCard()
    expect(
      await confirmAction(ctx, ana, first.actionId, async () => {
        throw new ConvexError("Le projet est archivé.")
      }),
    ).toEqual({ ok: false, message: "Le projet est archivé." })
    expect((await db.get(first.actionId))?.status).toBe("failed")

    const second = await pendingCard()
    await expect(
      confirmAction(ctx, ana, second.actionId, async () => {
        throw new Error("panne")
      }),
    ).rejects.toThrow("panne")
    await cancelAction(ctx, ana, second.actionId)
    expect((await db.get(second.actionId))?.status).toBe("cancelled")
  })

  it("une carte ne s'attache qu'à une réponse de la même conversation", async () => {
    const { messageId } = await pendingCard()
    const other = await startTurn(ctx, ben, { text: "Autre", limit: 300, platformKey: true })
    expect(
      await convexMessage(
        proposeAction(ctx, {
          threadId: other.threadId,
          messageId,
          organizationId: "org_1",
          tool: "redeploy",
          input: {},
          summary: "x",
        }),
      ),
    ).toBe("Introuvable.")
  })
})

describe("effacement", () => {
  it("efface la conversation, ses messages et ses cartes", async () => {
    const { threadId, actionId } = await pendingCard()
    expect(await convexMessage(deleteThread(ctx, ben, threadId))).toBe("Introuvable.")
    await deleteThread(ctx, ana, threadId)
    expect(await db.get(threadId)).toBeNull()
    expect(await db.get(actionId)).toBeNull()
    expect([...db.rows.keys()].some((id) => id.startsWith("assistantMessages|"))).toBe(false)
  })

  it("un titre tient en 60 caractères", () => {
    expect(threadTitle("a ".repeat(80)).length).toBe(58)
  })
})
