import {
  mutationGeneric,
  queryGeneric,
  type DataModelFromSchemaDefinition,
  type GenericMutationCtx,
  type GenericQueryCtx,
} from "convex/server"
import { ConvexError, v } from "convex/values"
import { z } from "zod"

import {
  cancelAction,
  confirmAction,
  deleteThread,
  eraseUser,
  exportUser,
  failStuckTurns,
  finishTurn,
  progressMessage,
  readStatus,
  readThread,
  runProposeTool,
  runReadTool,
  runWriteTool,
  startTurn,
  storeKey,
  turnContext,
  vFinishTurn,
  vProgress,
  type ConfirmHandlers,
  type ReadHandlers,
  type WriteHandlers,
} from "../convex.ts"
import { defineTools } from "../tools.ts"
import type schema from "./schema.ts"

/*
 * Un produit de test, comme le décrit le guide : la « garde » lit la personne dans les arguments
 * (dans un vrai produit, `requireOrgMember`), puis appelle le kit.
 */

type DataModel = DataModelFromSchemaDefinition<typeof schema>
type QueryCtx = GenericQueryCtx<DataModel>
type MutationCtx = GenericMutationCtx<DataModel>
const query = queryGeneric
const mutation = mutationGeneric

const who = { organizationId: v.string(), userId: v.string() }

export const TOOLS = defineTools({
  list_deployments: {
    kind: "read",
    label: "Lecture des déploiements",
    description: "Déploiements de l'organisation.",
    input: z.object({}),
  },
  rename_deployment: {
    kind: "write",
    label: "Renommage",
    description: "Renomme un déploiement.",
    input: z.object({ deploymentId: z.string(), name: z.string().min(1) }),
  },
  redeploy: {
    kind: "confirm",
    label: "Redéploiement",
    description: "Propose de redéployer.",
    input: z.object({ deploymentId: z.string() }),
  },
  sneaky: {
    kind: "confirm",
    label: "Carte qui écrit",
    description: "Une carte qui tente d'écrire pendant le tour.",
    input: z.object({}),
  },
})

async function ownedDeployment(ctx: QueryCtx, organizationId: string, raw: string) {
  const id = ctx.db.normalizeId("deployments", raw)
  const deployment = id ? await ctx.db.get(id) : null
  if (!deployment || deployment.organizationId !== organizationId) throw new ConvexError("Introuvable.")
  return deployment
}

const READ: ReadHandlers<typeof TOOLS, QueryCtx> = {
  list_deployments: async (ctx, _input, speaker) =>
    (await ctx.db.query("deployments").collect()).filter((d) => d.organizationId === speaker.organizationId),
}

const WRITE: WriteHandlers<typeof TOOLS, MutationCtx> = {
  rename_deployment: async (ctx, { deploymentId, name }, speaker) => {
    const deployment = await ownedDeployment(ctx, speaker.organizationId, deploymentId)
    await ctx.db.patch(deployment._id, { name })
    return "Renommé."
  },
}

const CONFIRM: ConfirmHandlers<typeof TOOLS, MutationCtx> = {
  redeploy: {
    card: async (ctx, { deploymentId }, speaker) => {
      const deployment = await ownedDeployment(ctx, speaker.organizationId, deploymentId)
      return {
        summary: `Redéployer « ${deployment.name} »`,
        details: [{ label: "État", value: deployment.status }],
        snapshot: { name: deployment.name, status: deployment.status },
      }
    },
    execute: async (ctx, { deploymentId }, speaker) => {
      const deployment = await ownedDeployment(ctx, speaker.organizationId, deploymentId)
      if (deployment.status === "archived") throw new ConvexError("Ce déploiement est archivé.")
      await ctx.db.patch(deployment._id, { status: "building" })
      return "Redéploiement lancé."
    },
  },
  sneaky: {
    card: async (ctx) => {
      // Une carte ne peut pas écrire : la base est en lecture seule, à l'exécution aussi.
      await (ctx.db as unknown as { insert: (t: string, d: object) => Promise<unknown> }).insert("deployments", {})
      return { summary: "x", snapshot: null }
    },
    execute: async () => "jamais",
  },
}

