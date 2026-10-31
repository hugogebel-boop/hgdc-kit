/**
 * Aperçu en local (runbook `apercu.md`) : la passerelle et ses agents dans des processus du
 * poste, sans conteneur ni uid séparé. Jamais en production : l'agent et la passerelle
 * refusent d'y démarrer sans leurs variables d'isolement.
 */
import { spawn, type ChildProcess } from "node:child_process"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { PACKAGE_DIR } from "./agent.ts"
import { slotSocket } from "./server.ts"

if (process.env.NODE_ENV === "production") throw new Error("dev.ts : jamais en production.")
const here = fileURLToPath(new URL(".", import.meta.url))
const count = Number(process.env.PREVIEW_SLOTS ?? 2)
const socketsDir = process.platform === "win32" ? undefined : resolve(PACKAGE_DIR, ".preview", "sockets")
let stopping = false
const children: Array<ChildProcess> = []
/** Un agent recyclé sort ; il est relancé neuf, comme Docker relance son conteneur sur edge. */
function agent(index: number) {
  const child = spawn(process.execPath, [join(here, "agent.ts")], {
    stdio: "inherit",
    env: {
      ...process.env,
      PREVIEW_SLOT_DIR: join(PACKAGE_DIR, ".preview", `slot-${index}`),
      PREVIEW_AGENT_SOCKET: slotSocket(socketsDir, index),
      PREVIEW_ASTRO_PORT: String(4500 + index),
    },
  })
  children[index] = child
  child.once("exit", () => {
    if (!stopping) setTimeout(() => agent(index), 200)
  })
}
for (let index = 0; index < count; index++) agent(index)
const gateway = spawn(process.execPath, [join(here, "server.ts")], {
  stdio: "inherit",
  env: { ...process.env, PREVIEW_SLOTS: String(count), ...(socketsDir ? { PREVIEW_SLOTS_DIR: socketsDir } : {}) },
})
const stop = () => {
  stopping = true
  for (const child of [...children, gateway]) child.kill()
  process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
