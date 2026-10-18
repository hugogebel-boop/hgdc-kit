// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AssistantLink,
  assistantErrorText,
  AssistantView,
  renderPlainText,
  type AssistantThread,
  type AssistantViewProps,
} from "./assistant-view.tsx"

afterEach(cleanup)

const READY = { ready: true, ownKey: null, credits: { used: 12.4, limit: 300 } }

const THREAD: AssistantThread = {
  messages: [
    { _id: "m1", role: "user", text: "Quels déploiements ont échoué ?", status: "done", tools: [] },
    {
      _id: "m2",
      role: "assistant",
      text: "Un seul, hier soir.",
      status: "done",
      tools: [{ id: "t1", label: "Lecture des déploiements", status: "done" }],
    },
  ],
  actions: [{ _id: "a1", messageId: "m2", summary: "Redéployer « site »", status: "pending" }],
}

function view(props: Partial<AssistantViewProps> = {}) {
  const base: AssistantViewProps = {
    status: READY,
    threads: [],
    threadId: null,
    onThreadChange: () => {},
    thread: undefined,
    renderText: (text) => <span>{text}</span>,
    onSend: async () => {},
    onConfirm: async () => {},
    onCancel: async () => {},
  }
  return render(<AssistantView {...base} {...props} />)
}

describe("AssistantView", () => {
  it("accueil : crédits restants, exemples qui partent au clic", async () => {
    const onSend = vi.fn<(text: string) => Promise<void>>(async () => {})
    view({ onSend, examples: ["Où en sont mes déploiements ?"] })
    expect(screen.getByText("287 crédits restants ce mois-ci")).toBeTruthy()
    expect(screen.getByText("Qu'est-ce que je fais pour toi ?")).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Où en sont mes déploiements ?" }))
    })
    expect(onSend).toHaveBeenCalledWith("Où en sont mes déploiements ?")
  })

  it("non branché, puis crédits épuisés : la saisie est fermée et le lien de réglage affiché", () => {
    const { rerender } = view({ status: { ...READY, ready: false }, setup: <a href="/settings">Réglages</a> })
    expect(screen.getByText("L'assistant n'est pas encore branché")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Réglages" })).toBeTruthy()
    expect(screen.getByLabelText("Message pour l'assistant")).toHaveProperty("disabled", true)
    rerender(
      <AssistantView
        status={{ ...READY, credits: { used: 300, limit: 300 } }}
        threads={[]}
        threadId={null}
        onThreadChange={() => {}}
        thread={undefined}
        renderText={(text) => text}
        onSend={async () => {}}
        onConfirm={async () => {}}
        onCancel={async () => {}}
      />,
    )
    expect(screen.getByText("Les crédits du mois sont utilisés")).toBeTruthy()
    expect(screen.getByText("Plus de crédits ce mois-ci")).toBeTruthy()
  })

  it("conversation : pastilles, texte rendu par le produit, carte à confirmer", async () => {
    const onConfirm = vi.fn<(id: string) => Promise<void>>(async () => {})
    view({ threadId: "th1", thread: THREAD, status: { ...READY, ownKey: { hint: "wxyz" } }, onConfirm })
    expect(screen.getByText("Clé de l'organisation ••••wxyz")).toBeTruthy()
    expect(screen.getByText("Lecture des déploiements")).toBeTruthy()
    expect(screen.getByText("Un seul, hier soir.").tagName).toBe("SPAN")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Confirmer" }))
    })
    expect(onConfirm).toHaveBeenCalledWith("a1")
  })

  it("un envoi refusé remet le texte et montre le message du serveur", async () => {
    const onSend = vi.fn<(text: string) => Promise<void>>(async () => {
      throw Object.assign(new Error("ConvexError"), { data: "L'assistant répond encore. Un instant." })
    })
    view({ onSend })
    const field = screen.getByLabelText("Message pour l'assistant")
    fireEvent.change(field, { target: { value: "Et maintenant ?" } })
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" })
    })
    expect(screen.getByRole("alert").textContent).toBe("L'assistant répond encore. Un instant.")
    expect((field as HTMLTextAreaElement).value).toBe("Et maintenant ?")
  })

  it("une réponse en cours : attente, saisie en pause ; effacement en deux temps", async () => {
    const onDeleteThread = vi.fn<(id: string) => Promise<void>>(async () => {})
    const onThreadChange = vi.fn<(id: string | null) => void>()
    view({
      threadId: "th1",
      onThreadChange,
      onDeleteThread,
      thread: {
        messages: [
          { _id: "m1", role: "user", text: "Salut", status: "done", tools: [] },
          { _id: "m2", role: "assistant", text: "", status: "pending", tools: [] },
        ],
        actions: [],
      },
    })
    expect(screen.getByText("L'assistant réfléchit…")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Envoyer" })).toHaveProperty("disabled", true)
    fireEvent.click(screen.getByRole("button", { name: "Effacer cette conversation" }))
    expect(onDeleteThread).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Effacer" }))
    })
    expect(onDeleteThread).toHaveBeenCalledWith("th1")
    expect(onThreadChange).toHaveBeenCalledWith(null)
  })

  it("la page ouverte en sujet se retire et se rattache", () => {
    const onAttachedChange = vi.fn<(attached: boolean) => void>()
    view({
      subject: {
        label: "Déploiement abc123",
        attached: true,
        onAttachedChange,
        attachLabel: "Parler de ce déploiement",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Ne plus parler de cette page" }))
    expect(onAttachedChange).toHaveBeenCalledWith(false)
  })

  it("le texte d'une ConvexError, sinon le message par défaut", () => {
    expect(assistantErrorText({ data: "Introuvable." }, "x")).toBe("Introuvable.")
    expect(assistantErrorText({ data: { message: "Accès refusé" } }, "x")).toBe("Accès refusé")
    expect(assistantErrorText(new Error("boom"), "Réessaie.")).toBe("Réessaie.")
  })

  it("rendu par défaut : texte brut, liens https sûrs avec leur domaine, rien d'autre", () => {
    render(<div>{renderPlainText("<img src=x onerror=alert(1)> voir https://evil.example/p?q=1")}</div>)
    expect(document.querySelector("img")).toBeNull()
    const link = screen.getByRole("link")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer nofollow")
    expect(link.textContent).toContain("(evil.example)")
  })

  it("un lien javascript:, http: ou à identifiants devient du texte", () => {
    render(
      <>
        <AssistantLink href="javascript:alert(1)">a</AssistantLink>
        <AssistantLink href="http://example.ch">b</AssistantLink>
        <AssistantLink href="https://user:pw@example.ch">c</AssistantLink>
        <AssistantLink href="//evil.example">d</AssistantLink>
        <AssistantLink href="/o/demo/projets">interne</AssistantLink>
      </>,
    )
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(["interne"])
  })

  it("une conversation pleine ferme la saisie", () => {
    view({ threadId: "th1", thread: { ...THREAD, full: true } })
    expect(screen.getByText(/Cette conversation est pleine/)).toBeTruthy()
    expect(screen.getByLabelText("Message pour l'assistant")).toHaveProperty("disabled", true)
  })
})
