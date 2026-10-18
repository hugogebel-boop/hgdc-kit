import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

import { assistantTables } from "../convex.ts"

/** Le schéma d'un produit de test : les tables de l'assistant et une table à lui. */
export default defineSchema({
  ...assistantTables(),
  deployments: defineTable({ organizationId: v.string(), name: v.string(), status: v.string() }),
})
