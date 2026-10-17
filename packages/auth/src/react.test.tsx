import { readFileSync } from "node:fs"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  HGDC_MARK_DARK_SVG,
  HGDC_MARK_SVG,
  HgdcMark,
  HgdcSignInButton,
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
    expect(html).toContain("Se connecter avec HGDC")
    expect(html).toContain('aria-busy="false"')
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

  it("dans le bouton de connexion, la marque a sa taille par défaut", () => {
    const html = renderToStaticMarkup(<HgdcSignInButton authClient={client({}).authClient} />)
    expect(html).toMatch(/data-slot="hgdc-mark"[^>]*width:1\.25em/)
  })
})
