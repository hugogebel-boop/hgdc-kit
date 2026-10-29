import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk"

import type { ModelClient } from "./node.ts"
import { assertEuBedrock } from "./providers.ts"

/*
 * Claude par AWS Bedrock, pour `runTurn` : même API au format Anthropic, servie par AWS. Le modèle
 * passé à `runTurn` est un profil d'inférence (`eu.anthropic.…` : la demande reste dans les
 * régions de l'UE). Paquet optionnel : seul un produit qui propose Claude en UE l'installe.
 */

export type BedrockCredentials =
  /** Clé d'API Bedrock (`AWS_BEARER_TOKEN_BEDROCK`), limitée à Bedrock. */
  | { region: string; apiKey: string }
  /** Clés IAM d'un utilisateur limité à `bedrock:InvokeModel*`. */
  | { region: string; accessKeyId: string; secretAccessKey: string }

/**
 * Lève pour une région hors UE (`assertEuBedrock`), et à chaque appel pour un modèle sans profil
 * `eu.` : un produit qui crée son client lui-même reste dans l'UE.
 */
export function bedrockClient(credentials: BedrockCredentials): ModelClient {
  const region = credentials.region.trim()
  assertEuBedrock({ region })
  const client =
    "apiKey" in credentials
      ? new AnthropicBedrock({ awsRegion: region, apiKey: credentials.apiKey })
      : new AnthropicBedrock({
          awsRegion: region,
          awsAccessKey: credentials.accessKeyId,
          awsSecretKey: credentials.secretAccessKey,
        })
  const inner = client as unknown as ModelClient
  return {
    messages: {
      stream(params, options) {
        assertEuBedrock({ region, model: params.model })
        return inner.messages.stream(params, options)
      },
    },
  }
}
