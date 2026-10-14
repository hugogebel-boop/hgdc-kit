// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

const sonner = vi.hoisted(() => {
  const toast = Object.assign(
    vi.fn<(message: unknown, options?: unknown) => number>(() => 1),
    {
      error: vi.fn<(message: unknown) => number>(() => 2),
    },
  )
  return { toast }
})
vi.mock("sonner", () => ({ toast: sonner.toast, Toaster: () => null }))

import { DestructiveDialog, matchesConfirmation } from "./destructive-dialog.tsx"
import { ErrorCard } from "./error-card.tsx"
import { errorMessage, toastUndo } from "./sonner.tsx"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

type ToastOptions = {
  action: { label: string; onClick: () => void }
  onAutoClose: () => void
  onDismiss: () => void
}

function lastToastOptions(): ToastOptions {
  return sonner.toast.mock.calls.at(-1)?.[1] as ToastOptions
}

describe("toastUndo", () => {
  it("offre « Annuler », qui défait l'action une seule fois", () => {
    const onUndo = vi.fn<() => void>()
    const onCommit = vi.fn<() => void>()
    toastUndo("Domaine retiré", { onUndo, onCommit })
    const options = lastToastOptions()
    expect(options.action.label).toBe("Annuler")
    options.action.onClick()
    options.onDismiss()
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("valide l'action quand le délai passe sans annulation", () => {
    const onUndo = vi.fn<() => void>()
    const onCommit = vi.fn<() => void>()
    toastUndo("Envoi programmé", { onUndo, onCommit })
    const options = lastToastOptions()
    options.onAutoClose()
    options.onDismiss()
    options.action.onClick()
    expect(onCommit).toHaveBeenCalledOnce()
    expect(onUndo).not.toHaveBeenCalled()
  })
})

describe("errorMessage", () => {
  it("prend le message d'une Error, sinon une phrase générique", () => {
    expect(errorMessage(new Error("Domaine introuvable"))).toBe("Domaine introuvable")
    expect(errorMessage({})).toBe("Quelque chose n'a pas marché. Réessaie.")
  })
})

describe("DestructiveDialog", () => {
  it("n'active le bouton qu'une fois le nom recopié", async () => {
    const onConfirm = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const onOpenChange = vi.fn<(open: boolean) => void>()
    render(
      <DestructiveDialog
        open
        onOpenChange={onOpenChange}
        title="Supprimer le domaine"
        question="Tu veux vraiment supprimer acme.ch ?"
        name="acme.ch"
        onConfirm={onConfirm}
      />,
    )
    const button = screen.getByRole("button", { name: "Supprimer le domaine" })
    expect(button.hasAttribute("disabled")).toBe(true)
    const input = screen.getByRole("textbox", { name: /pour confirmer/ })
    fireEvent.change(input, { target: { value: "acme" } })
    expect(button.hasAttribute("disabled")).toBe(true)
    fireEvent.change(input, { target: { value: "acme.ch" } })
    expect(button.hasAttribute("disabled")).toBe(false)
    await act(async () => {
      fireEvent.click(button)
    })
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("reste ouverte et affiche l'erreur en toast si l'action échoue", async () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()
    render(
      <DestructiveDialog
        open
        onOpenChange={onOpenChange}
        title="Supprimer la clé"
        question="Les envois qui l'utilisent échoueront."
        onConfirm={() => Promise.reject(new Error("Clé déjà supprimée"))}
      />,
    )
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", ctrlKey: true })
    })
    expect(sonner.toast.error).toHaveBeenCalledWith("Clé déjà supprimée")
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByText("Impossible de revenir en arrière.")).toBeTruthy()
  })

  it("compare le nom aux espaces près", () => {
    expect(matchesConfirmation(" acme.ch ", "acme.ch")).toBe(true)
    expect(matchesConfirmation("Acme.ch", "acme.ch")).toBe(false)
  })
})

describe("ErrorCard", () => {
  it("s'annonce, replie le détail et relance au clic", async () => {
    const onRetry = vi.fn<() => Promise<void>>(() => Promise.resolve())
    render(
      <ErrorCard
        title="Impossible de charger les déploiements"
        detail="TypeError: fetch failed"
        reference="req_8f3a2c"
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole("alert").textContent).toContain("Impossible de charger les déploiements")
    const details = screen.getByRole("button", { name: "Détails" })
    expect(details.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(details)
    expect(details.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("TypeError: fetch failed")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Copier l'identifiant" })).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Réessayer" }))
    })
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("se contente du message sans détail ni action", () => {
    render(<ErrorCard />)
    expect(screen.getByRole("alert").textContent).toContain("Le chargement a échoué")
    expect(screen.queryByRole("button")).toBeNull()
  })
})
