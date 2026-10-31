// @vitest-environment node
/**
 * Isolement de l'aperçu sans Docker (ADR 0011) : agents d'emplacement et passerelle réels,
 * reliés par leurs sockets, avec un faux serveur de site qui sert `index.mdx` tel qu'écrit.
 * Ce qui n'est vérifiable que sur edge (gVisor, uid séparés, réseau coupé) : runbook `apercu.md`.
 */
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { request } from "node:http"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { signAccess, signPreviewRequest } from "../core/preview.ts"
import { agentServer, createAgent, emptyDir, processesOf, Refused, safeDelete, safeWrite, type Agent } from "./agent.ts"
import { startGateway, type GatewaySettings } from "./server.ts"

const SECRET = "test-secret-".padEnd(48, "0")
const run = Math.random().toString(36).slice(2, 8)
const socketFor = (dir: string, name: string) =>
  process.platform === "win32" ? `\\\\.\\pipe\\hgdc-test-${run}-${name}` : join(dir, `${name}.sock`)

/**
 * Faux serveur du site : renvoie la page d'accueil de sa doc, relue à chaque requête. Comme
 * Astro, il suit sa configuration : réécrite vers un autre dossier, il « redémarre » dessus.
 */
const FAKE_SITE = `
const http = require("node:http"), fs = require("node:fs"), path = require("node:path")
let doc = process.env.DOC
const config = path.join(process.env.ASTRO, "astro.config.ts")
fs.watchFile(config, { interval: 50 }, () => {
  const moved = /HGDC_DOCS_DIR = ("[^\\n]*")/.exec(fs.readFileSync(config, "utf8"))
  if (!moved) return
  console.log("Configuration file updated. Restarting...")
  doc = JSON.parse(moved[1])
  console.log("[vite] server restarted.")
})
http.createServer((req, res) => {
  let body = "vide"
  try { body = fs.readFileSync(path.join(doc, "index.mdx"), "utf8") } catch {}
  res.writeHead(200, { "content-type": "text/plain" }); res.end(body)
}).listen(Number(process.env.PORT), "127.0.0.1")
// Trois garde-fous, chacun suffisant : l'entrée standard (un tube tenu par le worker de vitest, fermé
// par le système à sa mort, quelle qu'en soit la cause), le parent qui change, une durée de vie bornée.
process.stdin.on("end", () => process.exit(0))
process.stdin.on("error", () => process.exit(0))
process.stdin.resume()
const parent = process.ppid
setInterval(() => { if (process.ppid !== parent) process.exit(0) }, 1000)
setTimeout(() => process.exit(0), 10 * 60 * 1000)
`
// Le faux site survivait au job sur les runners de forge (2026-10-25 : dix copies ; 2026-10-29 : trois,
// une par emplacement, alerte « Processus de CI orphelins ») :
// - son environnement est refait par l'agent : sans `RUNNER_TRACKING_ID`, le nettoyage de fin de job
//   du runner GitHub ne le voit pas ;
// - un recyclage lancé sans attente (passerelle, test) peut arriver à l'agent après `stop()` de
//   `afterAll` : il relance un préchauffage, donc un faux site que plus rien n'arrête ;
// - la seule garde, le parent qui change, ne joue pas si le worker survit au job, ni sous Windows.
// D'où le tube sur l'entrée standard, la durée bornée, l'identifiant du runner transmis, et le
// balayage de tous les processus lancés à la fin de chaque groupe (`shutdown`).

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function makeAgent(root: string, index: number, port: number) {
  const pids: Array<number> = []
  const children: Array<ChildProcess> = []
  const agent = createAgent({
    slotDir: join(root, `slot-${index}`),
    socket: socketFor(root, `slot-${index}`),
    astroUid: null,
    // Les tests remettent l'agent à neuf dans le processus ; en production, il sort et Docker le relance.
    recycle: "in-place",
    gateUid: null,
    astroPort: port,
    heapMb: 64,
    parentOrigin: "http://localhost:3400",
    hmrPort: "80",
    log: () => {},
    launch: (env, dirs) => {
      const child = spawn(process.execPath, ["-e", FAKE_SITE], {
        env: {
          ...env,
          PORT: String(port),
          DOC: dirs.doc,
          ASTRO: dirs.astro,
          // Le runner GitHub tue en fin de job les processus qui portent son identifiant.
          ...(process.env.RUNNER_TRACKING_ID ? { RUNNER_TRACKING_ID: process.env.RUNNER_TRACKING_ID } : {}),
        },
        // Entrée : le tube qui le tient en vie. Sortie lue par l'agent (fin d'un redémarrage).
        stdio: ["pipe", "pipe", "ignore"],
      })
      pids.push(child.pid!)
      children.push(child)
      return child
    },
  })
  const server = agentServer(agent, port)
  /** Fin du groupe : l'agent, son socket, puis tout faux site encore vivant, même lancé après `stop()`. */
  async function shutdown() {
    await agent.stop()
    server.close()
    // Un recyclage déjà en route peut encore relancer un préchauffage : on balaie jusqu'au calme.
    for (let round = 0; round < 20; round++) {
      const living = children.filter((child) => child.exitCode === null && child.signalCode === null)
      if (!living.length && round >= 4) break
      for (const child of living) {
        child.stdin?.destroy()
        child.kill("SIGKILL")
      }
      await new Promise((done) => setTimeout(done, 100))
    }
  }
  return { agent, server, pids, shutdown, socket: socketFor(root, `slot-${index}`) }
}

