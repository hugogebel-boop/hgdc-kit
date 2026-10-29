import { describe, expect, it } from "vitest"
import { decodeCursor, encodeCursor, fromConvexPage, pageParams, toPaginationOpts } from "./pagination.ts"

describe("curseur opaque", () => {
  it("aller-retour, base64url", () => {
    const state = '[1700000000000,"j57abc"] éà/+'
    const cursor = encodeCursor(state)
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeCursor(cursor)).toBe(state)
  })

  it("refuse un curseur altéré ou d'une autre version", () => {
    expect(decodeCursor("")).toBeNull()
    expect(decodeCursor("!!!")).toBeNull()
    expect(decodeCursor(btoa("2:x").replace(/=+$/, ""))).toBeNull()
    expect(decodeCursor("a".repeat(5000))).toBeNull()
  })
})

describe("page Convex", () => {
  it("enveloppe { data, next_cursor, has_more }", () => {
    const page = fromConvexPage({ page: [{ _id: "a", n: 1 }], isDone: false, continueCursor: "c1" }, (d) => ({
      id: d._id,
    }))
    expect(page).toEqual({ data: [{ id: "a" }], next_cursor: encodeCursor("c1"), has_more: true })
    expect(fromConvexPage({ page: [], isDone: true, continueCursor: "end" })).toEqual({
      data: [],
      next_cursor: null,
      has_more: false,
    })
  })

  it("paginationOpts depuis limit et cursor", () => {
    expect(toPaginationOpts({})).toEqual({ ok: true, paginationOpts: { numItems: 20, cursor: null } })
    expect(toPaginationOpts({ limit: "50", cursor: encodeCursor("c1") })).toEqual({
      ok: true,
      paginationOpts: { numItems: 50, cursor: "c1" },
    })
    expect(toPaginationOpts({ limit: 0 }).ok).toBe(false)
    expect(toPaginationOpts({ limit: "101" }).ok).toBe(false)
    expect(toPaginationOpts({ limit: "2.5" }).ok).toBe(false)
    expect(toPaginationOpts({ limit: 500 }, { maxLimit: 1000 }).ok).toBe(true)
    expect(toPaginationOpts({ cursor: "nope!" }).ok).toBe(false)
  })

  it("paramètres d'URL", () => {
    expect(pageParams("https://api.test/emails?limit=5&cursor=abc")).toEqual({ limit: "5", cursor: "abc" })
  })
})
