// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Board, type BoardColumn, type BoardMove } from "./board.tsx"

afterEach(cleanup)

type Card = { id: string; title: string; locked?: boolean }

const COLUMNS: BoardColumn<Card>[] = [
  {
    id: "todo",
    label: "À faire",
    title: "À faire",
    cards: [
      { id: "a", title: "Maquette" },
      { id: "b", title: "Textes" },
    ],
  },
  { id: "doing", label: "En cours", title: "En cours", cards: [{ id: "c", title: "Recette", locked: true }] },
]

function setup(onMove = vi.fn<(move: BoardMove) => void>()) {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  render(
    <Board
      label="Tableau du projet"
      columns={COLUMNS}
      cardKey={(card) => card.id}
      cardLabel={(card) => card.title}
      renderCard={(card, { handle }) => (
        <span>
          {handle}
          {card.title}
        </span>
      )}
      onMove={onMove}
      canMove={(card) => !card.locked}
    />,
  )
  return onMove
}

const card = (title: string) =>
  (screen.queryByRole("button", { name: `Déplacer ${title}` }) ?? screen.getByText(title)) as HTMLElement

describe("Board", () => {
  it("se déplace au clavier : saisir, changer de colonne, poser", () => {
    const onMove = setup()
    const maquette = card("Maquette")
    act(() => maquette.focus())
    fireEvent.keyDown(maquette, { key: " " })
    expect(screen.getByText(/Maquette saisie\. À faire, position 1\./)).toBeTruthy()
    fireEvent.keyDown(card("Maquette"), { key: "ArrowRight" })
    expect(screen.getByText("En cours, position 1")).toBeTruthy()
    fireEvent.keyDown(card("Maquette"), { key: "ArrowDown" })
    fireEvent.keyDown(card("Maquette"), { key: "Enter" })
    expect(onMove).toHaveBeenCalledWith({ cardId: "a", fromColumnId: "todo", toColumnId: "doing", toIndex: 1 })
    expect(screen.getByText(/Maquette posée\. En cours, position 2\./)).toBeTruthy()
  })

  it("Échap annule, rien n'est enregistré", () => {
    const onMove = setup()
    fireEvent.keyDown(card("Textes"), { key: "Enter" })
    fireEvent.keyDown(card("Textes"), { key: "ArrowUp" })
    fireEvent.keyDown(card("Textes"), { key: "Escape" })
    expect(onMove).not.toHaveBeenCalled()
    expect(screen.getByText("Textes : déplacement annulé.")).toBeTruthy()
  })

  it("une carte verrouillée ne se saisit pas, et la touche Espace d'un bouton reste au bouton", () => {
    const onMove = setup()
    fireEvent.keyDown(card("Recette"), { key: " " })
    fireEvent.keyDown(card("Recette"), { key: "ArrowLeft" })
    fireEvent.keyDown(card("Recette"), { key: " " })
    expect(onMove).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Déplacer Recette" })).toBeNull()
    expect(screen.getByRole("region", { name: "Tableau du projet" })).toBeTruthy()
  })

  it("poser à la même place n'appelle pas onMove", () => {
    const onMove = setup()
    fireEvent.keyDown(card("Maquette"), { key: " " })
    fireEvent.keyDown(card("Maquette"), { key: " " })
    expect(onMove).not.toHaveBeenCalled()
  })
})
