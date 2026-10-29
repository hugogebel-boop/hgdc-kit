import { describe, expect, it } from "vitest"

import { CLEAN, isTrifecta, routeCall, taintAfter } from "./trifecta.ts"

describe("trifecta", () => {
  it("le tour garde ce qu'il a lu, sans jamais l'oublier", () => {
    const privateOnly = taintAfter(CLEAN, { private: true })
    expect(privateOnly).toEqual({ private: true, untrusted: false })
    expect(isTrifecta(privateOnly)).toBe(false)
    const both = taintAfter(privateOnly, { untrusted: true })
    expect(isTrifecta(both)).toBe(true)
    expect(taintAfter(both, {})).toBe(both)
    expect(taintAfter(both, { private: false, untrusted: false })).toEqual(both)
  })

  it("confirm et send passent toujours par une carte ; send est refusé après la trifecta avec block", () => {
    const both = { private: true, untrusted: true }
    expect(routeCall("read", both, "block")).toBe("read")
    expect(routeCall("write", both, "block")).toBe("write")
    expect(routeCall("confirm", both, "block")).toBe("propose")
    expect(routeCall("send", CLEAN, "block")).toBe("propose")
    expect(routeCall("send", both)).toBe("propose")
    expect(routeCall("send", both, "block")).toBe("refuse")
  })
})