async function until(check: () => boolean | Promise<boolean>, ms = 15_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await check()) return
    await new Promise((done) => setTimeout(done, 50))
  }
  throw new Error("délai dépassé")
}

describe("faux site du test", () => {
  it("s'arrête dès que son entrée standard se ferme, comme à la mort du worker", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hgdc-apercu-"))
    writeFileSync(join(dir, "astro.config.ts"), "")
    const child = spawn(process.execPath, ["-e", FAKE_SITE], {
      env: { ...process.env, PORT: "0", DOC: dir, ASTRO: dir },
      stdio: ["pipe", "ignore", "ignore"],
    })
    await new Promise((done) => setTimeout(done, 300))
    expect(child.exitCode).toBe(null)
    child.stdin!.end()
    await until(() => child.exitCode !== null || child.signalCode !== null, 10_000)
    expect(child.exitCode).toBe(0)
  })
})

describe("agent d'emplacement : écritures", () => {
  const root = mkdtempSync(join(tmpdir(), "hgdc-apercu-"))
  const doc = join(root, "doc")
  const outside = join(root, "ailleurs")
  mkdirSync(doc)
  mkdirSync(outside)
  writeFileSync(join(outside, "secret.mdx"), "à un autre locataire")

  it("refuse d'écrire à travers un lien vers un autre dossier", () => {
    symlinkSync(outside, join(doc, "guides"), "junction")
    expect(() => safeWrite(doc, "guides/secret.mdx", Buffer.from("écrasé"))).toThrow(Refused)
    expect(() => safeDelete(doc, "guides/secret.mdx")).toThrow(Refused)
    expect(readFileSync(join(outside, "secret.mdx"), "utf8")).toBe("à un autre locataire")
  })

  it("refuse un lien à la place d'un fichier", (context) => {
    try {
      symlinkSync(join(outside, "secret.mdx"), join(doc, "index.mdx"), "file")
    } catch {
      // Windows sans le droit de créer des liens de fichier : vérifié sur edge (Linux).
      return context.skip()
    }
    expect(() => safeWrite(doc, "index.mdx", Buffer.from("écrasé"))).toThrow(Refused)
    expect(readFileSync(join(outside, "secret.mdx"), "utf8")).toBe("à un autre locataire")
  })

  it("refuse un chemin hors de la doc", () => {
    for (const path of ["../ailleurs/x.mdx", ".hgdc-docs/x.mdx", "astro.config.mjs", "/etc/passwd"])
      expect(() => safeWrite(doc, path, Buffer.from("x"))).toThrow(Refused)
  })

  it("vide un dossier sans suivre les liens", () => {
    emptyDir(doc)
    expect(existsSync(join(outside, "secret.mdx"))).toBe(true)
    expect(existsSync(join(doc, "guides"))).toBe(false)
  })
})

