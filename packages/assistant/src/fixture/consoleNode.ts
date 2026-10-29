import type Anthropic from "@anthropic-ai/sdk"
import { internalActionGeneric, type ActionBuilder, type DataModelFromSchemaDefinition } from "convex/server"

import { createConsoleRunner } from "../console-node.ts"
import { vRunArgs } from "../console.ts"
import type { ModelClient } from "../node.ts"
import { TOOLS } from "./console.ts"
import type schema from "./schema.ts"

/*
 * L'action du tour de la console de test, avec un modèle simulé : il lit les déploiements, puis
 * propose d'écrire au client.
 */

function reply(content: unknown[], stop: string): Anthropic.Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "faux",
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as unknown as Anthropic.Message
}

/** Le premier identifiant lu dans le dernier résultat d'outil. */
function lastId(params: Anthropic.MessageStreamParams): string {
  return /\\"_id\\":\\"([^"\\]+)/.exec(JSON.stringify(params.messages.at(-1)))?.[1] ?? ""
}

function fakeClient(): ModelClient {
  let step = 0
  return {
    messages: {
      stream(params) {
        const current = step++
        const listeners: Array<(delta: string) => void> = []
        return {
          on(_event, listener) {
            listeners.push(listener)
            return this
          },
          async finalMessage() {
            if (current === 0)
              return reply([{ type: "tool_use", id: "t1", name: "list_deployments", input: {} }], "tool_use")
            if (current === 1)
              return reply(
                [
                  {
                    type: "tool_use",
                    id: "t2",
                    name: "notify_client",
                    input: { deploymentId: lastId(params), text: "Mise en ligne faite." },
                  },
                ],
                "tool_use",
              )
            for (const l of listeners) l("Carte proposée.")
            return reply([{ type: "text", text: "Carte proposée.", citations: null }], "end_turn")
          },
        }
      },
    },
  }
}

export const run = createConsoleRunner({
  // Typé comme celui de `./_generated/server` d’un produit.
  internalAction: internalActionGeneric as ActionBuilder<DataModelFromSchemaDefinition<typeof schema>, "internal">,
  tools: TOOLS,
  system: "Tu es l'assistant de test.",
  module: "console",
  client: async () => ({
    client: fakeClient(),
    model: "faux",
    direct: false,
    price: { input: 1, cacheWrite: 1, cacheRead: 1, output: 1 },
    option: {
      id: "x",
      vendor: "infomaniak",
      model: "faux",
      label: "Faux",
      description: "",
      processing: "suisse",
      price: { input: 1, cacheWrite: 1, cacheRead: 1, output: 1 },
    },
  }),
  // La demande compte comme non fiable : avec la lecture privée, la carte porte la mise en garde.
  taint: { untrusted: true },
})

/** Cible de la planification de `send` dans les tests : ne fait rien. */
export const idle = internalActionGeneric({ args: vRunArgs, handler: async () => null })
