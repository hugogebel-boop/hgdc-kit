import { defineConfig } from "astro/config"

import { createAstroConfig } from "../src/integration.ts"

// Le site est entièrement décrit par le docs.json du client : voir `src/integration.ts`.
export default defineConfig(createAstroConfig())
