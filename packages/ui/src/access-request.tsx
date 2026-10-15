import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import CheckmarkCircle02Icon from "@hugeicons/core-free-icons/CheckmarkCircle02Icon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"
import type { ReactElement, ReactNode } from "react"

import { Alert } from "./alert.tsx"
import { Button, buttonVariants } from "./button.tsx"
import { Field, FieldError, FieldLabel } from "./field.tsx"
import { Input } from "./input.tsx"
import { Textarea } from "./textarea.tsx"

/**
 * Demander un accès à un produit de la famille, sans compte : les comptes HGDC s'ouvrent sur
 * invitation. Le formulaire poste en JSON vers un formulaire HGDC Mail Forms (`POST /f/<id>`,
 * réponse `{ ok }` ou `{ ok: false, error: { code }, errors }`) ; l'équipe reçoit l'avis et
 * invite depuis HGDC Account. Le texte est au tutoiement, comme les pages publiques de la famille.
 */

export type AccessRequestValues = { prenom: string; nom: string; entreprise: string; email: string; message: string }

export const EMPTY_ACCESS_REQUEST: AccessRequestValues = { prenom: "", nom: "", entreprise: "", email: "", message: "" }

/** Ce qu'il faut de `fetch` : une adresse et une requête. */
export type AccessRequestFetcher = (url: string, init: RequestInit) => Promise<Response>

export type AccessRequestResult =
  | { kind: "sent" }
  | { kind: "invalid"; errors: Record<string, string> }
  | { kind: "failed"; message: string }

/** Les refus de l'endpoint, dits au tutoiement. */
const FAILURES: Record<string, string> = {
  rate_limited: "Trop d'envois en peu de temps. Réessaie dans une minute.",
  origin_not_allowed: "Ce formulaire ne s'envoie que depuis le site de HGDC.",
  form_closed: "Les demandes d'accès sont fermées pour le moment. Réessaie plus tard.",
}

/**
 * Envoie la demande et traduit la réponse. Fonction pure à part du composant : un produit peut
 * l'appeler depuis son propre formulaire. `trap` est le piège à robots (`_gotcha`), vide pour un humain.
 */
export async function submitAccessRequest(
  endpoint: string,
  values: AccessRequestValues,
  product: string,
  { trap = "", fetcher = (url, init) => fetch(url, init) }: { trap?: string; fetcher?: AccessRequestFetcher } = {},
): Promise<AccessRequestResult> {
  let result: { ok?: boolean; error?: { code?: string }; errors?: Record<string, string> }
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...values, produit: product, _gotcha: trap }),
    })
    result = (await response.json()) as typeof result
  } catch {
    return { kind: "failed", message: "Impossible d'envoyer la demande. Vérifie ta connexion et réessaie." }
  }
  if (result.ok) return { kind: "sent" }
  if (result.errors && Object.keys(result.errors).length) return { kind: "invalid", errors: result.errors }
  return {
    kind: "failed",
    message: FAILURES[result.error?.code ?? ""] ?? "La demande n'est pas partie. Réessaie dans un instant.",
  }
}

function LinkSlot({
  href,
  render,
  className,
  children,
}: {
  href: string
  render: ReactElement | undefined
  className: string
  children: ReactNode
}): React.JSX.Element {
  return useRender({
    defaultTagName: "a",
    render,
    props: mergeProps<"a">({ className, children } as React.ComponentProps<"a">, render ? {} : { href }),
  })
}

