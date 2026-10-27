import Anthropic from "@anthropic-ai/sdk"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import { runTurn } from "./node.ts"
import {
  applyChunk,
  emptyState,
  MalformedToolCallError,
  openAIClient,
  sseData,
  toAnthropicMessage,
  toOpenAIRequest,
} from "./openai.ts"
import { DEFAULT_MODEL_ID, infomaniakBaseUrl, isModelId, MODEL_OPTIONS, modelOption } from "./providers.ts"
import { defineTools } from "./tools.ts"

const sse = (chunks: ReadonlyArray<unknown>): ReadableStream<Uint8Array> => {
  const text = `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")}data: [DONE]\n\n`
  const bytes = new TextEncoder().encode(text)
  // Découpé au milieu des lignes : le lecteur doit recoller.
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7))
      controller.close()
    },
  })
}

describe("toOpenAIRequest", () => {
  it("traduit consigne, historique d'outils et définitions", () => {
    const request = toOpenAIRequest({
      model: "mistral",
      max_tokens: 1000,
      system: [
        { type: "text", text: "Consigne", cache_control: { type: "ephemeral" } },
        { type: "text", text: "Contexte" },
      ],
      thinking: { type: "adaptive" },
      tools: [{ name: "search", description: "Cherche", input_schema: { type: "object", properties: {} } }],
      messages: [
        { role: "user", content: "Bonjour" },
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "…", signature: "s" },
            { type: "text", text: "Je cherche." },
            { type: "tool_use", id: "t1", name: "search", input: { q: "prix" } },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "trouvé" },
            { type: "text", text: "Et ensuite ?" },
          ],
        },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t2", is_error: true, content: [{ type: "text", text: "refusé" }] },
          ],
        },
      ],
    } as Anthropic.MessageStreamParams)
    expect(request.messages).toEqual([
      { role: "system", content: "Consigne\n\nContexte" },
      { role: "user", content: "Bonjour" },
      {
        role: "assistant",
        content: "Je cherche.",
        tool_calls: [{ id: "t1", type: "function", function: { name: "search", arguments: '{"q":"prix"}' } }],
      },
      { role: "tool", tool_call_id: "t1", content: "trouvé" },
      { role: "user", content: "Et ensuite ?" },
      { role: "tool", tool_call_id: "t2", content: "Erreur : refusé" },
    ])
    expect(request.tools).toEqual([
      {
        type: "function",
        function: { name: "search", description: "Cherche", parameters: { type: "object", properties: {} } },
      },
    ])
    expect(request).toMatchObject({ stream: true, max_tokens: 1000, stream_options: { include_usage: true } })
    expect(request).not.toHaveProperty("thinking")
  })
})

describe("flux", () => {
  it("recolle les morceaux d'un appel d'outil et rend un message Anthropic", () => {
    const state = emptyState("m")
    expect(applyChunk(state, { id: "c1", choices: [{ delta: { content: "Un " } }] })).toBe("Un ")
    applyChunk(state, { choices: [{ delta: { content: "instant." } }] })
    applyChunk(state, {
      choices: [{ delta: { tool_calls: [{ index: 0, id: "x", function: { name: "sea", arguments: '{"q":' } }] } }],
    })
    applyChunk(state, {
      choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "rch", arguments: '"horaires"}' } }] } }],
    })
    applyChunk(state, {
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    })
    const message = toAnthropicMessage(state)
    expect(message.stop_reason).toBe("tool_use")
    expect(message.content).toEqual([
      { type: "text", text: "Un instant.", citations: null },
      { type: "tool_use", id: "x", name: "search", input: { q: "horaires" } },
    ])
    expect(message.usage).toMatchObject({ input_tokens: 12, output_tokens: 5 })
  })

  it("traduit les fins de réponse", () => {
    for (const [finish, stop] of [
      ["stop", "end_turn"],
      ["length", "max_tokens"],
      ["content_filter", "refusal"],
    ] as const) {
      const state = emptyState("m")
      applyChunk(state, { choices: [{ delta: { content: "x" }, finish_reason: finish }] })
      expect(toAnthropicMessage(state).stop_reason).toBe(stop)
    }
  })

  it("refuse des paramètres d'outil illisibles", () => {
    const state = emptyState("m")
    applyChunk(state, {
      choices: [{ delta: { tool_calls: [{ index: 0, id: "x", function: { name: "s", arguments: '{"q":' } }] } }],
    })
    expect(() => toAnthropicMessage(state)).toThrow(MalformedToolCallError)
  })

  it("lit un flux SSE coupé n'importe où", async () => {
    const lines: string[] = []
    for await (const data of sseData(sse([{ a: 1 }, { b: 2 }]))) lines.push(data)
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })
})

