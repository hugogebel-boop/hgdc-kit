import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  PROBLEMS,
  dialectResponse,
  fieldErrors,
  isProblem,
  problem,
  problemResponse,
  problemSlug,
  problemType,
  toResend,
  toVercel,
  validationProblem,
} from "./errors.ts"

describe("problem+json (RFC 9457)", () => {
  it("type stable, titre fixe, statut du catalogue", () => {
    const p = problem("not_found", { detail: "Aucun domaine abc.", instance: "/domains/abc" })
    expect(p).toEqual({
      type: "https://hgdc.ch/problems/not-found",
      title: "Ressource introuvable",
      status: 404,
      detail: "Aucun domaine abc.",
      instance: "/domains/abc",
    })
    expect(isProblem(p)).toBe(true)
    expect(problemSlug(p)).toBe("not_found")
    expect(problemSlug({ type: "about:blank" })).toBeNull()
    expect(problemSlug({ type: "https://hgdc.ch/problems/unknown-thing" })).toBeNull()
  })

  it("une extension ne remplace jamais un membre réservé", () => {
    const p = problem("rate_limited", { extensions: { status: 200, type: "x", retry_after: 3 } })
    expect(p.status).toBe(429)
    expect(p.type).toBe(problemType("rate_limited"))
    expect(p.retry_after).toBe(3)
  })

  it("chaque type du catalogue a un statut d'erreur et un titre", () => {
    for (const [slug, { status, title }] of Object.entries(PROBLEMS)) {
      expect(status, slug).toBeGreaterThanOrEqual(400)
      expect(title.length, slug).toBeGreaterThan(0)
    }
  })

  it("réponse HTTP", async () => {
    const response = problemResponse(problem("conflict"), { "retry-after": "1" })
    expect(response.status).toBe(409)
    expect(response.headers.get("content-type")).toBe("application/problem+json")
    expect(response.headers.get("retry-after")).toBe("1")
    expect(await response.json()).toEqual(problem("conflict"))
  })

  it("erreurs de validation Zod en pointeurs JSON", () => {
    const schema = z.object({ to: z.email(), tags: z.array(z.object({ "a/b": z.string() })) })
    const result = schema.safeParse({ to: "x", tags: [{ "a/b": 1 }] })
    expect(result.success).toBe(false)
    if (result.success) return
    const errors = fieldErrors(result.error)
    expect(errors.map((e) => e.pointer)).toEqual(["#/to", "#/tags/0/a~1b"])
    const p = validationProblem(result.error)
    expect(p.status).toBe(422)
    expect(p.errors).toEqual(errors)
  })
})

describe("dialectes", () => {
  it("Resend : { statusCode, name, message }", () => {
    expect(toResend(problem("invalid_token", { detail: "API key is invalid" }))).toEqual({
      statusCode: 401,
      name: "invalid_api_key",
      message: "API key is invalid",
    })
    expect(toResend(problem("rate_limited")).name).toBe("rate_limit_exceeded")
    expect(toResend({ type: "about:blank", title: "X", status: 500 }).name).toBe("application_error")
  })

  it("Vercel : { error: { code, message } }", () => {
    expect(toVercel(problem("not_found"))).toEqual({ error: { code: "not_found", message: "Ressource introuvable" } })
    expect(toVercel(problem("authentication_required")).error.code).toBe("forbidden")
  })

  it("réponse dans le dialecte de la route", async () => {
    const resend = dialectResponse(problem("validation_failed", { detail: "to manque" }), "resend")
    expect(resend.status).toBe(422)
    expect(resend.headers.get("content-type")).toBe("application/json")
    expect(await resend.json()).toEqual({ statusCode: 422, name: "validation_error", message: "to manque" })
    const plain = dialectResponse(problem("forbidden"), "problem")
    expect(plain.headers.get("content-type")).toBe("application/problem+json")
  })
})
