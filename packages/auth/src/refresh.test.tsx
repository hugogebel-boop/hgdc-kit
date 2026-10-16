// @vitest-environment happy-dom
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useOrganizationRefresh } from "./react.tsx"

function at(path: string) {
  window.history.replaceState(null, "", path)
  const replace = vi.spyOn(window.location, "replace").mockImplementation(() => {})
  return replace
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("useOrganizationRefresh", () => {
  it("organisation inconnue : une relecture vers l'entrée, retour sur la même page", () => {
    const replace = at("/o/travel-gc/projets?tri=nom")
    const { result } = renderHook(() => useOrganizationRefresh(true))
    expect(result.current).toBe(true)
    expect(replace).toHaveBeenCalledExactlyOnceWith("/auth/hgdc?refresh=1&next=%2Fo%2Ftravel-gc%2Fprojets%3Ftri%3Dnom")
  })

  it("au retour de la relecture (`synced=1`) : plus de redirection, « introuvable »", () => {
    const replace = at("/o/travel-gc?synced=1")
    const { result } = renderHook(() => useOrganizationRefresh(true))
    expect(result.current).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })

  it("organisation connue : rien", () => {
    const replace = at("/o/acme")
    const { result } = renderHook(() => useOrganizationRefresh(false))
    expect(result.current).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })
})
