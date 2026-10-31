import { z } from "zod"

import { docsConfigSchema } from "./config.ts"

/** JSON Schema de docs.json, pour l'autocomplétion des éditeurs (`"$schema"`). */
export function docsJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(docsConfigSchema, { io: "input", unrepresentable: "any" }),
    $id: "https://docs.hgdc.ch/docs.schema.json",
    title: "docs.json de HGDC Docs",
  }
}
