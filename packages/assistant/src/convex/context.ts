import type { GenericDatabaseReader, GenericDatabaseWriter, StorageReader } from "convex/server"

import type { AssistantDataModel } from "./schema.ts"

/*
 * Le `ctx` reçu du produit, les constantes et les textes communs aux modules Convex de l'assistant.
 */

/**
 * Le `ctx` d'une query (lecture) ou d'une mutation (écriture) du produit. Le type de sa base vient
 * du schéma du produit, qui contient `assistantTables()` ; TypeScript ne sait pas comparer deux
 * modèles de données Convex de tailles différentes, d'où cette forme minimale, relue ici avec le
 * type des tables de l'assistant.
 */
export type AssistantReader = { db: { get: unknown; query: unknown } }
export type AssistantWriter = { db: { get: unknown; query: unknown; insert: unknown; patch: unknown; delete: unknown } }

/** La base du produit, relue avec le type des tables de l'assistant. Interne au kit. */
export function db(ctx: AssistantReader): GenericDatabaseWriter<AssistantDataModel> {
  return ctx.db as GenericDatabaseWriter<AssistantDataModel>
}

type ReaderDb<D> = D extends GenericDatabaseWriter<infer M> ? GenericDatabaseReader<M> : D

/** Le `ctx` d'une mutation réduit à la lecture : ce que reçoit la description d'une carte. */
export type ReadOnlyCtx<Ctx extends { db: unknown }> = Omit<
  Ctx,
  "db" | "storage" | "scheduler" | "runMutation" | "runAction"
> & {
  db: ReaderDb<Ctx["db"]>
  /** Lecture des fichiers seulement : ni `delete`, ni `generateUploadUrl`, ni `store`. */
  storage: StorageReader
}

/** Une vue en lecture seule du `ctx` : ni écriture en base ou en stockage, ni planificateur, à l'exécution aussi. */
export function readOnly<Ctx extends { db: unknown }>(ctx: Ctx): ReadOnlyCtx<Ctx> {
  const source = ctx.db as GenericDatabaseReader<AssistantDataModel>
  const reader = {
    get: (...args: Parameters<typeof source.get>) => source.get(...args),
    query: (...args: Parameters<typeof source.query>) => source.query(...args),
    normalizeId: (...args: Parameters<typeof source.normalizeId>) => source.normalizeId(...args),
    system: source.system,
  }
  const {
    scheduler: _s,
    runMutation: _m,
    runAction: _a,
    storage,
    ...rest
  } = ctx as Ctx & {
    scheduler?: unknown
    runMutation?: unknown
    runAction?: unknown
    storage?: StorageReader
  }
  const files: StorageReader = {
    getUrl: (...args: Parameters<StorageReader["getUrl"]>) =>
      storage ? storage.getUrl(...args) : Promise.resolve(null),
    getMetadata: (...args: Parameters<StorageReader["getMetadata"]>) =>
      storage ? storage.getMetadata(...args) : Promise.resolve(null),
  }
  return { ...rest, db: reader, storage: files } as unknown as ReadOnlyCtx<Ctx>
}

/** La personne vérifiée par la garde du produit, dans l'organisation de la demande. */
export type Speaker = { organizationId: string; userId: string }

/** Au-delà, une réponse est déclarée interrompue (une action Convex dure 10 minutes au plus). */
export const STUCK_AFTER_MS = 11 * 60_000
export const MAX_TEXT = 4000
/** Réservation par tour avec la clé de la plateforme : 3 crédits. */
export const RESERVE_MICROS = 30_000
/** Durée de vie d'une carte à confirmer. */
export const ACTION_TTL_MS = 24 * 60 * 60_000

export type TurnTexts = {
  empty: string
  tooLong: (max: number) => string
  notConfigured: string
  exhausted: (limit: number) => string
  busy: string
  full: string
  notFound: string
  alreadyHandled: string
  interrupted: string
  expired: string
  changed: string
}

export const TURN_TEXTS: TurnTexts = {
  empty: "Écris ta demande.",
  tooLong: (max) => `${max} caractères au plus par message.`,
  notConfigured: "L'assistant n'est pas encore branché. Un administrateur peut ajouter la clé dans les réglages.",
  exhausted: (limit) =>
    `Les ${limit} crédits du mois sont utilisés. Le compteur repart le 1er du mois, ou un administrateur peut ajouter la clé de l'organisation dans les réglages.`,
  busy: "L'assistant répond encore. Un instant.",
  full: "Cette conversation est pleine. Ouvre une nouvelle conversation pour continuer.",
  notFound: "Introuvable.",
  alreadyHandled: "Cette action a déjà été traitée.",
  interrupted: "La réponse a été interrompue. Réessaie.",
  expired: "Cette proposition a expiré. Redemande-la.",
  changed: "Le contenu a changé depuis la proposition. Relis-le, puis redemande l'action.",
}

/** Une réponse encore en cours (ni finie, ni coincée au-delà de `STUCK_AFTER_MS`). */
export const inFlight = (m: { status: string; _creationTime: number }, now: number): boolean =>
  (m.status === "pending" || m.status === "streaming") && now - m._creationTime <= STUCK_AFTER_MS
