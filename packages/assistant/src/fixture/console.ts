import {
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
  type DataModelFromSchemaDefinition,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type MutationBuilder,
  type QueryBuilder,
} from "convex/server"
import { ConvexError, v } from "convex/values"
import { z } from "zod"

import { createConsoleAssistant } from "../console.ts"
import { storeKey } from "../convex.ts"
import type { ConfirmHandlers, ReadHandlers } from "../convex.ts"
import { defineTools } from "../tools.ts"
import type schema from "./schema.ts"

/*
 * Une console de test montée par la fabrique : la garde lit la personne dans les arguments (dans
 * un vrai produit, `requireOrgMember`) et refuse l'organisation « bloquee ».
 */

type DataModel = DataModelFromSchemaDefinition<typeof schema>
type QueryCtx = GenericQueryCtx<DataModel>
type MutationCtx = GenericMutationCtx<DataModel>

export const TOOLS = defineTools({
  list_deployments: {
    kind: "read",
    label: "Lecture des déploiements",
    description: "Déploiements de l'organisation.",
    input: z.object({}),
    private: true,
  },
  notify_client: {
    kind: "send",
    label: "Message au client",
    description: "Envoie un message au client.",
    input: z.object({ deploymentId: z.string(), text: z.string() }),
  },
})

const READ: ReadHandlers<typeof TOOLS, QueryCtx> = {
  list_deployments: async (ctx, _input, speaker) =>
    (await ctx.db.query("deployments").collect()).filter((d) => d.organizationId === speaker.organizationId),
}

const CONFIRM: ConfirmHandlers<typeof TOOLS, MutationCtx> = {
  notify_client: {
    card: async (ctx, { deploymentId, text }, speaker) => {
      const id = ctx.db.normalizeId("deployments", deploymentId)
      const deployment = id ? await ctx.db.get(id) : null
      if (!deployment || deployment.organizationId !== speaker.organizationId) throw new ConvexError("Introuvable.")
      return {
        summary: `Écrire au client de « ${deployment.name} »`,
        details: [{ label: "Texte", value: text }],
        snapshot: { text },
      }
    },
    execute: async (ctx, { deploymentId }) => {
      const id = ctx.db.normalizeId("deployments", deploymentId)
      if (id) await ctx.db.patch(id, { status: "notified" })
      return "Message envoyé."
    },
  },
}

const assistant = createConsoleAssistant({
  // Typés comme ceux de `./_generated/server` d’un produit.
  builders: {
    query: queryGeneric as QueryBuilder<DataModel, "public">,
    mutation: mutationGeneric as MutationBuilder<DataModel, "public">,
    internalQuery: internalQueryGeneric as QueryBuilder<DataModel, "internal">,
    internalMutation: internalMutationGeneric as MutationBuilder<DataModel, "internal">,
  },
  guard: {
    args: { organizationId: v.string(), userId: v.string() },
    speaker: async (_ctx: QueryCtx, { organizationId, userId }) => {
      if (organizationId === "bloquee") throw new ConvexError("Accès refusé.")
      return { organizationId, userId }
    },
  },
  tools: TOOLS,
  read: READ,
  confirm: CONFIRM,
  page: {
    args: v.object({ id: v.string() }),
    describe: async (ctx: MutationCtx, speaker, page) => {
      const id = ctx.db.normalizeId("deployments", page.id)
      const deployment = id ? await ctx.db.get(id) : null
      return deployment && deployment.organizationId === speaker.organizationId
        ? `Déploiement « ${deployment.name} ».`
        : ""
    },
  },
  module: "console",
  // Le test joue le tour lui-même (`consoleNode:run`) : la planification tombe sur une action vide.
  runner: "consoleNode:idle",
  limit: 10,
  ready: () => true,
})

export const { status, threads, thread, send, confirm, cancel, remove } = assistant.public
export const { context, progress, finish, runRead, runWrite, runPropose, sweep, purge, eraseOf, exportOf } =
  assistant.internal

export const seedKey = mutationGeneric({
  args: { organizationId: v.string() },
  handler: async (ctx, { organizationId }) =>
    await storeKey(ctx, { organizationId, sealed: "v1.a.b", hint: "wxyz", updatedBy: "ana" }),
})

export const lastMessage = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("assistantMessages").collect()
    return rows.at(-1) ?? null
  },
})
