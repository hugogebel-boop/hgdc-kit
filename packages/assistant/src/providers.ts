import type { Price } from "./model.ts"

/*
 * Les modèles qu'un produit peut proposer quand les données doivent rester en Suisse ou dans l'UE
 * (ADR 0011 de la famille) : Infomaniak (Suisse, API au format OpenAI, `./openai`) et Claude par
 * AWS Bedrock, profil d'inférence `eu.` (UE, API au format Anthropic, `./bedrock`). Le produit
 * choisit dans ce catalogue et pose les identifiants ; le catalogue ne lit aucune variable.
 * Fonctions pures.
 */

/** Où le fournisseur traite les demandes. */
export type Processing = "suisse" | "ue"

export type ModelVendor = "infomaniak" | "bedrock"

export type ModelOption = {
  /** Identifiant stable, enregistré dans les réglages : `infomaniak/mistral-small-4`. */
  id: string
  vendor: ModelVendor
  /** Nom du modèle chez le fournisseur. */
  model: string
  /** Nom affiché. */
  label: string
  /** Une phrase pour choisir. */
  description: string
  processing: Processing
  /** Tarif en dollars par million de jetons, pour le plafond et le décompte des crédits. */
  price: Price
}

/**
 * Infomaniak facture en francs : tarifs convertis au taux arrondi au-dessus, pour que le plafond
 * d'un tour ne soit jamais trop large.
 */
export const CHF_TO_USD = 1.3

const chf = (input: number, output: number): Price => ({
  input: input * CHF_TO_USD,
  cacheWrite: input * CHF_TO_USD,
  cacheRead: input * CHF_TO_USD,
  output: output * CHF_TO_USD,
})

/** Bedrock : tarif d'Anthropic majoré de 10 % (points de terminaison régionaux et géographiques). */
const bedrock = (input: number, output: number): Price => ({
  input: input * 1.1,
  cacheWrite: input * 1.25 * 1.1,
  cacheRead: input * 0.1 * 1.1,
  output: output * 1.1,
})

/**
 * Modèles proposés, le défaut en tête. Tous savent appeler des outils (page des modèles
 * d'Infomaniak, « Function call : Yes » ; fiches des modèles Claude sur Bedrock), lus le 2026-10-26.
 */
export const MODEL_OPTIONS: ReadonlyArray<ModelOption> = [
  {
    id: "infomaniak/mistral-small-4",
    vendor: "infomaniak",
    model: "mistralai/Mistral-Small-4-119B-2603",
    label: "Mistral Small 4",
    description: "Rapide et économique, bon en français. Hébergé en Suisse par Infomaniak.",
    processing: "suisse",
    price: chf(0.2, 0.75),
  },
  {
    id: "infomaniak/qwen-3-5",
    vendor: "infomaniak",
    model: "Qwen/Qwen3.5-397B-A17B-FP8",
    label: "Qwen 3.5",
    description: "Plus précis sur les demandes complexes, un peu plus lent. Hébergé par Infomaniak.",
    processing: "suisse",
    price: chf(0.8, 3.6),
  },
  {
    id: "infomaniak/apertus-1-5",
    vendor: "infomaniak",
    model: "swiss-ai/Apertus-v1.5-70B",
    label: "Apertus 1.5",
    description: "Le modèle suisse de l'EPFL et de l'ETH Zurich. Hébergé par Infomaniak.",
    processing: "suisse",
    price: chf(0.7, 2.5),
  },
  {
    id: "bedrock/claude-haiku-5-5",
    vendor: "bedrock",
    model: "eu.anthropic.claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    description: "Claude d'Anthropic, rapide. Traité dans l'Union européenne par AWS.",
    processing: "ue",
    price: bedrock(0.1, 0.5),
  },
  {
    id: "bedrock/claude-sonnet-5-5",
    vendor: "bedrock",
    model: "eu.anthropic.claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    description: "Claude d'Anthropic, la meilleure qualité de réponse. Traité dans l'Union européenne par AWS.",
    processing: "ue",
    price: bedrock(2, 10),
  },
]

export const DEFAULT_MODEL_ID = "infomaniak/mistral-small-4"

/** Le modèle d'un identifiant enregistré ; un identifiant retiré du catalogue retombe sur le défaut. */
export function modelOption(id: string | null | undefined): ModelOption {
  return MODEL_OPTIONS.find((option) => option.id === id) ?? (MODEL_OPTIONS[0] as ModelOption)
}

export function isModelId(id: string): boolean {
  return MODEL_OPTIONS.some((option) => option.id === id)
}

export const PROCESSING_LABEL: Readonly<Record<Processing, string>> = {
  suisse: "Traitement en Suisse",
  ue: "Traitement dans l'UE",
}

/** Point de terminaison d'Infomaniak AI Services au format OpenAI (v2), pour un produit IA donné. */
export function infomaniakBaseUrl(productId: string): string {
  if (!/^\d+$/.test(productId)) throw new Error("Identifiant de produit Infomaniak invalide.")
  return `https://api.infomaniak.com/2/ai/${productId}/openai/v1`
}

// ───────────────────────────── Variables du déploiement ─────────────────────────────

/** Les variables d'environnement lues par les fonctions ci-dessous (`process.env` par défaut). */
export type ProviderEnv = Readonly<Record<string, string | undefined>>