// Processus réels (faux site) lancés, préchauffés et tués à chaque locataire : lent sous Windows.
describe("agent d'emplacement : réinitialisation et génération", { timeout: 20_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "hgdc-apercu-"))
  const port = 45_100 + Math.floor(Math.random() * 400)
  let slot: ReturnType<typeof makeAgent>
  beforeAll(async () => {
    slot = makeAgent(root, 0, port)
    await new Promise<void>((done) => slot.server.listen(slot.socket, done))
  })
  afterAll(async () => {
    await slot.shutdown()
  })

  const call = (path: string, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; body: string }>((done, fail) => {
      const req = request({ socketPath: slot.socket, path, headers: { host: "x", ...headers } }, (res) => {
        let body = ""
        res.on("data", (chunk: Buffer) => (body += chunk))
        res.on("end", () => done({ status: res.statusCode ?? 0, body }))
      })
      req.on("error", fail)
      req.end()
    })

  async function tenant(agent: Agent, generation: string, text: string) {
    await agent.recycle()
    await agent.assign(generation)
    await agent.files(generation, [{ path: "index.mdx", content: Buffer.from(text) }], [])
    await agent.start(generation)
    await until(() => agent.state === "ready")
  }

  it("ne relaie qu'à la génération courante", async () => {
    await tenant(slot.agent, "generationaaaaaaaaaa", "brouillon de A")
    expect((await call("/", { "x-hgdc-preview-generation": "generationaaaaaaaaaa" })).body).toBe("brouillon de A")
    expect((await call("/", { "x-hgdc-preview-generation": "generationbbbbbbbbbb" })).status).toBe(409)
    expect((await call("/")).status).toBe(409)
  })

  it("n'accepte un locataire que sur un agent neuf, après la fin du serveur précédent", async () => {
    const before = slot.pids.at(-1)!
    expect(alive(before)).toBe(true)
    await expect(slot.agent.assign("generationbbbbbbbbbb")).rejects.toThrow(Refused)
    await slot.agent.recycle()
    // À la sortie du recyclage, l'ancien processus est mort et le dossier vide.
    expect(alive(before)).toBe(false)
    await slot.agent.assign("generationbbbbbbbbbb")
    // Rien du locataire précédent : sa doc est vide (la doc neutre du préchauffage est à part).
    expect(readdirSync(slot.agent.dirs.doc)).toEqual([])
    await expect(slot.agent.files("generationaaaaaaaaaa", [], [])).rejects.toThrow(Refused)
    await slot.agent.files("generationbbbbbbbbbb", [{ path: "index.mdx", content: Buffer.from("de B") }], [])
    await slot.agent.start("generationbbbbbbbbbb")
    await until(() => slot.agent.state === "ready")
    expect((await call("/", { "x-hgdc-preview-generation": "generationbbbbbbbbbb" })).body).toBe("de B")
  })

  it("préchauffé : le même serveur passe à la doc du locataire, sans rien de la doc neutre", async () => {
    await slot.agent.recycle()
    await until(() => slot.agent.warm === "warm")
    const warmPid = slot.pids.at(-1)!
    await slot.agent.assign("generationcccccccccc")
    // Avant les fichiers du locataire, rien n'est relayé : la doc neutre ne se montre pas.
    expect((await call("/", { "x-hgdc-preview-generation": "generationcccccccccc" })).status).toBe(503)
    const docsJson = JSON.stringify({ name: "Acme", navigation: { pages: ["index", "guide"] } })
    await slot.agent.files(
      "generationcccccccccc",
      [
        { path: "docs.json", content: Buffer.from(docsJson) },
        { path: "guide.mdx", content: Buffer.from("guide de C") },
      ],
      [],
    )
    // La doc du locataire ne contient que ses fichiers ; la doc neutre n'y a jamais été.
    expect(readdirSync(slot.agent.dirs.doc).sort()).toEqual(["docs.json", "guide.mdx"])
    await slot.agent.start("generationcccccccccc")
    await until(() => slot.agent.state === "ready")
    // Même processus : le serveur préchauffé sert le locataire, sans relance.
    expect(slot.pids.at(-1)).toBe(warmPid)
    expect(alive(warmPid)).toBe(true)
    expect((await call("/", { "x-hgdc-preview-generation": "generationcccccccccc" })).body).toBe("vide")
    const config = readFileSync(join(slot.agent.dirs.astro, "astro.config.ts"), "utf8")
    expect(config).toContain(JSON.stringify(slot.agent.dirs.doc))
  })

  it("docs.json invalide : le serveur préchauffé s'arrête, le site repart à froid", async () => {
    await slot.agent.recycle()
    await until(() => slot.agent.warm === "warm")
    const warmPid = slot.pids.at(-1)!
    await slot.agent.assign("generationdddddddddd")
    await slot.agent.files("generationdddddddddd", [{ path: "index.mdx", content: Buffer.from("sans docs.json") }], [])
    await slot.agent.start("generationdddddddddd")
    await until(() => slot.agent.state === "ready")
    expect(slot.pids.at(-1)).not.toBe(warmPid)
    expect(alive(warmPid)).toBe(false)
    expect((await call("/", { "x-hgdc-preview-generation": "generationdddddddddd" })).body).toBe("sans docs.json")
  })

  it("contrôle les quotas avant toute suppression ou écriture", async () => {
    const many = Array.from({ length: 2001 }, (_, i) => ({ path: `p${i}.mdx`, content: Buffer.from("x") }))
    await expect(slot.agent.files("generationdddddddddd", many, ["index.mdx"])).rejects.toThrow(Refused)
    // Refusé : la page à supprimer est toujours là.
    expect(existsSync(join(slot.agent.dirs.doc, "index.mdx"))).toBe(true)
    const page = Buffer.alloc(500_001, 97)
    await expect(slot.agent.files("generationdddddddddd", [{ path: "gros.mdx", content: page }], [])).rejects.toThrow(
      Refused,
    )
  })

  it("ne compte pas les zombies parmi les processus de l'uid", () => {
    const proc = mkdtempSync(join(tmpdir(), "hgdc-proc-"))
    const add = (pid: number, uid: number, state: string) => {
      mkdirSync(join(proc, String(pid)))
      writeFileSync(
        join(proc, String(pid), "status"),
        `Name:	node
State:	${state}
Uid:	${uid}	${uid}	${uid}	${uid}
`,
      )
    }
    add(10, 20000, "S (sleeping)")
    add(11, 20000, "Z (zombie)")
    add(12, 0, "R (running)")
    mkdirSync(join(proc, "self"))
    expect(processesOf(20000, proc)).toEqual([10])
  })
})