export const seed = mutation({
  args: { organizationId: v.string(), name: v.string(), status: v.string() },
  handler: async (ctx, args) => await ctx.db.insert("deployments", args),
})

export const setDeployment = mutation({
  args: { id: v.id("deployments"), name: v.optional(v.string()), status: v.optional(v.string()) },
  handler: async (ctx, { id, ...patch }) => await ctx.db.patch(id, patch),
})

export const start = mutation({
  args: {
    ...who,
    threadId: v.optional(v.id("assistantThreads")),
    text: v.string(),
    limit: v.number(),
    platformKey: v.boolean(),
  },
  handler: async (ctx, { organizationId, userId, threadId, ...rest }) =>
    await startTurn(ctx, { organizationId, userId }, { threadId: threadId ?? null, ...rest }),
})

export const progress = mutation({ args: vProgress, handler: async (ctx, args) => await progressMessage(ctx, args) })

export const finish = mutation({ args: vFinishTurn, handler: async (ctx, args) => await finishTurn(ctx, args) })

export const context = query({
  args: { messageId: v.id("assistantMessages"), organizationId: v.string() },
  handler: async (ctx, args) => await turnContext(ctx, args),
})

export const thread = query({
  args: { ...who, threadId: v.id("assistantThreads") },
  handler: async (ctx, { organizationId, userId, threadId }) =>
    await readThread(ctx, { organizationId, userId }, threadId),
})

export const status = query({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) => await readStatus(ctx, organizationId, { limit: 10, platformKey: true }),
})

export const readTool = query({
  args: { ...who, name: v.string(), input: v.any() },
  handler: async (ctx, { organizationId, userId, name, input }) =>
    await runReadTool(ctx, { tools: TOOLS, speaker: { organizationId, userId }, name, input }, READ),
})

const turnCall = {
  ...who,
  threadId: v.id("assistantThreads"),
  messageId: v.id("assistantMessages"),
  name: v.string(),
  input: v.any(),
}

export const writeTool = mutation({
  args: turnCall,
  handler: async (ctx, { organizationId, userId, ...rest }) =>
    await runWriteTool(ctx, { tools: TOOLS, speaker: { organizationId, userId }, ...rest }, WRITE),
})

export const proposeTool = mutation({
  args: turnCall,
  handler: async (ctx, { organizationId, userId, ...rest }) =>
    await runProposeTool(ctx, { tools: TOOLS, speaker: { organizationId, userId }, ...rest }, CONFIRM),
})

export const confirm = mutation({
  args: { ...who, actionId: v.id("assistantActions"), now: v.optional(v.number()) },
  handler: async (ctx, { organizationId, userId, actionId, now }) =>
    await confirmAction(ctx, { organizationId, userId }, actionId, {
      tools: TOOLS,
      handlers: CONFIRM,
      ...(now === undefined ? {} : { now }),
    }),
})

export const cancel = mutation({
  args: { ...who, actionId: v.id("assistantActions") },
  handler: async (ctx, { organizationId, userId, actionId }) =>
    await cancelAction(ctx, { organizationId, userId }, actionId),
})

export const remove = mutation({
  args: { ...who, threadId: v.id("assistantThreads") },
  handler: async (ctx, { organizationId, userId, threadId }) =>
    await deleteThread(ctx, { organizationId, userId }, threadId),
})

export const sweep = mutation({
  args: { now: v.number() },
  handler: async (ctx, { now }) => await failStuckTurns(ctx, { now }),
})

export const saveKey = mutation({
  args: { organizationId: v.string(), updatedBy: v.string() },
  handler: async (ctx, { organizationId, updatedBy }) =>
    await storeKey(ctx, { organizationId, sealed: "v1.a.b", hint: "wxyz", updatedBy }),
})

export const erase = mutation({
  args: { userId: v.string(), limit: v.number() },
  handler: async (ctx, { userId, limit }) => await eraseUser(ctx, userId, { limit }),
})

export const exportOf = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => await exportUser(ctx, userId),
})

export const raw = query({
  args: { table: v.union(v.literal("assistantUsage"), v.literal("assistantKeys"), v.literal("deployments")) },
  handler: async (ctx, { table }) => await ctx.db.query(table).collect(),
})
