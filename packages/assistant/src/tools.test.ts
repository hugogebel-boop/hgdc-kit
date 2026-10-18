import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  awaitingConfirmation,
  defineTools,
  snapshotHash,
  parseToolCall,
  toolDefinitions,
  toolLabel,
  toolResult,
} from "./tools.ts"

const TOOLS = defineTools({
  list_deployments: {
    kind: "read",
    label: "Lecture des déploiements",
    description: "Derniers déploiements du projet.",
    input: z.object({ projectId: z.string().min(1), limit: z.number().int().min(1).max(50).optional() }),
  },
  redeploy: {
    kind: "confirm",
    label: "Redéploiement",
    description: "Propose de redéployer.",
    input: z.object({ deploymentId: z.string().min(1) }),
  },
})

describe("defineTools", () => {
  it("refuse un nom hors snake_case ou un libellé vide", () => {
    expect(() =>
      defineTools({ "Liste-Projets": { kind: "read", label: "x", description: "x", input: z.object({}) } }),
    ).toThrow("Nom d'outil invalide")
    expect(() => defineTools({ ok: { kind: "read", label: " ", description: "x", input: z.object({}) } })).toThrow(
      "libellé ou description vide",
    )
  })
})

describe("toolDefinitions", () => {
  it("rend le format de l'API, dans l'ordre de déclaration, sans $schema", () => {
    const defs = toolDefinitions(TOOLS)
    expect(defs.map((d) => d.name)).toEqual(["list_deployments", "redeploy"])
    expect(defs[0]?.input_schema.type).toBe("object")
    expect(defs[0]?.input_schema).not.toHaveProperty("$schema")
    expect(defs[0]?.input_schema).toHaveProperty("properties.projectId")
  })
})

describe("parseToolCall", () => {
  it("vérifie l'outil et son entrée avant toute exécution", () => {
    expect(parseToolCall(TOOLS, "drop_database", {})).toEqual({ ok: false, message: "Outil inconnu : drop_database" })
    const invalid = parseToolCall(TOOLS, "list_deployments", { projectId: "" })
    expect(invalid.ok).toBe(false)
    // Un champ inventé par le modèle (ou glissé par un contenu tiers) est refusé.
    expect(parseToolCall(TOOLS, "redeploy", { deploymentId: "d1", force: true }).ok).toBe(false)
    expect(parseToolCall(TOOLS, "redeploy", { deploymentId: "d1" })).toEqual({
      ok: true,
      name: "redeploy",
      kind: "confirm",
      input: { deploymentId: "d1" },
    })
    // `constructor` et consorts ne passent pas pour des outils.
    expect(parseToolCall(TOOLS, "constructor", {}).ok).toBe(false)
  })
})

describe("résultats", () => {
  it("coupe un résultat trop long et décrit une carte en attente", () => {
    expect(toolResult("a".repeat(30_000)).length).toBeLessThan(20_020)
    expect(toolResult("a".repeat(30), 10)).toBe(`${"a".repeat(10)}… (tronqué)`)
    expect(JSON.parse(awaitingConfirmation("a1", "Redéployer"))).toMatchObject({
      status: "awaiting_confirmation",
      actionId: "a1",
    })
    expect(toolLabel(TOOLS, "redeploy")).toBe("Redéploiement")
    expect(toolLabel(TOOLS, "inconnu")).toBe("inconnu")
  })

  it("une empreinte SHA-256 ne dépend pas de l'ordre des clés, et change avec le contenu", async () => {
    expect(await snapshotHash({ b: 1, a: [1, 2] })).toBe(await snapshotHash({ a: [1, 2], b: 1 }))
    expect(await snapshotHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/)
    expect(await snapshotHash("Bonjour")).not.toBe(await snapshotHash("Bonjour !"))
  })
})
