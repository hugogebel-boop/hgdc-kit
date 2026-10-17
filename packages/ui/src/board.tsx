import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react"

import { cn } from "./cn.ts"

export type BoardColumn<Card> = {
  id: string
  title: ReactNode
  /** Nom de la colonne pour les annonces : « En cours ». */
  label: string
  cards: ReadonlyArray<Card>
  /** Sous les cartes : un bouton « Ajouter », un total. */
  footer?: ReactNode
}

export type BoardMove = { cardId: string; fromColumnId: string; toColumnId: string; toIndex: number }

type Position = { columnId: string; index: number }
type Grab = { cardId: string; from: Position; to: Position; via: "keyboard" | "pointer" }

/** Distance avant qu'un appui devienne un glisser : un clic reste un clic. */
const DRAG_THRESHOLD = 6

function moveInColumns<Card>(
  columns: ReadonlyArray<BoardColumn<Card>>,
  cardKey: (card: Card) => string,
  grab: Grab | null,
): Array<{ column: BoardColumn<Card>; cards: Card[] }> {
  const base = columns.map((column) => ({ column, cards: [...column.cards] }))
  if (!grab) return base
  let moving: Card | undefined
  for (const entry of base) {
    const index = entry.cards.findIndex((card) => cardKey(card) === grab.cardId)
    if (index >= 0) moving = entry.cards.splice(index, 1)[0]
  }
  const target = base.find((entry) => entry.column.id === grab.to.columnId)
  if (moving !== undefined && target) target.cards.splice(Math.min(grab.to.index, target.cards.length), 0, moving)
  return base
}

/**
 * Tableau de colonnes (Kanban) dont les cartes se déplacent à la souris, au doigt ou au clavier,
 * par leur poignée (`handle`, à placer dans la carte) : le reste de la carte garde ses clics et le
 * défilement. Au clavier, Espace ou Entrée sur la poignée saisit la carte, les flèches la déplacent
 * (haut et bas dans la colonne, gauche et droite d'une colonne à l'autre), Espace ou Entrée la
 * pose, Échap annule ; chaque étape est annoncée aux lecteurs d'écran.
 *
 * Contrôlé : `onMove` reçoit le déplacement, le produit l'enregistre et rend les nouvelles
 * colonnes. `canMove` refuse une carte (verrouillée, en lecture seule).
 */
