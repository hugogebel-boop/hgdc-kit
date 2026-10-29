import { describe, expect, it } from "vitest"
import {
  API_RATE_LIMITS,
  MINUTE,
  clientIp,
  policyOf,
  rateLimitHeaders,
  rateLimitedResponse,
  retryAfterSeconds,
} from "./ratelimit.ts"

describe("préréglages", () => {
  it("forme de @convex-dev/rate-limiter", () => {
    for (const config of Object.values(API_RATE_LIMITS)) {
      expect(["token bucket", "fixed window"]).toContain(config.kind)
      expect(config.rate).toBeGreaterThan(0)
      expect(config.period).toBeGreaterThanOrEqual(MINUTE)
    }
    expect(policyOf(API_RATE_LIMITS.apiKeyRead)).toEqual({ quota: 120, windowSeconds: 60 })
    expect(policyOf(API_RATE_LIMITS.authFailure)).toEqual({ quota: 20, windowSeconds: 600 })
  })
})

describe("en-têtes RateLimit (draft-ietf-httpapi-ratelimit-headers-11)", () => {
  it("politique seule, puis avec le reste", () => {
    expect(rateLimitHeaders({ policy: "apiKeyRead", config: API_RATE_LIMITS.apiKeyRead })).toEqual({
      "RateLimit-Policy": '"apikeyread";q=120;w=60',
    })
    expect(rateLimitHeaders({ policy: "mcp", config: API_RATE_LIMITS.mcp, remaining: 7.9, resetMs: 1500 })).toEqual({
      "RateLimit-Policy": '"mcp";q=30;w=60',
      RateLimit: '"mcp";r=7;t=2',
    })
  })

  it("refuse un nom de politique qui casserait l'en-tête", () => {
    expect(() => rateLimitHeaders({ policy: 'a";q=1', config: API_RATE_LIMITS.mcp })).toThrow(/politique invalide/)
  })

  it("Retry-After en secondes entières, 1 au moins", () => {
    expect(retryAfterSeconds(0)).toBe(1)
    expect(retryAfterSeconds(1001)).toBe(2)
  })

  it("429 en problem+json, ou dans le dialecte Resend", async () => {
    const response = rateLimitedResponse({ policy: "mcp", config: API_RATE_LIMITS.mcp, retryAfterMs: 4200 })
    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("5")
    expect(response.headers.get("ratelimit")).toBe('"mcp";r=0;t=5')
    expect(response.headers.get("content-type")).toBe("application/problem+json")
    const body = (await response.json()) as Record<string, unknown>
    expect(body.retry_after).toBe(5)
    const resend = rateLimitedResponse({
      policy: "mcp",
      config: API_RATE_LIMITS.mcp,
      retryAfterMs: 1,
      dialect: "resend",
    })
    expect(((await resend.json()) as Record<string, unknown>).name).toBe("rate_limit_exceeded")
  })
})

describe("IP du client", () => {
  it("lit X-Forwarded-For de droite à gauche", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })
    expect(clientIp(headers)).toBe("203.0.113.9")
    expect(clientIp(headers, { trustedHops: 2 })).toBe("6.6.6.6")
    expect(clientIp(headers, { trustedHops: 3 })).toBeNull()
    expect(clientIp(new Headers({ "x-real-ip": "2001:db8::1" }), { header: "x-real-ip" })).toBe("2001:db8::1")
    expect(clientIp(new Headers({ "x-forwarded-for": "not an ip" }))).toBeNull()
    expect(clientIp(new Headers())).toBeNull()
  })
})
