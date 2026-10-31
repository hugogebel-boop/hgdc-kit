import type { ReactNode } from "react"

/**
 * Un lien écrit par l'assistant. Un chemin de l'application (`/…`) reste un lien interne ; une
 * adresse `https:` s'ouvre dans un nouvel onglet, sans référent ni accès à la page, avec son domaine
 * affiché à côté du texte (un texte trompeur ne cache pas la destination) ; tout le reste
 * (`javascript:`, `http:`, `data:`…) devient du texte. À passer au rendu Markdown du produit
 * (`components={{ a: AssistantLink }}`) ; `renderInternal` pour le lien du routeur.
 */
export function AssistantLink({
  href,
  children,
  renderInternal,
}: {
  href?: string | undefined
  children?: ReactNode
  renderInternal?: (href: string, children: ReactNode) => ReactNode
}): React.JSX.Element {
  const value = (href ?? "").trim()
  const className = "font-medium underline underline-offset-2"
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
    return renderInternal ? (
      <>{renderInternal(value, children)}</>
    ) : (
      <a href={value} className={className}>
        {children}
      </a>
    )
  }
  let url: URL | null = null
  try {
    url = new URL(value)
  } catch {
    url = null
  }
  if (!url || url.protocol !== "https:" || url.username || url.password) return <span>{children}</span>
  return (
    <a href={url.href} target="_blank" rel="noopener noreferrer nofollow" className={className}>
      {children}
      <span className="ml-1 text-xs font-normal text-muted-foreground no-underline">({url.hostname})</span>
    </a>
  )
}

const URL_IN_TEXT = /(https:\/\/[^\s<>"')]+)/g

/** Le rendu par défaut : texte brut en paragraphes, adresses https en liens sûrs. Aucun HTML. */
export function renderPlainText(text: string): ReactNode {
  return text.split(/\n{2,}/).map((paragraph, i) => (
    <p key={i} className="my-2 whitespace-pre-wrap first:mt-0 last:mb-0">
      {paragraph.split(URL_IN_TEXT).map((part, j) =>
        j % 2 === 1 ? (
          <AssistantLink key={j} href={part}>
            {part}
          </AssistantLink>
        ) : (
          part
        ),
      )}
    </p>
  ))
}