export function Board<Card>({
  label,
  columns,
  cardKey,
  cardLabel,
  renderCard,
  onMove,
  canMove = () => true,
  className,
}: {
  /** Nom du tableau : « Tableau du projet ». */
  label: string
  columns: ReadonlyArray<BoardColumn<Card>>
  cardKey: (card: Card) => string
  /** Nom de la carte pour les annonces : « Maquette de l'accueil ». */
  cardLabel: (card: Card) => string
  /**
   * La carte. `handle` est la poignée (bouton « Déplacer … ») à placer dans la carte : elle porte
   * le clavier et le glisser, le reste de la carte garde ses clics. `null` si `canMove` refuse.
   */
  renderCard: (card: Card, state: { dragging: boolean; handle: ReactNode }) => ReactNode
  onMove: (move: BoardMove) => void
  canMove?: (card: Card) => boolean
  className?: string
}): React.JSX.Element {
  const [grab, setGrab] = useState<Grab | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [ghost, setGhost] = useState<{ x: number; y: number; width: number } | null>(null)
  const pressed = useRef<{
    cardId: string
    from: Position
    x: number
    y: number
    width: number
    pointerId: number
  } | null>(null)
  const instructionsId = useId()
  const view = moveInColumns(columns, cardKey, grab)
  const byId = new Map(columns.flatMap((column) => column.cards.map((card) => [cardKey(card), card] as const)))
  const columnLabel = (id: string) => columns.find((column) => column.id === id)?.label ?? ""
  const where = (position: Position) => `${columnLabel(position.columnId)}, position ${position.index + 1}`

  function focusCard(cardId: string) {
    // Après le rendu : la carte a pu changer de colonne, donc de nœud.
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-board-handle="${CSS.escape(cardId)}"]`)?.focus(),
    )
  }

  function start(card: Card, from: Position, via: Grab["via"]) {
    setGrab({ cardId: cardKey(card), from, to: from, via })
    setAnnouncement(`${cardLabel(card)} saisie. ${where(from)}.`)
  }

  function finish(commit: boolean) {
    if (!grab) return
    const card = byId.get(grab.cardId)
    const changed = grab.to.columnId !== grab.from.columnId || grab.to.index !== grab.from.index
    if (commit && changed)
      onMove({
        cardId: grab.cardId,
        fromColumnId: grab.from.columnId,
        toColumnId: grab.to.columnId,
        toIndex: grab.to.index,
      })
    setAnnouncement(
      card
        ? commit && changed
          ? `${cardLabel(card)} posée. ${where(grab.to)}.`
          : `${cardLabel(card)} : déplacement annulé.`
        : "",
    )
    const id = grab.cardId
    setGrab(null)
    setGhost(null)
    if (grab.via === "keyboard") focusCard(id)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>, card: Card, position: Position) {
    if (event.target !== event.currentTarget) return
    const id = cardKey(card)
    if (!grab) {
      if ((event.key === " " || event.key === "Enter") && canMove(card)) {
        event.preventDefault()
        start(card, position, "keyboard")
      }
      return
    }
    if (grab.cardId !== id) return
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault()
      finish(true)
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      finish(false)
      return
    }
    const columnIndex = view.findIndex((entry) => entry.column.id === grab.to.columnId)
    let next: Position | null = null
    const sizeOf = (index: number) => view[index]?.cards.filter((c) => cardKey(c) !== id).length ?? 0
    if (event.key === "ArrowUp") next = { ...grab.to, index: Math.max(0, grab.to.index - 1) }
    if (event.key === "ArrowDown") next = { ...grab.to, index: Math.min(sizeOf(columnIndex), grab.to.index + 1) }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const target = view[columnIndex + (event.key === "ArrowLeft" ? -1 : 1)]
      if (target)
        next = {
          columnId: target.column.id,
          index: Math.min(grab.to.index, sizeOf(columnIndex + (event.key === "ArrowLeft" ? -1 : 1))),
        }
    }
    if (!next) return
    event.preventDefault()
    setGrab({ ...grab, to: next })
    setAnnouncement(where(next))
    focusCard(id)
  }

  /** Colonne et place sous le pointeur, d'après le milieu des cartes. */
  function positionAt(x: number, y: number, cardId: string): Position | null {
    const element = document.elementFromPoint(x, y)
    const column = element?.closest<HTMLElement>("[data-board-column]")
    const columnId = column?.dataset.boardColumn
    if (!column || !columnId) return null
    const cards = [...column.querySelectorAll<HTMLElement>("[data-board-card]")].filter(
      (node) => node.dataset.boardCard !== cardId,
    )
    const index = cards.findIndex((node) => {
      const rect = node.getBoundingClientRect()
      return y < rect.top + rect.height / 2
    })
    return { columnId, index: index === -1 ? cards.length : index }
  }

  function onPointerDown(event: PointerEvent<HTMLElement>, card: Card, position: Position) {
    if (event.button !== 0 || !canMove(card)) return
    const rect = (event.currentTarget.closest("[data-board-card]") ?? event.currentTarget).getBoundingClientRect()
    pressed.current = {
      cardId: cardKey(card),
      from: position,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      pointerId: event.pointerId,
    }
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const press = pressed.current
    if (!press || press.pointerId !== event.pointerId) return
    if (!grab) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD) return
      const card = byId.get(press.cardId)
      if (!card) return
      event.currentTarget.setPointerCapture(event.pointerId)
      start(card, press.from, "pointer")
    }
    setGhost({ x: event.clientX, y: event.clientY, width: press.width })
    const next = positionAt(event.clientX, event.clientY, press.cardId)
    if (next) setGrab((current) => (current ? { ...current, to: next } : current))
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const press = pressed.current
    if (!press || press.pointerId !== event.pointerId) return
    pressed.current = null
    if (grab) finish(true)
  }

  const ghostCard = grab?.via === "pointer" ? byId.get(grab.cardId) : undefined

  return (
    <div className={cn("grid gap-2", className)}>
      <p id={instructionsId} className="sr-only">
        Espace ou Entrée pour saisir une carte, flèches pour la déplacer, Espace pour la poser, Échap pour annuler.
      </p>
      <div
        role="region"
        aria-label={label}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 sm:snap-none"
      >
        {view.map(({ column, cards }) => (
          <section
            key={column.id}
            data-board-column={column.id}
            aria-label={column.label}
            className={cn(
              "grid w-[85vw] max-w-80 shrink-0 snap-start content-start gap-2 rounded-3xl bg-foreground/[0.04] p-2 sm:w-72",
              grab?.to.columnId === column.id && "ring-2 ring-ring/40",
            )}
          >
            <header className="flex items-center justify-between gap-2 px-2 pt-1 text-sm font-medium">
              {column.title}
            </header>
            <ul className="grid min-h-12 gap-2">
              {cards.map((card, index) => {
                const id = cardKey(card)
                const dragging = grab?.cardId === id
                const movable = canMove(card)
                return (
                  <li
                    key={id}
                    data-board-card={id}
                    className={cn("rounded-2xl", dragging && "opacity-50 ring-2 ring-ring")}
                  >
                    {renderCard(card, {
                      dragging,
                      handle: movable ? (
                        <button
                          type="button"
                          data-board-handle={id}
                          aria-label={`Déplacer ${cardLabel(card)}`}
                          aria-roledescription="poignée de déplacement"
                          aria-describedby={instructionsId}
                          onKeyDown={(event) => onKeyDown(event, card, { columnId: column.id, index })}
                          onPointerDown={(event) => onPointerDown(event, card, { columnId: column.id, index })}
                          onPointerMove={onPointerMove}
                          onPointerUp={onPointerUp}
                          onPointerCancel={() => {
                            pressed.current = null
                            if (grab) finish(false)
                          }}
                          className="inline-flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                        >
                          <svg viewBox="0 0 16 16" aria-hidden className="size-4 fill-current">
                            <circle cx="5.5" cy="3.5" r="1.25" />
                            <circle cx="10.5" cy="3.5" r="1.25" />
                            <circle cx="5.5" cy="8" r="1.25" />
                            <circle cx="10.5" cy="8" r="1.25" />
                            <circle cx="5.5" cy="12.5" r="1.25" />
                            <circle cx="10.5" cy="12.5" r="1.25" />
                          </svg>
                        </button>
                      ) : null,
                    })}
                  </li>
                )
              })}
            </ul>
            {column.footer}
          </section>
        ))}
      </div>
      {ghostCard !== undefined && ghost ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rotate-1 opacity-90"
          style={{ left: ghost.x, top: ghost.y, width: ghost.width }}
        >
          {renderCard(ghostCard, { dragging: true, handle: null })}
        </div>
      ) : null}
      <div aria-live="assertive" className="sr-only">
        {announcement}
      </div>
    </div>
  )
}
