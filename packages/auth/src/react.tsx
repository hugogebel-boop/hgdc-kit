import { useState, type ButtonHTMLAttributes, type ReactElement } from "react"

import { HGDC_PROVIDER_ID } from "./index.ts"

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

/** Monogramme HGDC, en `currentColor`. */
export function HgdcMark(props: { className?: string }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" {...props}>
      <rect x="2.5" y="8.5" width="13" height="7" rx="2" transform="rotate(45 9 12)" />
      <rect x="8.5" y="8.5" width="13" height="7" rx="2" transform="rotate(45 15 12)" opacity="0.6" />
    </svg>
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
      <span>{pending ? "Redirection vers HGDC…" : label}</span>
    </button>
  )
}
