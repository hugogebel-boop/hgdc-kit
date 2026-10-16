import { describe, expect, it, vi } from "vitest"

import { createSessionTokenCache } from "./index.ts"

describe("createSessionTokenCache", () => {
  const setup = (tokens: Array<string | null>, browser = true) => {
    let time = 0
    const fetchToken = vi.fn<() => Promise<string | null>>(async () => tokens.shift() ?? null)
    const cache = createSessionTokenCache(fetchToken, {
      ttlMs: 1000,
      now: () => time,
      isBrowser: () => browser,
    })
    return { cache, fetchToken, advance: (ms: number) => (time += ms) }
  }

  it("au navigateur, reprend une session ouverte pendant le délai, puis la relit", async () => {
    const { cache, fetchToken, advance } = setup(["a", "b"])
    expect(await cache.read()).toBe("a")
    advance(999)
    expect(await cache.read()).toBe("a")
    expect(fetchToken).toHaveBeenCalledTimes(1)
    advance(1)
    expect(await cache.read()).toBe("b")
  })

  it("ne garde jamais une absence de session", async () => {
    const { cache, fetchToken } = setup([null, "a"])
    expect(await cache.read()).toBeNull()
    expect(await cache.read()).toBe("a")
    expect(fetchToken).toHaveBeenCalledTimes(2)
  })

  it("au serveur, relit toujours", async () => {
    const { cache, fetchToken } = setup(["a", "b"], false)
    await cache.read()
    await cache.read()
    expect(fetchToken).toHaveBeenCalledTimes(2)
  })

  it("amorcé par le rendu serveur : aucun aller-retour à la première navigation ; clear l'oublie", async () => {
    const { cache, fetchToken } = setup(["b"])
    cache.seed("ssr")
    expect(await cache.read()).toBe("ssr")
    expect(fetchToken).not.toHaveBeenCalled()
    cache.clear()
    expect(await cache.read()).toBe("b")
  })

  it("des lectures simultanées partagent la même requête", async () => {
    const { cache, fetchToken } = setup(["a"])
    const [x, y] = await Promise.all([cache.read(), cache.read()])
    expect([x, y]).toEqual(["a", "a"])
    expect(fetchToken).toHaveBeenCalledTimes(1)
  })
})
