import { AnthropicBedrock } from "@anthropic-ai/bedrock-sdk"

import type { ModelClient } from "./node.ts"

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

export function bedrockClient(credentials: BedrockCredentials): ModelClient {
  const client =
    "apiKey" in credentials
      ? new AnthropicBedrock({ awsRegion: credentials.region, apiKey: credentials.apiKey })
      : new AnthropicBedrock({
          awsRegion: credentials.region,
          awsAccessKey: credentials.accessKeyId,
          awsSecretKey: credentials.secretAccessKey,
        })
  return client as unknown as ModelClient
}
