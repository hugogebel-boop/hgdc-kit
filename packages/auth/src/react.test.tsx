// @vitest-environment happy-dom
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { renderToStaticMarkup, renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  HGDC_MARK_DARK_SVG,
  HGDC_MARK_SVG,
  HgdcMark,
  HgdcSignInButton,
  ID_MARK_SVG,
  ID_SIGN_IN_COLORS,
  ID_SIGN_IN_CSS,
  startHgdcSignIn,
  type HgdcAuthClient,
} from "./react.tsx"

function client(result: { data?: { url?: string } | null; error?: unknown } | Error) {
  const calls: unknown[] = []
  const authClient: HgdcAuthClient = {
    signIn: {
      oauth2: async (args) => {
        calls.push(args)
        if (result instanceof Error) throw result
        return result
      },
    },
  }
  return { authClient, calls }
}

const AUTHORIZE = "https://id.example/authorize?client_id=produit&state=abc&scope=openid%20email"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("startHgdcSignIn avec chooseAccount", () => {
  it("demande l'adresse sans redirection et y ajoute le prompt, sans perdre le reste", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {})
    const { authClient, calls } = client({ data: { url: AUTHORIZE } })
    expect(await startHgdcSignIn(authClient, { callbackURL: "/projets", chooseAccount: true })).toEqual({ ok: true })
    expect(calls).toEqual([{ providerId: "hgdc", callbackURL: "/projets", disableRedirect: true }])
    const target = new URL(String(assign.mock.calls[0]?.[0]))
    expect(target.origin + target.pathname).toBe("https://id.example/authorize")
    expect(Object.fromEntries(target.searchParams)).toEqual({
      client_id: "produit",
      state: "abc",
      scope: "openid email",
      prompt: "select_account",
    })
  })

  it("une réponse sans adresse échoue sans lever ni partir", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {})
    const result = await startHgdcSignIn(client({ data: {} }).authClient, { chooseAccount: true })
    expect(result).toMatchObject({ ok: false, error: expect.any(Error) })
    expect(assign).not.toHaveBeenCalled()
  })

  it("refuse une adresse qui n'est pas http(s)", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {})
    const result = await startHgdcSignIn(client({ data: { url: "javascript:alert(1)" } }).authClient, {
      chooseAccount: true,
    })
    expect(result).toMatchObject({ ok: false, error: expect.any(Error) })
    expect(assign).not.toHaveBeenCalled()
  })

  it("rend l'erreur du client sans partir", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {})
    const result = await startHgdcSignIn(client({ error: { status: 500 } }).authClient, { chooseAccount: true })
    expect(result).toEqual({ ok: false, error: { status: 500 } })
    expect(assign).not.toHaveBeenCalled()
  })

  it("sans l'option, ne passe ni disableRedirect ni par location.assign", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {})
    const { authClient, calls } = client({ data: { url: AUTHORIZE } })
    expect(await startHgdcSignIn(authClient, { callbackURL: "/projets" })).toEqual({ ok: true })
    expect(calls).toEqual([{ providerId: "hgdc", callbackURL: "/projets" }])
    expect(assign).not.toHaveBeenCalled()
  })
})

describe("HgdcSignInButton au clic", () => {
  it("envoie le prompt et garde les autres paramètres de l'adresse", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {})
    const { authClient, calls } = client({ data: { url: AUTHORIZE } })
    render(<HgdcSignInButton authClient={authClient} callbackURL="/projets" errorCallbackURL="/connexion" />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(assign).toHaveBeenCalledOnce())
    expect(calls).toEqual([
      { providerId: "hgdc", callbackURL: "/projets", errorCallbackURL: "/connexion", disableRedirect: true },
    ])
    const target = new URL(String(assign.mock.calls[0]?.[0]))
    expect(target.searchParams.get("prompt")).toBe("select_account")
    expect(target.searchParams.get("state")).toBe("abc")
    expect(target.searchParams.get("client_id")).toBe("produit")
  })

  it("réponse sans adresse : signale l'erreur et réactive le bouton", async () => {
    const onError = vi.fn<(error: unknown) => void>()
    render(<HgdcSignInButton authClient={client({ data: null }).authClient} onError={onError} />)
    const button = screen.getByRole<HTMLButtonElement>("button")
    fireEvent.click(button)
    await waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(button.disabled).toBe(false)
  })
})

describe("startHgdcSignIn", () => {
  it("demande le fournisseur hgdc avec la page de retour", async () => {
    const { authClient, calls } = client({})
    expect(await startHgdcSignIn(authClient, { callbackURL: "/projets" })).toEqual({ ok: true })
    expect(calls).toEqual([{ providerId: "hgdc", callbackURL: "/projets" }])
  })

  it("rend l'erreur du client sans lever", async () => {
    const { authClient } = client({ error: { status: 500 } })
    expect(await startHgdcSignIn(authClient)).toEqual({ ok: false, error: { status: 500 } })
  })

  it("rend une erreur réseau sans lever", async () => {
    const failure = new Error("hors ligne")
    const { authClient } = client(failure)
    expect(await startHgdcSignIn(authClient)).toEqual({ ok: false, error: failure })
  })
})

