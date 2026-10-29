import { describe, expect, it } from "vitest"
import { z } from "zod"
import { jsonSchema, openApiDocument, operation, paginatedSchema } from "./openapi.ts"

const Domain = z.object({ id: z.string(), name: z.string(), verified: z.boolean() })

describe("OpenAPI 3.1 depuis Zod 4", () => {
  it("schéma JSON sans $schema", () => {
    const schema = jsonSchema(Domain)
    expect(schema).not.toHaveProperty("$schema")
    expect(schema).toMatchObject({ type: "object", required: ["id", "name", "verified"] })
  })

  it("liste paginée : paramètres limit et cursor, enveloppe, erreurs problem+json", () => {
    const op = operation({
      operationId: "listDomains",
      summary: "Lister les domaines",
      scopes: ["mail:read"],
      query: z.object({ status: z.enum(["pending", "verified"]).optional(), limit: z.string().optional() }),
      response: Domain,
      paginated: true,
      errors: [404],
    })
    const params = op.parameters as { name: string; required: boolean }[]
    expect(params.map((p) => p.name)).toEqual(["status", "limit", "cursor"])
    expect(params.every((p) => !p.required)).toBe(true)
    expect(op.security).toEqual([{ bearer: ["mail:read"] }])
    const responses = op.responses as Record<string, Record<string, unknown>>
    expect(Object.keys(responses)).toEqual(["200", "400", "401", "403", "404", "429", "500"])
    expect(responses["404"]).toEqual({ $ref: "#/components/responses/Problem404" })
    expect(responses["200"]).toEqual({
      description: "Succès",
      content: { "application/json": { schema: paginatedSchema(jsonSchema(Domain)) } },
    })
  })

  it("création : corps requis et 201 ; opération publique sans 401", () => {
    const op = operation({
      operationId: "createDomain",
      summary: "Ajouter",
      body: z.object({ name: z.string() }),
      response: Domain,
    })
    expect(op.requestBody).toMatchObject({ required: true })
    expect(Object.keys(op.responses as object)).toEqual(["201", "400", "429", "500"])
    expect(op.security).toBeUndefined()
  })

  it("document : composants Problem et réponses citées, sécurité Bearer", () => {
    const doc = openApiDocument({
      title: "Mail",
      version: "1.0.0",
      servers: [{ url: "https://api.mail.hgdc.ch" }],
      paths: {
        "/domains": {
          get: operation({
            operationId: "listDomains",
            summary: "Lister",
            scopes: ["mail:read"],
            response: Domain,
            paginated: true,
          }),
        },
      },
      schemas: { Domain: jsonSchema(Domain) },
    })
    expect(doc.openapi).toBe("3.1.1")
    const components = doc.components as Record<string, Record<string, Record<string, unknown>>>
    expect(Object.keys(components.responses!)).toEqual([
      "Problem400",
      "Problem401",
      "Problem403",
      "Problem429",
      "Problem500",
    ])
    expect(components.responses!.Problem401).toMatchObject({
      description: "Authentification requise",
      content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
    })
    expect(Object.keys(components.schemas!)).toEqual(["Problem", "Domain"])
    expect(components.securitySchemes!.bearer).toMatchObject({ type: "http", scheme: "bearer" })
  })
})