describe("passerelle : emplacements, accès, générations", { timeout: 20_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "hgdc-apercu-"))
  const base = 45_600 + Math.floor(Math.random() * 300)
  const slots = [makeAgent(root, 0, base), makeAgent(root, 1, base + 1)]
  let gatewayPort = 0
  let stop: () => void = () => {}
  let gateway: ReturnType<typeof startGateway>["gateway"]
  const settings = (port: number): GatewaySettings => ({
    secret: SECRET,
    publicUrl: new URL(`http://localhost:${port}`),
    parentOrigin: "http://localhost:3400",
    listen: port,
    host: "127.0.0.1",
    slots: slots.map((slot) => slot.socket),
    maxPerOrganization: 1,
    evictAfterMs: 400,
    closeAfterMs: 60_000,
    maxSessionMs: 3_600_000,
    freshTimeoutMs: 10_000,
    socketGid: null,
  })

  beforeAll(async () => {
    for (const slot of slots) await new Promise<void>((done) => slot.server.listen(slot.socket, done))
    gatewayPort = 46_000 + Math.floor(Math.random() * 1000)
    const started = startGateway(settings(gatewayPort))
    const { server } = started
    gateway = started.gateway
    await new Promise((done) => server.once("listening", done))
    gatewayPort = (server.address() as AddressInfo).port
    stop = () => server.close()
  })
  afterAll(async () => {
    stop()
    for (const slot of slots) await slot.shutdown()
  })

  const hex = (c: string) => c.repeat(64)
  const DOCS_JSON = JSON.stringify({ name: "Acme", navigation: { pages: ["index"] } })
  const DOCS_JSON_SHA = "sdocsjson"
  async function sync(who: { key: string; owner: string; organization: string }, text: string, withRepo = true) {
    // Un emplacement libre a eu le temps de se préchauffer, comme sur edge entre deux sessions.
    await until(() => slots.every((slot) => slot.agent.state !== "fresh" || slot.agent.warm === "warm"))
    const sha = `s${text.length}${who.key}`
    const body = JSON.stringify({
      key: hex(who.key),
      owner: hex(who.owner),
      organization: hex(who.organization),
      project: hex("e"),
      // Sans dépôt : mise à jour d'une session ouverte, le fichier passe en brouillon.
      // docs.json valide : le site préchauffé sert le locataire sans relance, comme sur edge.
      ...(withRepo
        ? {
            repo: [
              { path: "index.mdx", sha },
              { path: "docs.json", sha: DOCS_JSON_SHA },
            ],
          }
        : {}),
      overlay: withRepo ? [] : [{ path: "index.mdx", sha }],
      blobs: [
        { sha: `s${text.length}${who.key}`, encoding: "utf-8", content: text },
        { sha: DOCS_JSON_SHA, encoding: "utf-8", content: DOCS_JSON },
      ],
    })
    const res = await raw("POST", "/v1/sync", `localhost:${gatewayPort}`, body, await signPreviewRequest(SECRET, body))
    return {
      status: res.status,
      json: JSON.parse(res.body) as { session?: string; generation?: string; code?: string },
    }
  }

  const raw = (method: string, path: string, host: string, body = "", headers: Record<string, string> = {}) =>
    new Promise<{ status: number; body: string }>((done, fail) => {
      const req = request(
        { host: "127.0.0.1", port: gatewayPort, method, path, headers: { host, ...headers } },
        (res) => {
          let text = ""
          res.on("data", (chunk: Buffer) => (text += chunk))
          res.on("end", () => done({ status: res.statusCode ?? 0, body: text }))
        },
      )
      req.on("error", fail)
      req.end(body)
    })

  const visit = (session: string, path: string, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; body: string; cookie: string | null }>((done, fail) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: gatewayPort,
          path,
          headers: { host: `${session}.localhost:${gatewayPort}`, ...headers },
        },
        (res) => {
          let body = ""
          res.on("data", (chunk: Buffer) => (body += chunk))
          res.on("end", () =>
            done({ status: res.statusCode ?? 0, body, cookie: res.headers["set-cookie"]?.[0]?.split(";")[0] ?? null }),
          )
        },
      )
      req.on("error", fail)
      req.end()
    })

  const token = (session: string, generation: string, nonce: string) =>
    signAccess(SECRET, "token", { session, generation, expires: Date.now() + 60_000, nonce })

  async function enter(session: string, generation: string, nonce: string) {
    const entry = await visit(session, `/?hd_preview=${await token(session, generation, nonce)}`)
    expect(entry.status).toBe(303)
    return entry.cookie!
  }

  async function read(session: string, cookie: string) {
    let page = await visit(session, "/", { cookie })
    for (let i = 0; i < 100 && page.status === 503; i++) {
      await new Promise((done) => setTimeout(done, 100))
      page = await visit(session, "/", { cookie })
    }
    return page
  }

  it("sert le brouillon de la bonne personne, jeton à usage unique, pilotage inatteignable", async () => {
    const a = await sync({ key: "1", owner: "a", organization: "a" }, "brouillon secret de A")
    expect(a.status).toBe(200)
    const { session, generation } = a.json as { session: string; generation: string }
    expect((await visit(session, "/")).status).toBe(403)
    const reused = await token(session, generation, "unique0001")
    expect((await visit(session, `/?hd_preview=${reused}`)).status).toBe(303)
    expect((await visit(session, `/?hd_preview=${reused}`)).status).toBe(403)
    const cookie = await enter(session, generation, "unique0002")
    expect((await read(session, cookie)).body).toBe("brouillon secret de A")
    expect((await visit(session, "/_agent/reset", { cookie })).status).toBe(404)
    expect((await visit("pasunesessionvalide0000000", "/")).status).toBe(404)
    expect((await raw("POST", "/v1/sync", "evil.ch")).status).toBe(400)
    expect((await raw("POST", "/v1/sync", `localhost:${gatewayPort}`, "{}")).status).toBe(401)
  })

  it("plafond par organisation : une session active n'est jamais éjectée", async () => {
    const other = await sync({ key: "2", owner: "c", organization: "a" }, "autre de l'organisation A")
    expect(other).toMatchObject({ status: 503, json: { code: "busy_organization" } })
  })

  it("un emplacement repris efface le locataire précédent et change de génération", async () => {
    const first = await sync({ key: "1", owner: "a", organization: "a" }, "brouillon secret de A")
    const { session, generation } = first.json as { session: string; generation: string }
    const cookieA = await enter(session, generation, "unique0003")
    // B prend le second emplacement, C ne trouve rien de libre tant que A et B sont actifs.
    const b = await sync({ key: "3", owner: "b", organization: "b" }, "doc de B")
    expect(b.status).toBe(200)
    const c = await sync({ key: "4", owner: "f", organization: "c" }, "doc de C")
    expect(c).toMatchObject({ status: 503, json: { code: "busy" } })
    // A inactif depuis plus de `evictAfterMs` : C prend sa place.
    await new Promise((done) => setTimeout(done, 500))
    await sync({ key: "3", owner: "b", organization: "b" }, "doc de B")
    const taken = await sync({ key: "4", owner: "f", organization: "c" }, "doc de C")
    expect(taken.status).toBe(200)
    const { session: sessionC, generation: generationC } = taken.json as { session: string; generation: string }
    expect(generationC).not.toBe(generation)
    expect((await visit(session, "/", { cookie: cookieA })).status).toBe(404)
    const cookieC = await enter(sessionC, generationC, "unique0004")
    const page = await read(sessionC, cookieC)
    expect(page.body).toBe("doc de C")
    // Le cookie de A ne vaut rien pour la session de C, même posé sur son hôte.
    expect((await visit(sessionC, "/", { cookie: cookieA })).status).toBe(403)
  })

  it("une session par personne : la sienne cède la place, celle des autres jamais", async () => {
    const before = await sync({ key: "4", owner: "f", organization: "c" }, "doc de C")
    const previous = (before.json as { session: string }).session
    const other = await sync({ key: "6", owner: "f", organization: "c" }, "autre branche de C")
    expect(other.status).toBe(200)
    expect((await visit(previous, "/")).status).toBe(404)
    // B vient de servir : active, elle garde son emplacement.
    await sync({ key: "3", owner: "b", organization: "b" }, "doc de B")
    const stranger = await sync({ key: "7", owner: "9", organization: "8" }, "inconnu")
    expect(stranger).toMatchObject({ status: 503, json: { code: "busy" } })
  })

  it("emplacement mort puis reparti neuf : session fermée, la suivante s'ouvre", async () => {
    await new Promise((done) => setTimeout(done, 500))
    const who = { key: "9", owner: "6", organization: "6" }
    const before = await sync(who, "avant la panne")
    expect(before.status).toBe(200)
    const { session, generation } = before.json as { session: string; generation: string }
    const cookie = await enter(session, generation, "unique0010")
    expect((await read(session, cookie)).body).toBe("avant la panne")

    // OOM ou plantage : Docker relance le conteneur, l'agent repart neuf, sans génération.
    await slots[gateway.sessions.get(session)!.slot]!.agent.recycle()

    // Une mise à jour sur la session perdue la ferme sans la garder en vie ; Convex rouvre tout.
    expect(await sync(who, "pendant la panne", false)).toMatchObject({ status: 409, json: { code: "slot_lost" } })
    expect(gateway.sessions.has(session)).toBe(false)
    // La lectrice voit l'aperçu fermé, et la console reçoit de quoi en rouvrir un.
    const shown = await visit(session, "/", { cookie })
    expect(shown.status).toBe(404)
    expect(shown.body).toContain('"type":"closed"')
    const after = await sync(who, "après la panne")
    expect(after.status).toBe(200)
    const reopened = after.json as { session: string; generation: string }
    expect(reopened.session).not.toBe(session)
    const fresh = await enter(reopened.session, reopened.generation, "unique0011")
    expect((await read(reopened.session, fresh)).body).toBe("après la panne")
  })

  it("la lectrice voit la panne la première : « relance en cours », session fermée", async () => {
    const who = { key: "a", owner: "5", organization: "5" }
    await new Promise((done) => setTimeout(done, 500))
    const opened = await sync(who, "avant")
    expect(opened.status).toBe(200)
    const { session, generation } = opened.json as { session: string; generation: string }
    const cookie = await enter(session, generation, "unique0012")
    expect((await read(session, cookie)).body).toBe("avant")
    await slots[gateway.sessions.get(session)!.slot]!.agent.recycle()
    const shown = await visit(session, "/", { cookie })
    expect(shown.status).toBe(404)
    expect(shown.body).toContain("relance en cours")
    expect(shown.body).toContain('"type":"closed"')
    await until(() => !gateway.sessions.has(session))
    expect((await sync(who, "après")).status).toBe(200)
  })

  // Sept attributions, chacune après un recyclage et un préchauffage (taskkill est lent sous Windows).
  it("six attributions par personne en dix minutes, pas plus", async () => {
    // Les sessions précédentes deviennent inactives : leurs emplacements peuvent servir.
    await new Promise((done) => setTimeout(done, 500))
    const keys = ["0", "5", "8", "b", "c", "e"]
    for (const key of keys) expect((await sync({ key, owner: "7", organization: "7" }, `doc ${key}`)).status).toBe(200)
    expect(await sync({ key: "d", owner: "7", organization: "7" }, "doc d")).toMatchObject({
      status: 503,
      json: { code: "busy_person" },
    })
  }, 60_000)
})
