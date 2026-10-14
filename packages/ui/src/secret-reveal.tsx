import ViewIcon from "@hugeicons/core-free-icons/ViewIcon"
import ViewOffIcon from "@hugeicons/core-free-icons/ViewOffIcon"
import { HugeiconsIcon } from "@hugeicons/react"
import { useId, useState } from "react"

import { Alert } from "./alert.tsx"
import { Button } from "./button.tsx"
import { CopyButton } from "./copy-button.tsx"
import { cn } from "./cn.ts"

const MASK = "•".repeat(24)

/**
 * Un secret qui ne s'affiche qu'une fois (clé d'API, jeton) : masqué à l'écran tant qu'on ne
 * demande pas à le voir, copiable sans l'afficher, puis retiré de la page quand la personne
 * confirme l'avoir mis de côté. Le produit, lui, n'en garde que l'empreinte.
 */
export function SecretReveal({
  value,
  label = "Clé secrète",
  onDismiss,
  className,
}: {
  value: string
  /** Ce qu'est le secret : « Clé d'API », « Jeton de déploiement ». */
  label?: string
  /** Appelé quand la personne confirme l'avoir copié : le produit oublie la valeur en clair. */
  onDismiss?: () => void
  className?: string
}): React.JSX.Element {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const id = useId()

  if (dismissed)
    return (
      <div data-slot="secret-reveal" data-state="dismissed" className={cn("grid gap-2", className)}>
        <p className="text-sm font-medium">{label}</p>
        <p className="rounded-2xl bg-foreground/[0.05] px-4 py-3 font-mono text-[13px] text-muted-foreground">
          <span aria-hidden>{MASK}</span>
          <span className="sr-only">Valeur masquée</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Cette valeur n'est plus affichée. Pour en obtenir une nouvelle, crée une autre clé.
        </p>
      </div>
    )

  return (
    <div data-slot="secret-reveal" data-state="shown" className={cn("grid gap-3", className)}>
      <Alert tone="warning" title="Copie-la maintenant">
        Tu ne pourras plus la revoir une fois cette fenêtre fermée.
      </Alert>
      <div className="grid gap-2">
        <p id={id} className="text-sm font-medium">
          {label}
        </p>
        <div className="flex min-w-0 items-center gap-1 rounded-2xl bg-foreground/[0.05] py-1.5 pr-1.5 pl-4">
          <code aria-labelledby={id} className="min-w-0 flex-1 truncate py-1 font-mono text-[13px]">
            {visible ? value : MASK}
          </code>
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Masquer" : "Afficher"}
            aria-pressed={visible}
            title={visible ? "Masquer" : "Afficher"}
            className="touch-target grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <HugeiconsIcon icon={visible ? ViewOffIcon : ViewIcon} aria-hidden className="size-4" />
          </button>
          <CopyButton value={value} label={`Copier : ${label}`} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => {
            setDismissed(true)
            onDismiss?.()
          }}
        >
          C'est copié
        </Button>
      </div>
    </div>
  )
}
