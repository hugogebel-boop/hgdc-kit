import { convexClient } from "@convex-dev/better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { describe, expect, it, vi } from "vitest"

const received = vi.hoisted(() => ({ props: undefined as Record<string, unknown> | undefined }))

vi.mock("@convex-dev/better-auth/react", () => ({
  ConvexBetterAuthProvider: (props: Record<string, unknown>) => {
    received.props = props
    return null
  },
}))

const { HgdcConvexAuthProvider } = await import("./convex-react.tsx")

const client = { setAuth: () => {}, clearAuth: () => {} }

describe("HgdcConvexAuthProvider", () => {
  it("transmet le client better-auth 1.6.33 et toutes les propriétés sans les changer", () => {
    // Ce qui ne compilait plus avec ConvexBetterAuthProvider : le client typé de better-auth.
    const authClient = createAuthClient({ baseURL: "http://localhost:3000", plugins: [convexClient()] })
    const children = <p>contenu</p>

    const element = HgdcConvexAuthProvider({ authClient, client, initialToken: "jeton", children })
    // L'élément rendu est le fournisseur de l'adaptateur.
    ;(element.type as (props: unknown) => unknown)(element.props)

    expect(received.props?.authClient).toBe(authClient)
    expect(received.props?.client).toBe(client)
    expect(received.props?.children).toBe(children)
    expect(received.props?.initialToken).toBe("jeton")
  })

  it("refuse à la compilation un client qui casserait l'adaptateur", () => {
    const withoutConvex = createAuthClient({ baseURL: "http://localhost:3000" })
    const fake = { useSession: 1, getSession: 1, convex: 1 }
    // @ts-expect-error client sans le plugin `convexClient()`
    HgdcConvexAuthProvider({ authClient: withoutConvex, client, children: null })
    // @ts-expect-error objet qui n'a que les noms des méthodes
    HgdcConvexAuthProvider({ authClient: fake, client, children: null })
    expect(true).toBe(true)
  })
})
