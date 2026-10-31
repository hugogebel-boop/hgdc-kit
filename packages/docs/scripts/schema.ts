// Régénère docs.schema.json depuis le schéma Zod de docs.json : `bun scripts/schema.ts`.
import { writeFileSync } from "node:fs"

import { docsJsonSchema } from "../src/core/json-schema.ts"

writeFileSync(new URL("../docs.schema.json", import.meta.url), `${JSON.stringify(docsJsonSchema(), null, 2)}\n`)
