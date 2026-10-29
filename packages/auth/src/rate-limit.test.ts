import { betterAuth } from "better-auth/minimal"
import { describe, expect, it } from "vitest"

import { HGDC_IP_ADDRESS_OPTIONS, restoreClientAddress, signClientAddress } from "./client-address.ts"
import {
  AUTH_RATE_LIMIT_KEEP_MS,
  AUTH_RATE_LIMIT_PURGE_BATCH,
  HGDC_RATE_LIMIT,
  purgeAuthRateLimitBatch,
  SERVER_AUTH_PATHS,
} from "./rate-limit.ts"

const BASE = "https://actions.exemple.ch/api/auth"
const SECRET = "secret-de-test-partage-entre-front-et-convex"

/** better-auth réel, limite en mémoire (la base n'est pas l'objet du test), réglages du kit. */
function auth() {
  return betterAuth({
    baseURL: BASE,
    secret: "secret-de-test-assez-long-pour-better-auth",
    emailAndPassword: { enabled: true },
    rateLimit: { ...HGDC_RATE_LIMIT, storage: "memory" },
    advanced: { ipAddress: HGDC_IP_ADDRESS_OPTIONS },
  })
}

async function signIn(
  instance: ReturnType<typeof auth>,
  headers: Record<string, string>,
  options: { secret?: string; trustForwardedFor?: boolean } = {},
) {
  const request = new Request(`${BASE}/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ email: "personne@exemple.ch", password: "mauvais-mot-de-passe" }),
  })
  const restored = await restoreClientAddress(request, options.secret, {
    trustForwardedFor: options.trustForwardedFor ?? false,
  })
  return (await instance.handler(restored)).status
}

describe("limite de better-auth avec les réglages du kit", () => {
  it("Convex Cloud : un client qui change de x-forwarded-for à chaque essai est quand même limité", async () => {
    const instance = auth()
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push(await signIn(instance, { "x-forwarded-for": `203.0.113.${i + 1}` }))
    expect(statuses.at(-1), String(statuses)).toBe(429)
  })

  it("adresses signées : chaque visiteur a sa limite", async () => {
    const instance = auth()
    async function signed(address: string) {
      const headers = new Headers({ "x-forwarded-for": "172.30.0.5" })
      await signClientAddress(headers, {
        address,
        method: "POST",
        target: new URL(`${BASE}/sign-in/email`),
        secret: SECRET,
      })
      return await signIn(instance, Object.fromEntries(headers), { secret: SECRET })
    }
    const first: number[] = []
    for (let i = 0; i < 4; i++) first.push(await signed("203.0.113.7"))
    expect(first.at(-1), String(first)).toBe(429)
    expect(await signed("198.51.100.9")).not.toBe(429)
  })

  it("reverse proxy de confiance : son adresse compte", async () => {
    const instance = auth()
    for (let i = 0; i < 3; i++)
      await signIn(instance, { "x-forwarded-for": "203.0.113.7" }, { trustForwardedFor: true })
    expect(await signIn(instance, { "x-forwarded-for": "203.0.113.7" }, { trustForwardedFor: true })).toBe(429)
    expect(await signIn(instance, { "x-forwarded-for": "198.51.100.9" }, { trustForwardedFor: true })).not.toBe(429)
  })
})

describe("SERVER_AUTH_PATHS", () => {
  it("jamais limités, la connexion si", () => {
    expect(Object.keys(SERVER_AUTH_PATHS).sort()).toEqual([
      "/convex/.well-known/openid-configuration",
      "/convex/jwks",
      "/convex/token",
    ])
    expect(Object.values(HGDC_RATE_LIMIT.customRules)).toEqual([false, false, false])
    expect(HGDC_RATE_LIMIT.customRules["/sign-in/email"]).toBeUndefined()
    expect(HGDC_RATE_LIMIT).toMatchObject({ enabled: true, storage: "database" })
  })
})

describe("purgeAuthRateLimitBatch", () => {
  const deleteMany = "deleteMany" as never
  const next = "next" as never

  function fakeCtx(result: { isDone: boolean; continueCursor: string }) {
    const calls: { mutation: unknown[]; scheduled: unknown[] } = { mutation: [], scheduled: [] }
    const ctx = {
      runMutation: async (...args: unknown[]) => {
        calls.mutation.push(args)
        return result
      },
      scheduler: {
        runAfter: async (...args: unknown[]) => {
          calls.scheduled.push(args)
          return "id"
        },
      },
    }
    return { ctx: ctx as never, calls }
  }

  it("efface les lignes de plus d'une heure, par lots", async () => {
    const { ctx, calls } = fakeCtx({ isDone: true, continueCursor: "fin" })
    await purgeAuthRateLimitBatch(ctx, { deleteMany, next }, null, 10_000_000)
    expect(calls.mutation).toEqual([
      [
        deleteMany,
        {
          input: {
            model: "rateLimit",
            where: [{ field: "lastRequest", operator: "lt", value: 10_000_000 - AUTH_RATE_LIMIT_KEEP_MS }],
          },
          paginationOpts: { numItems: AUTH_RATE_LIMIT_PURGE_BATCH, cursor: null },
        },
      ],
    ])
    expect(calls.scheduled).toEqual([])
  })

  it("replanifie la suite tant que la table n'est pas parcourue", async () => {
    const { ctx, calls } = fakeCtx({ isDone: false, continueCursor: "suite" })
    await purgeAuthRateLimitBatch(ctx, { deleteMany, next }, "debut")
    expect(calls.scheduled).toEqual([[0, next, { cursor: "suite" }]])
  })
})
