import Anthropic from "@anthropic-ai/sdk"
import { ConvexError } from "convex/values"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { runTurn, verifyKey, type ModelClient, type ToolCall } from "./node.ts"
import { defineTools } from "./tools.ts"

const TOOLS = defineTools({
  list_monitors: {
    kind: "read",
    label: "Lecture des moniteurs",
    description: "Moniteurs de l'organisation.",
    input: z.object({ status: z.enum(["up", "down"]).optional() }),
  },
})

type Reply = { text?: string; tools?: Array<{ id: string; name: string; input: unknown }>; stop?: string }

function message({ text, tools = [], stop }: Reply): Anthropic.Message {
  const content = [
    ...(text ? [{ type: "text", text, citations: null }] : []),
    ...tools.map((t) => ({ type: "tool_use", id: t.id, name: t.name, input: t.input })),
  ]
  // Seuls les champs lus par la boucle : le reste du message n'intéresse pas le test.
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content,
    stop_reason: stop ?? (tools.length ? "tool_use" : "end_turn"),
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } as unknown as Anthropic.Message
}

/** Un client qui rend les réponses dans l'ordre et note chaque requête. */
function fakeClient(replies: Array<Reply | Error>): { client: ModelClient; requests: Anthropic.MessageStreamParams[] } {
  const requests: Anthropic.MessageStreamParams[] = []
  return {
    requests,
    client: {
      messages: {
        stream(params) {
          requests.push(structuredClone(params))
          const reply = replies.shift()
          const listeners: Array<(delta: string) => void> = []
          return {
            on(_event, listener) {
              listeners.push(listener)
              return this
            },
            async finalMessage() {
              if (!reply) throw new Error("plus de réponse prévue")
              if (reply instanceof Error) throw reply
              if (reply.text) for (const l of listeners) l(reply.text)
              return message(reply)
            },
          }
        },
      },
    },
  }
}

const base = {
  model: "claude-haiku-5-5",
  direct: true,
  system: "Tu es l'assistant de Status.",
  tools: TOOLS,
  history: [],
}

describe("runTurn", () => {
  it("appelle l'outil vérifié, renvoie tous les résultats ensemble, puis la réponse", async () => {
    const { client, requests } = fakeClient([
      { text: "Je regarde.", tools: [{ id: "t1", name: "list_monitors", input: { status: "down" } }] },
      { text: "Un moniteur est en panne." },
    ])
    const execute = vi.fn<(call: ToolCall) => Promise<string>>(async () => '[{"name":"API"}]')
    const onProgress = vi.fn<(state: { text: string }) => Promise<void>>(async () => {})
    const result = await runTurn({ ...base, client, text: "Qu'est-ce qui est en panne ?", execute, onProgress })

    expect(execute).toHaveBeenCalledWith({ id: "t1", name: "list_monitors", kind: "read", input: { status: "down" } })
    expect(result.status).toBe("done")
    expect(result.text).toBe("Je regarde.\n\nUn moniteur est en panne.")
    expect(result.tools).toEqual([{ id: "t1", label: "Lecture des moniteurs", status: "done" }])
    expect(result.usage.input).toBe(2000)
    // 2 × (1000 × 0,10 $ + 200 × 0,50 $) / 1e6 = 0,04 centime : arrondi au dixième de crédit.
    expect(result.credits).toBe(0)
    expect(result.usage.output).toBe(400)
    const history = JSON.parse(result.history ?? "[]") as Anthropic.MessageParam[]
    expect(history.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"])
    // Consigne et dernier outil mis en cache ; entrées d'outils diffusées en direct chez Anthropic.
    const first = requests[0]!
    expect(first.tools?.[0]).toMatchObject({ name: "list_monitors", eager_input_streaming: true })
    expect(first.thinking).toEqual({ type: "adaptive" })
    expect(onProgress).toHaveBeenCalled()
  })

  it("une entrée invalide ou une erreur d'outil revient au modèle, sans exécuter", async () => {
    const { client, requests } = fakeClient([
      {
        tools: [
          { id: "t1", name: "list_monitors", input: { status: "peut-être" } },
          { id: "t2", name: "list_monitors", input: {} },
        ],
      },
      { text: "Je n'ai pas accès à ces moniteurs." },
    ])
    const execute = vi.fn<(call: ToolCall) => Promise<string>>(async () => {
      throw new ConvexError("Introuvable.")
    })
    const result = await runTurn({ ...base, client, text: "?", execute, onProgress: async () => {} })
    expect(execute).toHaveBeenCalledTimes(1)
    const toolResults = requests[1]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[]
    expect(toolResults).toHaveLength(2)
    expect(toolResults[0]).toMatchObject({ is_error: true })
    expect(toolResults[1]).toMatchObject({ is_error: true, content: "Introuvable." })
    expect(result.tools.map((t) => t.status)).toEqual(["error", "error"])
  })

  it("un refus ou une panne du service ne touche pas l'historique", async () => {
    const refusal = fakeClient([{ text: "", stop: "refusal" }])
    const refused = await runTurn({
      ...base,
      client: refusal.client,
      text: "?",
      execute: async () => "",
      onProgress: async () => {},
    })
    expect(refused).toMatchObject({ status: "done", history: null, text: "Je ne peux pas aider sur cette demande." })

    const down = fakeClient([new Anthropic.APIError(529, undefined, "overloaded", new Headers())])
    const failed = await runTurn({
      ...base,
      client: down.client,
      text: "?",
      execute: async () => "",
      onProgress: async () => {},
    })
    expect(failed.status).toBe("error")
    expect(failed.history).toBeNull()
    expect(failed.text).toContain("Réessaie")
  })

  it("une conversation trop longue n'appelle pas le modèle", async () => {
    const { client, requests } = fakeClient([])
    const history: Anthropic.MessageParam[] = [{ role: "user", content: "x".repeat(600_000) }]
    const result = await runTurn({
      ...base,
      client,
      history,
      text: "?",
      execute: async () => "",
      onProgress: async () => {},
    })
    expect(result.status).toBe("error")
    expect(requests).toHaveLength(0)
  })
})

describe("verifyKey", () => {
  it("refuse une clé inconnue et lit la réponse d'OpenRouter", async () => {
    expect(await verifyKey("sk-proj-123")).toContain("Colle une clé")
    const refused = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 401 }),
    )
    expect(await verifyKey(`sk-or-v1-${"a".repeat(30)}`, refused)).toContain("OpenRouter refuse")
    const ok = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response("{}", { status: 200 }),
    )
    expect(await verifyKey(`sk-or-v1-${"a".repeat(30)}`, ok)).toBeNull()
    expect(ok.mock.calls[0]?.[0]).toBe("https://openrouter.ai/api/v1/key")
  })
})
