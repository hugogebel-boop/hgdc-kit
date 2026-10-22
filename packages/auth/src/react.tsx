import { useEffect, useState, type ButtonHTMLAttributes, type ReactElement } from "react"

import { HGDC_PROVIDER_ID, hasSyncedMarker, hgdcRefreshPath, normalizeBasePath, type BasePathOptions } from "./index.ts"

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
 * Le H « Double » de la H Collection, copies exactes de `@hgdc/ui/family/hcollection-icon.svg` (fond
 * clair) et `hcollection-icon-dark.svg` (fond sombre) ; un test le vérifie : `@hgdc/auth` ne dépend
 * pas de `@hgdc/ui`.
 */
export const HGDC_MARK_SVG: string =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="9 9 46 46"><defs><linearGradient id="hl" x1="0" y1="11.5" x2="0" y2="47.5" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2c78fd"/><stop offset="1" stop-color="#7343fe"/></linearGradient><linearGradient id="hr" x1="0" y1="11.5" x2="0" y2="47.5" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fe5292"/><stop offset="1" stop-color="#ff9a46"/></linearGradient><linearGradient id="hf" x1="24.5" y1="0" x2="34.5" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="hm" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect x="24" y="24" width="11" height="11" fill="url(#hf)"/></mask><g id="h"><path d="M24 25H35V34H24Z" fill="url(#hr)"/><path d="M24 25H35V34H24Z" fill="url(#hl)" mask="url(#hm)"/><path d="M17.5 11.5H21.5A3 3 0 0 1 24.5 14.5V44.5A3 3 0 0 1 21.5 47.5H17.5A3 3 0 0 1 14.5 44.5V14.5A3 3 0 0 1 17.5 11.5Z" fill="url(#hl)"/><path d="M37.5 11.5H41.5A3 3 0 0 1 44.5 14.5V44.5A3 3 0 0 1 41.5 47.5H37.5A3 3 0 0 1 34.5 44.5V14.5A3 3 0 0 1 37.5 11.5Z" fill="url(#hr)"/></g></defs><use href="#h" transform="translate(6 6)" opacity="0.35"/><use href="#h"/></svg>'

/** Le même H, pour un fond sombre. */
export const HGDC_MARK_DARK_SVG: string =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="9 9 46 46"><defs><linearGradient id="hl" x1="0" y1="11.5" x2="0" y2="47.5" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6aa0ff"/><stop offset="1" stop-color="#9a7bff"/></linearGradient><linearGradient id="hr" x1="0" y1="11.5" x2="0" y2="47.5" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff7aa8"/><stop offset="1" stop-color="#ffb070"/></linearGradient><linearGradient id="hf" x1="24.5" y1="0" x2="34.5" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="hm" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect x="24" y="24" width="11" height="11" fill="url(#hf)"/></mask><g id="h"><path d="M24 25H35V34H24Z" fill="url(#hr)"/><path d="M24 25H35V34H24Z" fill="url(#hl)" mask="url(#hm)"/><path d="M17.5 11.5H21.5A3 3 0 0 1 24.5 14.5V44.5A3 3 0 0 1 21.5 47.5H17.5A3 3 0 0 1 14.5 44.5V14.5A3 3 0 0 1 17.5 11.5Z" fill="url(#hl)"/><path d="M37.5 11.5H41.5A3 3 0 0 1 44.5 14.5V44.5A3 3 0 0 1 41.5 47.5H37.5A3 3 0 0 1 34.5 44.5V14.5A3 3 0 0 1 37.5 11.5Z" fill="url(#hr)"/></g></defs><use href="#h" transform="translate(6 6)" opacity="0.5"/><use href="#h"/></svg>'

const markSrc = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`

/**
 * Mise en page et choix de la variante, embarqués : la marque reste à sa taille et n'affiche qu'un
 * dessin même sans les styles de `@hgdc/ui`. En feuille de style plutôt qu'en `style` sur l'image,
 * qui écraserait le `display: none` du thème. Spécificité au-dessus des règles de `@hgdc/ui`.
 */
export const HGDC_MARK_CSS: string =
  '[data-slot="hgdc-mark"]>img{display:block;width:100%;height:100%}' +
  '[data-slot="hgdc-mark"]>img[data-mark-theme="dark"],.dark [data-slot="hgdc-mark"]>img[data-mark-theme="light"]{display:none}' +
  '.dark [data-slot="hgdc-mark"]>img[data-mark-theme="dark"]{display:block}'

/** Taille sans `className` : celle du texte qui l'accompagne, un peu plus grande. */
const DEFAULT_MARK_SIZE = "1.25em"

/**
 * Le H de la H Collection, en image : ses dégradés gardent leurs identifiants pour eux, deux marques
 * dans une page ne se marchent pas dessus. Les deux variantes sont rendues, le thème (`.dark`) montre
 * la sienne. Sans `className`, 1.25em de côté ; avec, la classe fixe la taille (`size-4`).
 * Couleurs pleines, jamais recolorées.
 */
export function HgdcMark({ className }: { className?: string }): ReactElement {
  return (
    <span
      data-slot="hgdc-mark"
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-block",
        flexShrink: 0,
        ...(className ? {} : { width: DEFAULT_MARK_SIZE, height: DEFAULT_MARK_SIZE }),
      }}
    >
      <style>{HGDC_MARK_CSS}</style>
      {(["light", "dark"] as const).map((theme) => (
        <img
          key={theme}
          src={markSrc(theme === "light" ? HGDC_MARK_SVG : HGDC_MARK_DARK_SVG)}
          alt=""
          width={16}
          height={16}
          draggable={false}
          data-mark-theme={theme}
        />
      ))}
    </span>
  )
}

/**
 * Bouton « Se connecter avec HGDC ». Sans style propre : le produit le met en forme par
 * `className`, l'état d'attente est exposé par `aria-busy` et `data-pending`.
 */
export function HgdcSignInButton({
  authClient,
  callbackURL = "/",
  errorCallbackURL,
  onError,
  label = "Se connecter avec HGDC",
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
 * Produit servi sous un chemin : `useOrganizationRefresh(unknown, { basePath: "/analytics" })`. La
 * base est retirée de l'adresse du navigateur, puis remise devant l'entrée.
 *
 * ```tsx
 * const refreshing = useOrganizationRefresh(viewer !== undefined && !space)
 * if (refreshing) return <FamilyLoader page />
 * if (!space) return <NotFound />
 * ```
 */
export function useOrganizationRefresh(unknown: boolean, options: BasePathOptions = {}): boolean {
  const base = normalizeBasePath(options.basePath)
  const synced = typeof window === "undefined" || hasSyncedMarker(window.location.search)
  const refreshing = unknown && !synced
  useEffect(() => {
    if (!refreshing) return
    const { pathname, search, hash } = window.location
    const inApp =
      base && (pathname === base || pathname.startsWith(`${base}/`)) ? pathname.slice(base.length) || "/" : pathname
    window.location.replace(hgdcRefreshPath(`${inApp}${search}${hash}`, { basePath: base }))
  }, [refreshing, base])
  return refreshing
}