describe("HgdcSignInButton", () => {
  it("affiche le libellé de la marque sur un vrai bouton", () => {
    const html = renderToStaticMarkup(<HgdcSignInButton authClient={client({}).authClient} className="btn" />)
    expect(html).toContain('type="button"')
    expect(html).toContain('class="btn"')
    expect(html).toContain("Se connecter avec ID")
    expect(html).toContain('aria-busy="false"')
    expect(html).toContain('data-slot="id-sign-in"')
  })

  it("porte la marque d'ID, copie exacte de @hgdc/ui, et ses couleurs hors couche", () => {
    const file = readFileSync(join(import.meta.dirname, "../../ui/family/id-mark.svg"), "utf8")
    expect(ID_MARK_SVG).toBe(file.replace(/\r\n/g, "\n").trim())
    const html = renderToStaticMarkup(<HgdcSignInButton authClient={client({}).authClient} />)
    expect(html).toContain(`src="data:image/svg+xml,${encodeURIComponent(ID_MARK_SVG)}"`)
    expect(ID_SIGN_IN_CSS).toContain(`[data-slot="id-sign-in"]{background:${ID_SIGN_IN_COLORS.rest};color:#fff`)
    expect(ID_SIGN_IN_CSS).toMatch(/:focus-visible\{outline:2px solid/)
    expect(ID_SIGN_IN_CSS).toMatch(/:disabled\{cursor:not-allowed;opacity:\.5\}/)
  })

  it("pose sa feuille une seule fois, dans <head>, quel que soit le nombre de boutons", () => {
    const { authClient } = client({})
    const html = renderToString(
      <html lang="fr">
        <head />
        <body>
          <HgdcSignInButton authClient={authClient} />
          <HgdcSignInButton authClient={authClient} />
        </body>
      </html>,
    )
    expect(html.split('data-href="hgdc-id-sign-in"')).toHaveLength(2)
    expect(html.indexOf('data-href="hgdc-id-sign-in"')).toBeLessThan(html.indexOf("<body>"))
  })

  it("garde le blanc lisible sur chaque rouge (AA, 4,5:1)", () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }) as [number, number, number]
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    for (const color of Object.values(ID_SIGN_IN_COLORS)) {
      expect(1.05 / (luminance(color) + 0.05)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe("HgdcMark", () => {
  it("est le H « Double » de la H Collection, copie exacte des fichiers de @hgdc/ui", () => {
    const file = (name: string) =>
      readFileSync(join(import.meta.dirname, `../../ui/family/${name}.svg`), "utf8")
        .replace(/\r\n/g, "\n")
        .trim()
    expect(HGDC_MARK_SVG).toBe(file("hcollection-icon"))
    expect(HGDC_MARK_DARK_SVG).toBe(file("hcollection-icon-dark"))
    const html = renderToStaticMarkup(<HgdcMark className="size-4" />)
    expect(html).toContain('src="data:image/svg+xml,')
    expect(html).toContain('data-mark-theme="light"')
    expect(html).toContain('data-mark-theme="dark"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('class="size-4"')
  })

  it("sans className, garde 1.25em de côté au lieu de la taille du SVG", () => {
    const html = renderToStaticMarkup(<HgdcMark />)
    expect(html).toMatch(/<span data-slot="hgdc-mark"[^>]*style="[^"]*width:1\.25em;height:1\.25em/)
    expect(html).not.toContain("class=")
  })

  it("avec className, la classe fixe seule la taille", () => {
    const html = renderToStaticMarkup(<HgdcMark className="size-4" />)
    const span = /<span data-slot="hgdc-mark"[^>]*>/.exec(html)?.[0] ?? ""
    expect(span).toContain('class="size-4"')
    expect(span).not.toMatch(/width|height/)
    // Les images n'ont aucun style en ligne qui écraserait le masquage par thème.
    expect(html).not.toMatch(/<img[^>]*style=/)
  })

  it("montre une seule variante, même sans les styles de @hgdc/ui", () => {
    const html = renderToStaticMarkup(<HgdcMark />)
    expect(html).toContain("<style>")
    expect(html).toContain('[data-slot="hgdc-mark"]>img[data-mark-theme="dark"]')
    expect(html.indexOf("<style>")).toBeLessThan(html.indexOf("<img"))
  })

  it("le bouton de connexion porte la marque d'ID, plus le H de la collection", () => {
    const html = renderToStaticMarkup(<HgdcSignInButton authClient={client({}).authClient} />)
    expect(html).not.toContain('data-slot="hgdc-mark"')
    expect(ID_SIGN_IN_CSS).toContain('[data-slot="id-sign-in"]>img{display:block;width:1.25em;height:1.25em')
  })
})