describe("openAIClient", () => {
  it("diffuse le texte et rend le message final", async () => {
    const calls: Array<{ url: string; body: unknown; auth: string | null }> = []
    const client = openAIClient({
      baseURL: "https://exemple.test/v1",
      apiKey: "secret",
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          body: JSON.parse(init.body as string),
          auth: new Headers(init?.headers).get("authorization"),
        })
        return new Response(
          sse([
            { choices: [{ delta: { content: "Bon" } }] },
            { choices: [{ delta: { content: "jour" }, finish_reason: "stop" }] },
          ]),
        )
      },
    })
    const deltas: string[] = []
    const stream = client.messages.stream({
      model: "m",
      max_tokens: 10,
      messages: [{ role: "user", content: "Salut" }],
    })
    stream.on("text", (d) => deltas.push(d))
    const message = await stream.finalMessage()
    expect(deltas.join("")).toBe("Bonjour")
    expect(message.stop_reason).toBe("end_turn")
    expect(calls[0]).toMatchObject({ url: "https://exemple.test/v1/chat/completions", auth: "Bearer secret" })
  })

  it("rend les erreurs HTTP comme celles du SDK d'Anthropic", async () => {
    const client = openAIClient({
      baseURL: "https://exemple.test/v1",
      apiKey: "k",
      fetch: async () => new Response(JSON.stringify({ error: "trop" }), { status: 429 }),
    })
    await expect(
      client.messages.stream({ model: "m", max_tokens: 10, messages: [] }).finalMessage(),
    ).rejects.toBeInstanceOf(Anthropic.RateLimitError)
  })

  it("fait tourner la boucle de runTurn avec un outil", async () => {
    const tools = defineTools({
      search_knowledge: {
        kind: "read",
        label: "Recherche",
        description: "Cherche dans les sources.",
        input: z.object({ query: z.string() }),
      },
    })
    let step = 0
    const client = openAIClient({
      baseURL: "https://exemple.test/v1",
      apiKey: "k",
      fetch: async (_url, init) => {
        step++
        const body = JSON.parse(init.body as string) as { messages: Array<{ role: string; content: string }> }
        if (step === 1)
          return new Response(
            sse([
              {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "a",
                          function: { name: "search_knowledge", arguments: '{"query":"horaires"}' },
                        },
                      ],
                    },
                    finish_reason: "tool_calls",
                  },
                ],
              },
            ]),
          )
        expect(body.messages.at(-1)).toEqual({ role: "tool", tool_call_id: "a", content: "Ouvert de 8 h à 18 h." })
        return new Response(
          sse([{ choices: [{ delta: { content: "Nous sommes ouverts de 8 h à 18 h." }, finish_reason: "stop" }] }]),
        )
      },
    })
    const result = await runTurn({
      client,
      model: "m",
      direct: false,
      system: "Consigne",
      tools,
      history: [],
      text: "Quels sont vos horaires ?",
      handlers: {
        read: async () => "Ouvert de 8 h à 18 h.",
        write: async () => "",
        propose: async () => "",
      },
      onProgress: async () => undefined,
    })
    expect(result.status).toBe("done")
    expect(result.text).toBe("Nous sommes ouverts de 8 h à 18 h.")
    expect(result.tools).toEqual([{ id: "a", label: "Recherche", status: "done" }])
  })
})

describe("catalogue", () => {
  it("a des identifiants uniques et un défaut en Suisse", () => {
    expect(new Set(MODEL_OPTIONS.map((o) => o.id)).size).toBe(MODEL_OPTIONS.length)
    expect(modelOption(DEFAULT_MODEL_ID).processing).toBe("suisse")
    expect(modelOption("retiré").id).toBe(DEFAULT_MODEL_ID)
    expect(isModelId("bedrock/claude-sonnet-5-5")).toBe(true)
    for (const option of MODEL_OPTIONS.filter((o) => o.vendor === "bedrock")) expect(option.model).toMatch(/^eu\./)
  })

  it("construit l'adresse d'Infomaniak et refuse un identifiant douteux", () => {
    expect(infomaniakBaseUrl("12345")).toBe("https://api.infomaniak.com/2/ai/12345/openai/v1")
    expect(() => infomaniakBaseUrl("1/../x")).toThrow("invalide")
  })
})
