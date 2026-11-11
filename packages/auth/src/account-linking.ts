import { APIError } from "better-auth/api"

import { HGDC_PROVIDER_ID } from "./index.ts"

type LinkedAccount = { providerId: string; accountId: string }

/**
 * Liaison refusée : la fiche locale est déjà reliée à un autre compte ID. `APIError` 403 : un appel
 * direct (`/oauth2/link`) reçoit un refus net, le retour OAuth renvoie vers la page d'erreur.
 */
export class HgdcAccountLinkError extends APIError {
  constructor() {
    super("FORBIDDEN", { message: "Ce compte est déjà relié à un autre compte ID." })
  }
}

/**
 * Une fiche locale ne se relie qu'à un seul compte ID. better-auth relie un `sub` inconnu à la fiche
 * qui porte la même adresse (liaison implicite) : une adresse quittée dans ID puis reprise par une
 * autre personne (nouveau `sub`) hériterait sinon des données de l'ancienne. Une fiche sans compte
 * ID (ancien compte local) reste reliable : c'est la première liaison.
 */
export function assertSingleHgdcAccount(existing: readonly LinkedAccount[], incoming: LinkedAccount): void {
  if (incoming.providerId !== HGDC_PROVIDER_ID) return
  if (existing.some((a) => a.providerId === HGDC_PROVIDER_ID && a.accountId !== incoming.accountId))
    throw new HgdcAccountLinkError()
}

/** Ce que la garde lit du contexte des `databaseHooks` de better-auth. */
export type AccountLinkHookContext =
  | {
      context: {
        internalAdapter: { findAccounts(userId: string): Promise<readonly LinkedAccount[]> }
      }
    }
  | null
  | undefined

/**
 * Garde de `databaseHooks.account.create.before`, à appeler dans chaque produit qui se connecte
 * avec ID. Lève `HgdcAccountLinkError` si la fiche a déjà un autre compte ID, et refuse un compte
 * ID créé hors d'une requête (sans contexte, la fiche ne peut pas être lue).
 *
 * ```ts
 * import { guardHgdcAccountLink } from "@hgdc/auth/account-linking"
 * databaseHooks: { account: { create: { before: (account, ctx) => guardHgdcAccountLink(account, ctx) } } }
 * ```
 */
export async function guardHgdcAccountLink(
  account: LinkedAccount & { userId: string },
  context: AccountLinkHookContext,
): Promise<void> {
  if (account.providerId !== HGDC_PROVIDER_ID) return
  if (!context) throw new HgdcAccountLinkError()
  assertSingleHgdcAccount(await context.context.internalAdapter.findAccounts(account.userId), account)
}
