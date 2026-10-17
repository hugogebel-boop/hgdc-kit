// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"

import { THEME_COLOR, themeInitScript } from "./theme.tsx"

function boot(stored: string | null, systemDark: boolean) {
  document.documentElement.className = ""
  document.head.innerHTML =
    '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">'
  localStorage.clear()
  if (stored) localStorage.setItem("theme", stored)
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: systemDark && query.includes("dark") }))
  // Le script part tel quel dans le HTML : on l'exécute tel quel.
  // oxlint-disable-next-line no-implied-eval
  new Function(themeInitScript)()
  return {
    theme: document.documentElement.className,
    colors: [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => [
      meta.getAttribute("content"),
      meta.getAttribute("media"),
    ]),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("thème au chargement", () => {
  it("s'ouvre en clair quand rien n'est choisi, même si le système est en sombre", () => {
    const { theme, colors } = boot(null, true)
    expect(theme).toBe("light")
    for (const [content, media] of colors) {
      expect(content).toBe(THEME_COLOR.light)
      expect(media).toBeNull()
    }
  })

  it("garde le choix mémorisé : sombre, ou système", () => {
    expect(boot("dark", false).theme).toBe("dark")
    expect(boot("system", true).theme).toBe("dark")
    expect(boot("system", false).theme).toBe("light")
    expect(boot("dark", false).colors[0]?.[0]).toBe(THEME_COLOR.dark)
  })
})
