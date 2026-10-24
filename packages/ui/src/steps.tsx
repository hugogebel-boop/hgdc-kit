import { cn } from "./cn.ts"

/**
 * Marche à suivre numérotée, courte (3 à 5 étapes) : brancher un outil, configurer un DNS.
 * Une étape = une phrase d'action ; le détail facultatif passe dessous, en plus petit.
 *
 * ```tsx
 * <Steps items={[
 *   { title: "Dans Grafana, ouvre Alerting puis Contact points." },
 *   { title: "Ajoute un contact point Webhook et colle l'adresse.", detail: <Snippet value={url} /> },
 * ]} />
 * ```
 */
export function Steps({
  items,
  className,
}: {
  items: Array<{ title: React.ReactNode; detail?: React.ReactNode }>
  className?: string
}): React.JSX.Element {
  return (
    <ol data-slot="steps" className={cn("space-y-4", className)}>
      {items.map((item, index) => (
        <li key={index} className="flex gap-3">
          <span
            aria-hidden
            className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums"
          >
            {index + 1}
          </span>
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <p className="text-sm text-pretty">{item.title}</p>
            {item.detail ? <div className="text-sm text-muted-foreground">{item.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
