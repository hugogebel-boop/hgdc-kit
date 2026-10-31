import { compile } from "@mdx-js/mdx"
import { describe, expect, it } from "vitest"

import { openApiPages, slugify } from "./openapi.ts"

const spec = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1" },
  servers: [{ url: "https://api.exemple.ch/" }],
  security: [{ bearer: [] }],
  tags: [{ name: "Contacts", description: "Les contacts." }],
  paths: {
    "/contacts/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Contacts"],
        summary: "Lire un contact",
        description: "Renvoie { le contact } <tel quel>.",
        responses: {
          "200": {
            description: "Ok",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Contact" } } },
          },
        },
      },
    },
    "/v2/projects": {
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: { name: { type: "string", maxLength: 40 }, plan: { enum: ["a", "b"] } },
              },
            },
          },
        },
        responses: { "201": { description: "Créé" } },
      },
    },
  },
  components: {
    schemas: {
      Contact: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
          parent: { $ref: "#/components/schemas/Contact" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
}

describe("openApiPages", () => {
  const pages = openApiPages(spec)

  it("groupe par tag, puis par segment du chemin sans tag", () => {
    expect(pages.map((page) => page.slug)).toEqual(["contacts", "projects"])
    expect(pages[0]?.description).toBe("Les contacts.")
  })

  it("est déterministe", () => {
    expect(openApiPages(spec)).toEqual(pages)
  })

  it("produit du MDX valide malgré les accolades et chevrons du texte", async () => {
    for (const page of pages) await expect(compile(page.mdx)).resolves.toBeDefined()
    expect(pages[0]?.mdx).toContain(String.raw`## GET /contacts/\{id\}`)
    expect(pages[0]?.mdx).toContain(String.raw`Renvoie \{ le contact \} &lt;tel quel>.`)
  })

  it("décrit paramètres, corps, réponses et exemple, sans boucler sur un schéma récursif", () => {
    const mdx = pages[0]?.mdx ?? ""
    expect(mdx).toContain("| `id` | string | Oui |")
    expect(mdx).toContain('curl -X GET "https://api.exemple.ch/contacts/<id>"')
    expect(mdx).toContain("`tags` | string[]")
    const post = pages[1]?.mdx ?? ""
    expect(post).toContain(String.raw`"a" \| "b"`)
    expect(post).toContain("40 caractères au plus")
    expect(post).toContain(`-d '{"name":"exemple"}'`)
  })

  it("refuse une spécification qui n'est pas OpenAPI 3", () => {
    expect(() => openApiPages({ swagger: "2.0" })).toThrow(/openapi/)
  })
})

describe("slugify", () => {
  it("retire accents et ponctuation", () => {
    expect(slugify("Clés d'API")).toBe("cles-d-api")
  })
})
