// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { STATUS_EMBED_URL } from "./index.ts"
import { HgdcStatus } from "./react.tsx"

// Le script reste dans <head> d'un test à l'autre, comme dans une vraie page.
afterEach(cleanup)

describe("HgdcStatus", () => {
  it("rend l'élément avec ses attributs et le repli", () => {
    const { container } = render(
      <HgdcStatus page="agence" view="badge" theme="dark" href="/status">
        <a href="https://status.hgdc.ch/agence">État des services</a>
      </HgdcStatus>,
    )
    const el = container.querySelector("hgdc-status")!
    expect(el.getAttribute("page")).toBe("agence")
    expect(el.getAttribute("view")).toBe("badge")
    expect(el.getAttribute("theme")).toBe("dark")
    expect(el.getAttribute("href")).toBe("/status")
    expect(el.textContent).toBe("État des services")
  })

  it("charge le script une seule fois pour plusieurs composants", () => {
    render(
      <>
        <HgdcStatus page="agence" view="badge" />
        <HgdcStatus page="agence" />
      </>,
    )
    const scripts = document.head.querySelectorAll(`script[src="${STATUS_EMBED_URL}"]`)
    expect(scripts).toHaveLength(1)
    expect(scripts[0]!.getAttribute("type")).toBe("module")
  })
})
