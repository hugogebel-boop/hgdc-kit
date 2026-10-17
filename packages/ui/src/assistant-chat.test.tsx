// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AssistantActionCard,
  AssistantComposer,
  AssistantConversation,
  AssistantExamples,
  AssistantReply,
  AssistantUserMessage,
} from "./assistant-chat.tsx"

afterEach(cleanup)

describe("AssistantComposer", () => {
  it("Entrée envoie, Maj+Entrée non, rien pendant une réponse", () => {
    const onSubmit = vi.fn<() => void>()
    const { rerender } = render(
      <AssistantComposer value="Mes projets ?" onValueChange={() => {}} onSubmit={onSubmit} />,
    )
    const field = screen.getByLabelText("Ta demande")
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.keyDown(field, { key: "Enter" })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    rerender(<AssistantComposer value="Mes projets ?" onValueChange={() => {}} onSubmit={onSubmit} busy />)
    fireEvent.keyDown(screen.getByLabelText("Ta demande"), { key: "Enter" })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Envoyer" })).toHaveProperty("disabled", true)
  })

  it("un texte vide ne part pas", () => {
    const onSubmit = vi.fn<() => void>()
    render(<AssistantComposer value="   " onValueChange={() => {}} onSubmit={onSubmit} label="Votre demande" />)
    fireEvent.keyDown(screen.getByLabelText("Votre demande"), { key: "Enter" })
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe("AssistantActionCard", () => {
  it("confirmer ou annuler tant qu'elle attend, puis son état", () => {
    const onConfirm = vi.fn<() => void>()
    const onCancel = vi.fn<() => void>()
    const { rerender } = render(
      <AssistantActionCard
        title="Saisir du temps sur « Site »"
        details={[{ label: "Durée", value: "1 h 30" }]}
        status="pending"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    expect(screen.getByText("1 h 30")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
    rerender(
      <AssistantActionCard
        title="Saisir du temps"
        status="failed"
        result="Ce projet est archivé."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    expect(screen.queryByRole("button", { name: "Confirmer" })).toBeNull()
    expect(screen.getByText("Échec : Ce projet est archivé.")).toBeTruthy()
  })
})

describe("AssistantConversation", () => {
  it("bulle, attente, pastilles et texte rendu par le produit", () => {
    const onPick = vi.fn<(example: string) => void>()
    render(
      <>
        <AssistantExamples examples={["Où en sont mes projets ?"]} onPick={onPick} />
        <AssistantConversation>
          <AssistantUserMessage>Bonjour</AssistantUserMessage>
          <AssistantReply waiting tools={[{ id: "1", label: "Projets", status: "running" }]} />
          <AssistantReply tools={[{ id: "2", label: "Factures", status: "done" }]}>
            <strong>Deux factures</strong>
          </AssistantReply>
        </AssistantConversation>
      </>,
    )
    expect(screen.getByText("Bonjour")).toBeTruthy()
    expect(screen.getByText("L'assistant réfléchit…")).toBeTruthy()
    expect(screen.getByText("Projets")).toBeTruthy()
    expect(screen.getByText("Deux factures").tagName).toBe("STRONG")
    fireEvent.click(screen.getByRole("button", { name: "Où en sont mes projets ?" }))
    expect(onPick).toHaveBeenCalledWith("Où en sont mes projets ?")
  })
})
