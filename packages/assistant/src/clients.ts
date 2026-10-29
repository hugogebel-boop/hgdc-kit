import type { Price } from "./model.ts"
import type { ModelClient } from "./node.ts"
import { openAIClient } from "./openai.ts"
import { assertEuBedrock, infomaniakBaseUrl, platformModel, processEnv, vendorReady } from "./providers.ts"
import type { ModelOption, ProviderEnv } from "./providers.ts"

/*
 * Le client d'un modèle du catalogue, d'après les variables du déploiement : la seule voie de
 * production (ADR 0011 de la famille). Infomaniak (Suisse, défaut) ou Claude par Bedrock, profil
 * `eu.` (UE). Un modèle dont le fournisseur n'est pas configuré est indisponible (`null`), jamais
 * remplacé en silence par un autre. Pour une action `"use node"`.
 */

/** Ce que `runTurn` reçoit : `{ ...choice, system, tools, … }` (le champ `option` est ignoré). */
export type ModelChoice = {
  client: ModelClient
  model: string
  /** Toujours faux : l'entrée des outils en flux est propre à l'API d'Anthropic en direct. */
  direct: false
  price: Price
  option: ModelOption
}

export type ModelClientOptions = {
  env?: ProviderEnv
  /** Infomaniak : 0,3 par défaut, des réponses d'assistant plus stables. */
  temperature?: number
  fetch?: (url: string, init: RequestInit) => Promise<Response>
}

/** Le client du modèle choisi, ou `null` si son fournisseur n'a pas ses identifiants. */
export async function modelClient(option: ModelOption, options: ModelClientOptions = {}): Promise<ModelChoice | null> {
  const env = options.env ?? processEnv()
  if (!vendorReady(option.vendor, env)) return null
  const base = { model: option.model, direct: false as const, price: option.price, option }
  if (option.vendor === "infomaniak") {
    const client = openAIClient({
      baseURL: infomaniakBaseUrl(env.INFOMANIAK_AI_PRODUCT_ID!.trim()),
      apiKey: env.INFOMANIAK_AI_TOKEN!.trim(),
      temperature: options.temperature ?? 0.3,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    })
    return { client, ...base }
  }
  // Chargé à la demande : le SDK d'AWS (dépendance optionnelle) ne pèse que si Bedrock est choisi.
  const region = env.BEDROCK_REGION!.trim()
  // Avant de charger le SDK : un modèle hors profil `eu.` ne part jamais.
  assertEuBedrock({ region, model: option.model })
  const { bedrockClient } = await import("./bedrock.ts")
  const client = bedrockClient({ region, apiKey: env.BEDROCK_API_KEY!.trim() })
  return { client, ...base }
}

/**
 * Le modèle de la plateforme (`ASSISTANT_MODEL`, défaut Mistral Small 4 chez Infomaniak), prêt
 * pour `runTurn`. Remplace `clientFor(key, …)` : `const choice = await sovereignClient()`.
 */
export async function sovereignClient(options: ModelClientOptions = {}): Promise<ModelChoice | null> {
  const option = platformModel(options.env ?? processEnv())
  return option ? await modelClient(option, options) : null
}