export function AccessRequest({
  endpoint,
  product,
  title = `Demander un accès à ${product}`,
  description = "Les comptes HGDC s'ouvrent sur invitation. Dis-nous qui tu es : on te répond rapidement et, si c'est bon, tu reçois une invitation par e-mail.",
  messageLabel = "Ton projet, en quelques mots (facultatif)",
  signInHref = "/sign-in",
  signInRender,
  homeHref = "/",
  homeRender,
  fetcher,
}: {
  /** Adresse d'envoi du formulaire Forms : `https://<deploiement>.convex.site/f/<id>`. */
  endpoint: string
  /** Nom affiché et valeur du champ caché `produit` : « HGDC Mail ». */
  product: string
  title?: string
  description?: ReactNode
  messageLabel?: string
  signInHref?: string
  /** Lien du routeur du produit vers la connexion : `signInRender={<Link to="/sign-in" />}`. */
  signInRender?: ReactElement
  homeHref?: string
  homeRender?: ReactElement
  /** Pour les tests. */
  fetcher?: AccessRequestFetcher
}): React.JSX.Element {
  const [values, setValues] = useState<AccessRequestValues>(EMPTY_ACCESS_REQUEST)
  const [trap, setTrap] = useState("")
  const [pending, setPending] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const set = (key: keyof AccessRequestValues) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [key]: event.target.value }))
    setFieldErrors(({ [key]: _gone, ...rest }) => rest)
  }

  async function submit(event: React.SyntheticEvent) {
    event.preventDefault()
    setPending(true)
    setFailure(null)
    setFieldErrors({})
    const result = await submitAccessRequest(endpoint, values, product, { trap, ...(fetcher ? { fetcher } : {}) })
    if (result.kind === "sent") setSentTo(values.email.trim())
    else if (result.kind === "invalid") setFieldErrors(result.errors)
    else setFailure(result.message)
    setPending(false)
  }

  if (sentTo) {
    return (
      <div data-slot="access-request" className="grid rise gap-6" key="access-done">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-10 pop-in text-status-active" />
        <div>
          <h1 className="text-3xl font-semibold text-balance">Demande envoyée</h1>
          <p className="mt-2 text-muted-foreground">
            Merci. Un accusé de réception part vers {sentTo}. Si ta demande est acceptée, tu reçois une invitation de
            HGDC Account pour créer ton compte.
          </p>
        </div>
        <LinkSlot href={homeHref} render={homeRender} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Retour à l'accueil
        </LinkSlot>
      </div>
    )
  }

  const invalid = (key: keyof AccessRequestValues) => (fieldErrors[key] ? true : undefined)
  const field = (key: keyof AccessRequestValues, label: string, input: ReactNode) => (
    <Field data-invalid={invalid(key)}>
      <FieldLabel htmlFor={`acces-${key}`}>{label}</FieldLabel>
      {input}
      {fieldErrors[key] ? <FieldError>{fieldErrors[key]}</FieldError> : null}
    </Field>
  )
  const text = (key: keyof AccessRequestValues, autoComplete: string, max: number, type = "text") => (
    <Input
      id={`acces-${key}`}
      type={type}
      autoComplete={autoComplete}
      required
      maxLength={max}
      value={values[key]}
      onChange={set(key)}
      aria-invalid={invalid(key)}
    />
  )

  return (
    <form data-slot="access-request" onSubmit={submit} className="grid rise gap-6" key="access">
      <div>
        <h1 className="text-3xl font-semibold text-balance">{title}</h1>
        {description ? <p className="mt-2 text-muted-foreground">{description}</p> : null}
      </div>
      {failure ? (
        <Alert tone="destructive" role="alert">
          {failure}
        </Alert>
      ) : null}
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("prenom", "Prénom", text("prenom", "given-name", 100))}
          {field("nom", "Nom", text("nom", "family-name", 100))}
        </div>
        {field("entreprise", "Entreprise", text("entreprise", "organization", 120))}
        {field("email", "E-mail professionnel", text("email", "email", 320, "email"))}
        {field(
          "message",
          messageLabel,
          <Textarea
            id="acces-message"
            rows={3}
            maxLength={2000}
            value={values.message}
            onChange={set("message")}
            aria-invalid={invalid("message")}
          />,
        )}
        {/* Piège à robots : caché aux personnes, rempli par les robots. */}
        <input
          type="text"
          name="_gotcha"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={trap}
          onChange={(e) => setTrap(e.target.value)}
          className="absolute -left-[9999px] size-px opacity-0"
        />
      </div>
      <Button type="submit" size="lg" isLoading={pending}>
        Envoyer la demande
      </Button>
      <p className="text-sm text-muted-foreground">
        Déjà un compte HGDC ?{" "}
        <LinkSlot
          href={signInHref}
          render={signInRender}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Se connecter
        </LinkSlot>
      </p>
    </form>
  )
}
