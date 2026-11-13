import { describe, expect, it } from "vitest"
import { API_LIFECYCLE_POLICY, deprecationHeaders, withDeprecation } from "./deprecation.ts"

const route = {
  deprecatedAt: new Date("2027-01-01T00:00:00Z"),
  sunsetAt: new Date("2027-07-01T00:00:00Z"),
  link: "https://example.com/migration",
}

describe("dépréciation (RFC 9745, RFC 8594)", () => {
  it("en-têtes Deprecation, Sunset et Link", () => {
    expect(deprecationHeaders(route)).toEqual({
      Deprecation: "@1798761600",
      Sunset: "Thu, 01 Jul 2027 00:00:00 GMT",
      Link: '<https://example.com/migration>; rel="deprecation"; type="text/html", <https://example.com/migration>; rel="sunset"; type="text/html"',
    })
  })

  it("refuse un préavis trop court ou une page qui n'est pas en https", () => {
    expect(() => deprecationHeaders({ ...route, sunsetAt: new Date("2027-03-01T00:00:00Z") })).toThrow(/180 jours/)
    expect(() => deprecationHeaders({ ...route, link: "http://example.com" })).toThrow(/Page de migration/)
    expect(() => deprecationHeaders({ ...route, link: "pas une adresse" })).toThrow(/Page de migration/)
  })

  it("pose les en-têtes sur la réponse et garde un Link existant", async () => {
    const original = Response.json(
      { ok: true },
      { status: 200, headers: { Link: '<https://example.com/a>; rel="next"' } },
    )
    const response = withDeprecation(original, route)
    expect(response.status).toBe(200)
    expect(response.headers.get("Deprecation")).toBe("@1798761600")
    expect(response.headers.get("Link")).toMatch(/^<https:\/\/example.com\/a>; rel="next", <https/)
    expect(await response.json()).toEqual({ ok: true })
  })

  it("la règle publiée dit le préavis et Retry-After", () => {
    expect(API_LIFECYCLE_POLICY).toContain("180 jours")
    expect(API_LIFECYCLE_POLICY).toContain("Retry-After")
    expect(API_LIFECYCLE_POLICY).not.toContain("—")
  })
})
