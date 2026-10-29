import { describe, expect, it } from "vitest"

import {
  AUTH_EXPIRED_MODELS,
  AUTH_EXPIRED_PURGE_BATCH,
  expiredWhere,
  nextExpiredModel,
  purgeExpiredAuthBatch,
} from "./expired.ts"

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

describe("expiredWhere", () => {
  it("strictement avant maintenant : une session qui expire à l'instant même reste", () => {
    expect(expiredWhere(1000)).toEqual([{ field: "expiresAt", operator: "lt", value: 1000 }])
  })
})

describe("nextExpiredModel", () => {
  it("sessions, puis vérifications, puis fin", () => {
    expect(AUTH_EXPIRED_MODELS).toEqual(["session", "verification"])
    expect(nextExpiredModel("session")).toBe("verification")
    expect(nextExpiredModel("verification")).toBeNull()
  })
})

describe("purgeExpiredAuthBatch", () => {
  it("efface un lot de sessions expirées par l'index expiresAt", async () => {
    const { ctx, calls } = fakeCtx({ isDone: false, continueCursor: "suite" })
    await purgeExpiredAuthBatch(ctx, { deleteMany, next }, { model: "session", cursor: null }, 5000)
    expect(calls.mutation).toEqual([
      [
        deleteMany,
        {
          input: { model: "session", where: [{ field: "expiresAt", operator: "lt", value: 5000 }] },
          paginationOpts: { numItems: AUTH_EXPIRED_PURGE_BATCH, cursor: null },
        },
      ],
    ])
    expect(calls.scheduled).toEqual([[0, next, { model: "session", cursor: "suite" }]])
  })

  it("sessions parcourues : passe aux vérifications depuis le début", async () => {
    const { ctx, calls } = fakeCtx({ isDone: true, continueCursor: "fin" })
    await purgeExpiredAuthBatch(ctx, { deleteMany, next }, { model: "session", cursor: "x" })
    expect(calls.scheduled).toEqual([[0, next, { model: "verification", cursor: null }]])
  })

  it("vérifications parcourues : s'arrête", async () => {
    const { ctx, calls } = fakeCtx({ isDone: true, continueCursor: "fin" })
    await purgeExpiredAuthBatch(ctx, { deleteMany, next }, { model: "verification", cursor: null })
    expect(calls.scheduled).toEqual([])
  })
})
