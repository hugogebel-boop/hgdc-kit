import { describe, expect, it, vi } from "vitest"

import { modelClient, sovereignClient } from "./clients.ts"
import {
  DEFAULT_MODEL_ID,
  isLocalDeployment,
  MODEL_OPTIONS,
  modelOption,
  platformModel,
  sovereignReady,
  usProcessingAllowed,
  vendorReady,
} from "./providers.ts"

const INFOMANIAK = { INFOMANIAK_AI_TOKEN: "jeton", INFOMANIAK_AI_PRODUCT_ID: "12345" }
const BEDROCK = { BEDROCK_REGION: "eu-central-2", BEDROCK_API_KEY: "cle" }

describe("modèle de la plateforme", () => {
  it("défaut Infomaniak en Suisse, branché seulement avec ses deux identifiants", () => {
    expect(platformModel({})).toBeNull()
    expect(sovereignReady({ INFOMANIAK_AI_TOKEN: "jeton" })).toBe(false)
    expect(sovereignReady({ INFOMANIAK_AI_TOKEN: " ", INFOMANIAK_AI_PRODUCT_ID: "1" })).toBe(false)
    expect(platformModel(INFOMANIAK)).toMatchObject({ id: DEFAULT_MODEL_ID, processing: "suisse" })
  })

  it("ASSISTANT_MODEL choisit dans le catalogue ; son fournisseur doit être configuré", () => {
    const sonnet = { ASSISTANT_MODEL: "bedrock/claude-sonnet-5-5" }
    expect(platformModel({ ...sonnet, ...INFOMANIAK })).toBeNull()
    expect(platformModel({ ...sonnet, ...BEDROCK })).toMatchObject({
      model: "eu.anthropic.claude-sonnet-5-5",
      processing: "ue",
    })
    expect(platformModel({ ASSISTANT_MODEL: "anthropic/claude", ...INFOMANIAK })?.id).toBe(DEFAULT_MODEL_ID)
    expect(vendorReady("bedrock", BEDROCK)).toBe(true)
  })

  it("le catalogue ne contient que la Suisse et les profils eu. de Bedrock", () => {
    expect(MODEL_OPTIONS.map((o) => o.processing).every((p) => p === "suisse" || p === "ue")).toBe(true)
    const bedrock = MODEL_OPTIONS.filter((o) => o.vendor === "bedrock").map((o) => o.model)
    expect(bedrock.every((model) => model.startsWith("eu.anthropic."))).toBe(true)
  })
})

describe("traitement aux États-Unis", () => {
  it("permis seulement en local ou avec ASSISTANT_ALLOW_US_PROCESSING=1", () => {
    expect(isLocalDeployment({ CONVEX_CLOUD_URL: "http://127.0.0.1:3210" })).toBe(true)
    expect(isLocalDeployment({ CONVEX_CLOUD_URL: "http://localhost:3210" })).toBe(true)
    expect(isLocalDeployment({ CONVEX_CLOUD_URL: "https://convex.docs.hgdc.ch" })).toBe(false)
    expect(isLocalDeployment({ CONVEX_CLOUD_URL: "http://127.0.0.1.example.com" })).toBe(false)
    expect(usProcessingAllowed({})).toBe(false)
    expect(usProcessingAllowed({ ASSISTANT_ALLOW_US_PROCESSING: "1" })).toBe(true)
    expect(usProcessingAllowed({ ASSISTANT_ALLOW_US_PROCESSING: "yes" })).toBe(false)
  })
})

describe("clients", () => {
  it("sans identifiants : null, jamais un autre fournisseur", async () => {
    expect(await sovereignClient({ env: {} })).toBeNull()
    expect(await modelClient(modelOption("bedrock/claude-haiku-5-5"), { env: INFOMANIAK })).toBeNull()
  })

  it("Infomaniak : point de terminaison du produit, jeton en Bearer, tarif du catalogue", async () => {
    const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () =>
        new Response('data: {"choices":[{"delta":{"content":"Bonjour"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'),
    )
    const choice = await sovereignClient({ env: INFOMANIAK, fetch: fetcher })
    expect(choice).toMatchObject({ model: "mistralai/Mistral-Small-4-119B-2603", direct: false })
    expect(choice?.price).toEqual(modelOption(DEFAULT_MODEL_ID).price)
    const message = await choice!.client.messages
      .stream({ model: choice!.model, max_tokens: 10, messages: [{ role: "user", content: "Salut" }] })
      .finalMessage()
    expect(message.content).toEqual([expect.objectContaining({ type: "text", text: "Bonjour" })])
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.infomaniak.com/2/ai/12345/openai/v1/chat/completions")
    expect((fetcher.mock.calls[0]![1].headers as Record<string, string>).authorization).toBe("Bearer jeton")
  })

  it("Bedrock : le profil eu. du catalogue", async () => {
    const choice = await sovereignClient({ env: { ...BEDROCK, ASSISTANT_MODEL: "bedrock/claude-haiku-5-5" } })
    expect(choice?.model).toBe("eu.anthropic.claude-haiku-5-5")
    expect(typeof choice?.client.messages.stream).toBe("function")
  }, 30_000)
})
