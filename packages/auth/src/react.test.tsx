import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { HgdcSignInButton, startHgdcSignIn, type HgdcAuthClient } from "./react.tsx"

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
