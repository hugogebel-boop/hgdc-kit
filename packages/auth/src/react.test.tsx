import { readFileSync } from "node:fs"

import { renderToStaticMarkup, renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"

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

function client(result: { error?: unknown } | Error) {
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
    const file = readFileSync(new URL("../../ui/family/id-mark.svg", import.meta.url), "utf8")
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
      readFileSync(new URL(`../../ui/family/${name}.svg`, import.meta.url), "utf8")
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
