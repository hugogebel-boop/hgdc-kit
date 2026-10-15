import { useId, type FormEvent, type ReactNode } from "react"

import { Button } from "./button.tsx"
import { cn } from "./cn.ts"

/**
 * Un bloc de réglages : titre, description, champs, et un pied avec son propre bouton
 * Enregistrer. Chaque bloc s'enregistre seul : on ne perd pas la saisie d'un bloc en validant
 * un autre, et l'erreur dit lequel a échoué. Repris de la page de réglages de Host.
 *
 * Avec `onSave`, le bloc est un formulaire : Entrée dans un champ enregistre, le bouton reste
 * grisé tant que `dirty` est faux et tourne pendant `saving`. Sans `onSave`, `footer` reçoit
 * les actions telles quelles (« Supprimer le projet » d'un bloc `tone="danger"`).
 *
 * ```tsx
 * <SettingsSection
 *   title="Nom de l'espace"
 *   description="Visible par les membres et dans les e-mails d'invitation."
 *   dirty={name !== initial}
 *   saving={saving}
 *   onSave={save}
 * >
 *   <Field><FieldLabel>Nom</FieldLabel><Input value={name} onChange={…} /></Field>
 * </SettingsSection>
 * ```
 */
export function SettingsSection({
  title,
  description,
  children,
  footer,
  footerNote,
  tone = "default",
  onSave,
  dirty = true,
  saving = false,
  saveLabel = "Enregistrer",
  className,
}: {
  title: string
  description?: ReactNode
  children?: ReactNode
  /** Actions du pied, à la place du bouton Enregistrer (ou avant lui avec `onSave`). */
  footer?: ReactNode
  /** Texte discret à gauche du pied : « Appliqué au prochain déploiement. » */
  footerNote?: ReactNode
  /** `danger` : la zone des actions irréversibles, cerclée de rouge. */
  tone?: "default" | "danger"
  /** Enregistre le bloc et affiche lui-même son erreur (toast, `FieldError`) : rien ne l'attrape ici. */
  onSave?: () => void | Promise<void>
  /** Faux : rien n'a changé, le bouton reste grisé. */
  dirty?: boolean
  saving?: boolean
  saveLabel?: string
  className?: string
}): React.JSX.Element {
  const titleId = useId()
  const descriptionId = useId()
  const hasFooter = Boolean(footer || footerNote || onSave)

  const body = (
    <>
      <div className="grid gap-4 p-5 sm:p-6">
        <div>
          <h2 id={titleId} className="text-base font-semibold text-balance">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 max-w-prose text-sm text-pretty text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {children}
      </div>
      {hasFooter ? (
        <div
          data-slot="settings-section-footer"
          className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-muted/40 px-5 py-3 sm:px-6"
        >
          {footerNote ? <p className="mr-auto text-sm text-muted-foreground">{footerNote}</p> : null}
          {footer}
          {onSave ? (
            <Button type="submit" size="sm" disabled={!dirty} isLoading={saving}>
              {saveLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  )

  const shared = {
    "data-slot": "settings-section",
    "data-tone": tone,
    "aria-labelledby": titleId,
    ...(description ? { "aria-describedby": descriptionId } : {}),
    className: cn("overflow-hidden rounded-3xl surface", tone === "danger" && "ring-1 ring-destructive/30", className),
  }

  if (!onSave) return <section {...shared}>{body}</section>

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dirty || saving) return
    void onSave()
  }
  // Un `<form>` nommé par son titre a le rôle « form » : il apparaît dans les repères du lecteur d'écran.
  return (
    <form {...shared} onSubmit={submit}>
      {body}
    </form>
  )
}