/**
 * Variables lues, par fournisseur. `ASSISTANT_MODEL` choisit le modèle de la plateforme dans le
 * catalogue (défaut : `DEFAULT_MODEL_ID`).
 */
export const PROVIDER_ENV = {
  model: "ASSISTANT_MODEL",
  infomaniak: ["INFOMANIAK_AI_TOKEN", "INFOMANIAK_AI_PRODUCT_ID"],
  bedrock: ["BEDROCK_REGION", "BEDROCK_API_KEY"],
  /** Drapeau explicite : `1` autorise Anthropic en direct et OpenRouter (traitement aux États-Unis). */
  allowUs: "ASSISTANT_ALLOW_US_PROCESSING",
} as const

/** `process.env` quand il existe (Convex V8 et Node), sinon rien. */
export function processEnv(): ProviderEnv {
  return (globalThis as { process?: { env?: ProviderEnv } }).process?.env ?? {}
}

const filled = (env: ProviderEnv, name: string): boolean => Boolean(env[name]?.trim())

/**
 * Régions AWS acceptées pour Bedrock : l'UE et la Suisse (Zurich). Liste fermée : `eu-west-2`
 * (Londres) porte le préfixe `eu-` mais n'est pas dans l'UE ; une région ouverte plus tard s'ajoute ici.
 */
export const EU_BEDROCK_REGIONS: readonly string[] = [
  "eu-central-1", // Francfort
  "eu-central-2", // Zurich
  "eu-west-1", // Irlande
  "eu-west-3", // Paris
  "eu-north-1", // Stockholm
  "eu-south-1", // Milan
  "eu-south-2", // Espagne
]

/** Une région AWS de l'UE ou de Suisse (`EU_BEDROCK_REGIONS`). `us-east-1`, `eu-west-2` ou une valeur libre : non. */
export function isEuBedrockRegion(region: string): boolean {
  return EU_BEDROCK_REGIONS.includes(region.trim())
}

/** Un profil d'inférence géographique de l'UE (`eu.anthropic.…`) : la demande ne quitte pas l'UE. */
export function isEuBedrockModel(model: string): boolean {
  return model.trim().startsWith("eu.")
}

/**
 * Lève si Bedrock sortirait de l'UE (ADR 0022) : région hors `EU_BEDROCK_REGIONS`, ou modèle sans
 * profil `eu.`. Le modèle est facultatif : `bedrockClient` le vérifie à chaque appel.
 */
export function assertEuBedrock(target: { region: string; model?: string }): void {
  if (!isEuBedrockRegion(target.region))
    throw new Error(`Bedrock hors UE refusé : région ${JSON.stringify(target.region)}, attendue eu-*.`)
  if (target.model !== undefined && !isEuBedrockModel(target.model))
    throw new Error(`Bedrock hors UE refusé : modèle ${JSON.stringify(target.model)}, profil eu. attendu.`)
}

/**
 * Les identifiants du fournisseur sont posés. Bedrock : la région doit aussi être dans l'UE, sinon
 * le modèle reste « pas encore branché » plutôt que d'envoyer des données hors UE (un
 * avertissement le dit dans les journaux).
 */
export function vendorReady(vendor: ModelVendor, env: ProviderEnv = processEnv()): boolean {
  if (!PROVIDER_ENV[vendor].every((name) => filled(env, name))) return false
  if (vendor !== "bedrock" || isEuBedrockRegion(env.BEDROCK_REGION!)) return true
  console.warn(
    `Bedrock non branché : BEDROCK_REGION ${JSON.stringify(env.BEDROCK_REGION)} hors UE (EU_BEDROCK_REGIONS).`,
  )
  return false
}

/**
 * Le modèle de la plateforme : `ASSISTANT_MODEL` (identifiant du catalogue) ou le défaut, si son
 * fournisseur est configuré ; `null` sinon. Un identifiant inconnu retombe sur le défaut.
 */
export function platformModel(env: ProviderEnv = processEnv()): ModelOption | null {
  const option = modelOption(env[PROVIDER_ENV.model]?.trim())
  return vendorReady(option.vendor, env) ? option : null
}

/**
 * Un modèle souverain (Infomaniak en Suisse, Bedrock `eu.`) est branché : remplace
 * `readKey(process.env.ASSISTANT_LLM_API_KEY) !== undefined` dans les queries et mutations.
 */
export function sovereignReady(env: ProviderEnv = processEnv()): boolean {
  return platformModel(env) !== null
}

/** Un Convex lancé sur le poste (`http://127.0.0.1` ou `localhost`), jamais un déploiement en ligne. */
export function isLocalDeployment(env: ProviderEnv = processEnv()): boolean {
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(env.CONVEX_CLOUD_URL?.trim() ?? "")
}

/**
 * Anthropic en direct et OpenRouter (traitement aux États-Unis, ADR 0011 de la famille) : permis en
 * développement local, ou avec le drapeau `ASSISTANT_ALLOW_US_PROCESSING=1` posé exprès.
 */
export function usProcessingAllowed(env: ProviderEnv = processEnv()): boolean {
  return isLocalDeployment(env) || env[PROVIDER_ENV.allowUs]?.trim() === "1"
}
