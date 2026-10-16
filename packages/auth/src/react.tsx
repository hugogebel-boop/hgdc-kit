import { useEffect, useState, type ButtonHTMLAttributes, type ReactElement } from "react"

import { HGDC_PROVIDER_ID, hasSyncedMarker, hgdcRefreshPath } from "./index.ts"

/** Ce que le bouton utilise du client better-auth (plugin `genericOAuthClient`). */
export type HgdcAuthClient = {
  signIn: {
    oauth2: (args: {
      providerId: string
      callbackURL?: string
      errorCallbackURL?: string
    }) => Promise<{ error?: unknown } | null | undefined>
  }
}

export type HgdcSignInButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "children"> & {
  authClient: HgdcAuthClient
  /** Page d'arrivée après la connexion, `/` par défaut. */
  callbackURL?: string
  /** Page d'arrivée si HGDC Account refuse ou si la personne annule. */
  errorCallbackURL?: string
  /** Appelé quand la redirection n'a pas pu partir (réseau, configuration). */
  onError?: (error: unknown) => void
  label?: string
}

export type HgdcSignInOptions = { callbackURL?: string; errorCallbackURL?: string }

/**
 * Part vers HGDC Account. Renvoie `{ ok: true }` quand la redirection est lancée,
 * sinon l'erreur du client ou du réseau, sans lever.
 */
export async function startHgdcSignIn(
  authClient: HgdcAuthClient,
  { callbackURL = "/", errorCallbackURL }: HgdcSignInOptions = {},
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    const result = await authClient.signIn.oauth2({
      providerId: HGDC_PROVIDER_ID,
      callbackURL,
      ...(errorCallbackURL ? { errorCallbackURL } : {}),
    })
    return result?.error ? { ok: false, error: result.error } : { ok: true }
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * Le H tricolore de la famille, copie exacte de `@hgdc/ui/family/hfamily-icon.svg` (un test le
 * vérifie) : `@hgdc/auth` ne dépend pas de `@hgdc/ui`.
 */
export const HGDC_MARK_SVG: string =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="l" x1="0" y1="24" x2="0" y2="232" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2c78fd"/><stop offset="1" stop-color="#7343fe"/></linearGradient><linearGradient id="r" x1="0" y1="24" x2="0" y2="232" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fe5292"/><stop offset="1" stop-color="#ff9a46"/></linearGradient><linearGradient id="b" x1="64" y1="0" x2="192" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8145ff"/><stop offset="1" stop-color="#fe5292"/></linearGradient></defs><rect x="43" y="24" width="57" height="208" rx="18" fill="url(#l)"/><rect x="156" y="24" width="57" height="208" rx="18" fill="url(#r)"/><rect x="67" y="107" width="122" height="43" rx="14" fill="url(#b)"/></svg>'

/**
 * Le H tricolore de la famille, en image : ses dégradés gardent leurs identifiants pour eux, deux
 * marques dans une page ne se marchent pas dessus. Couleurs pleines, jamais recolorées.
 */
export function HgdcMark({ className }: { className?: string }): ReactElement {
  return (
    <img
      src={`data:image/svg+xml,${encodeURIComponent(HGDC_MARK_SVG)}`}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
      draggable={false}
      className={className}
    />
  )
}

/**
 * Bouton « Se connecter avec H family ». Sans style propre : le produit le met en forme par
 * `className`, l'état d'attente est exposé par `aria-busy` et `data-pending`.
 */
export function HgdcSignInButton({
  authClient,
  callbackURL = "/",
  errorCallbackURL,
  onError,
  label = "Se connecter avec H family",
  disabled,
  ...rest
}: HgdcSignInButtonProps): ReactElement {
  const [pending, setPending] = useState(false)

  async function signIn() {
    setPending(true)
    const result = await startHgdcSignIn(authClient, {
      callbackURL,
      ...(errorCallbackURL ? { errorCallbackURL } : {}),
    })
    // Succès : le navigateur part vers HGDC Account, le bouton reste en attente.
    if (!result.ok) {
      setPending(false)
      onError?.(result.error)
    }
  }

  return (
    <button
      {...rest}
      type="button"
      disabled={disabled === true || pending}
      aria-busy={pending}
      data-pending={pending ? "" : undefined}
      onClick={() => void signIn()}
    >
      <HgdcMark />
      <span>{pending ? "Redirection vers Account…" : label}</span>
    </button>
  )
}

/**
 * Page d'une organisation inconnue du produit, ou dont la personne n'est pas membre dans sa copie :
 * une invitation acceptée dans Account n'y arrive qu'à la session suivante (ADR 0013). Quand
 * `unknown` est vrai, part une fois vers `/auth/hgdc?refresh=1&next=<page>` et rend `true` (afficher
 * un chargement). Au retour (`?synced=1`), rend `false` : afficher « introuvable ».
 *
 * Côté client seulement : à appeler une fois la liste des organisations chargée.
 *
 * ```tsx
 * const refreshing = useOrganizationRefresh(viewer !== undefined && !space)
 * if (refreshing) return <FamilyLoader page />
 * if (!space) return <NotFound />
 * ```
 */
export function useOrganizationRefresh(unknown: boolean): boolean {
  const synced = typeof window === "undefined" || hasSyncedMarker(window.location.search)
  const refreshing = unknown && !synced
  useEffect(() => {
    if (!refreshing) return
    const { pathname, search, hash } = window.location
    window.location.replace(hgdcRefreshPath(`${pathname}${search}${hash}`))
  }, [refreshing])
  return refreshing
}
