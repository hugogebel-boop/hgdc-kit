// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Tabs, TabsList, TabsTab } from "./tabs.tsx"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** happy-dom ne calcule aucune mise en page : une rangée de 300 px pour cinq onglets de 100 px, posés à la main. */
function fakeLayout() {
  const proto = HTMLElement.prototype
  vi.spyOn(proto, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset.slot === "tabs-list" ? 500 : 0
  })
  vi.spyOn(proto, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset.slot === "tabs-list" ? 300 : 0
  })
  vi.spyOn(proto, "offsetWidth", "get").mockReturnValue(100)
  vi.spyOn(proto, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
    const tabs = [...(this.parentElement?.querySelectorAll("[data-slot=tabs-tab]") ?? [])]
    return Math.max(0, tabs.indexOf(this)) * 100
  })
}

const row = (value: string) => (
  <Tabs value={value}>
    <TabsList aria-label="Pages">
      {["a", "b", "c", "d", "e"].map((v) => (
        <TabsTab key={v} value={v}>
          {v}
        </TabsTab>
      ))}
    </TabsList>
  </Tabs>
)

describe("TabsList", () => {
  it("ouvre la rangée sur l'onglet actif quand elle défile", () => {
    fakeLayout()
    const { container } = render(row("e"))
    const list = container.querySelector<HTMLElement>("[data-slot=tabs-list]")
    // Dernier onglet (400 à 500 px) centré dans 300 px : 400 - 100.
    expect(list?.scrollLeft).toBe(300)
  })

  it("laisse la rangée au début quand l'onglet actif est le premier", () => {
    fakeLayout()
    const { container } = render(row("a"))
    expect(container.querySelector<HTMLElement>("[data-slot=tabs-list]")?.scrollLeft).toBe(0)
  })
})
