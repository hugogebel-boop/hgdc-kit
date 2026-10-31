/**
 * Agent d'emplacement de l'aperçu (ADR 0011, runbook `apercu.md`).
 *
 * Un agent par emplacement, seul processus privilégié de son conteneur gVisor (sans réseau).
 * Il reçoit les fichiers de la passerelle par un socket Unix propre à l'emplacement, les
 * écrit dans un dossier que le serveur Astro ne peut pas modifier, lance Astro sous un uid
 * sans privilège et relaie vers lui les requêtes qui portent la génération courante.
 *
 * Réinitialisation (nouveau locataire) : tous les processus de l'uid d'Astro sont tués et
 * attendus, les dossiers effacés, puis seulement la nouvelle génération est acceptée. Si un
 * processus survit, l'agent s'arrête : le conteneur redémarre propre.
 *
 * Préchauffage : dès qu'il est neuf, l'agent lance Astro sur une doc neutre (aucune donnée
 * d'un client, dossier à part) et lui fait compiler une page. Les fichiers du locataire
 * s'écrivent dans un dossier qu'Astro ne surveille pas encore ; puis l'agent réécrit la
 * configuration d'Astro vers ce dossier : un seul redémarrage, dans le même processus. Rien
 * d'un locataire ne précède le suivant : l'agent sort toujours à la fin d'un locataire.
 *
 * Lancé par `node src/preview/agent.ts` (types retirés par Node), hors de `node_modules`.
 */
import { spawn, type ChildProcess } from "node:child_process"
import { randomBytes } from "node:crypto"
import {
  chmodSync,
  chownSync,
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from "node:fs"
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { connect } from "node:net"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { parseDocsConfig, type DocsConfig } from "../core/config.ts"
import { GENERATION, GENERATION_HEADER, PREVIEW_LIMITS } from "../core/preview.ts"
import { isDocFile, isImageFile } from "../core/validate.ts"

const here = dirname(fileURLToPath(import.meta.url))
export const PACKAGE_DIR = resolve(here, "../..")
const BIN = join(PACKAGE_DIR, "bin", "hgdc-docs.mjs")

/** En-tête posé par la passerelle seulement sur ses appels de pilotage. */
export const CONTROL_HEADER = "x-hgdc-agent-control"
/** Réponse de l'agent lui-même (et non d'Astro) : état de l'emplacement. */
export const AGENT_STATE_HEADER = "x-hgdc-agent-state"

export class Refused extends Error {}

// --- Écriture sans suivre de lien ---------------------------------------------------------

/**
 * Écrit `path` (relatif) sous `root` en refusant tout ce qui n'est pas un dossier ou un
 * fichier ordinaire, à chaque niveau (`lstat`, jamais `stat`), et sans suivre de lien à
 * l'ouverture (`O_NOFOLLOW`). Le dossier n'est modifiable que par l'agent ; ces contrôles
 * tiennent quand même s'il ne l'était plus.
 */
export function safeWrite(root: string, path: string, bytes: Uint8Array) {
  const target = checkedTarget(root, path)
  let dir = root
  for (const part of relative(root, dirname(target)).split(sep).filter(Boolean)) {
    dir = join(dir, part)
    const info = lstatOrNull(dir)
    if (info === null) mkdirSync(dir, { mode: 0o755 })
    else if (!info.isDirectory() || info.isSymbolicLink()) throw new Refused(`Chemin refusé : ${path}`)
  }
  const info = lstatOrNull(target)
  if (info !== null && (!info.isFile() || info.isSymbolicLink())) throw new Refused(`Chemin refusé : ${path}`)
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0)
  const fd = openSync(target, flags, 0o644)
  try {
    writeSync(fd, bytes)
  } finally {
    closeSync(fd)
  }
}

/** Retire un fichier ordinaire ; un lien ou un dossier est refusé. */
export function safeDelete(root: string, path: string) {
  const target = checkedTarget(root, path)
  let dir = root
  for (const part of relative(root, dirname(target)).split(sep).filter(Boolean)) {
    dir = join(dir, part)
    const info = lstatOrNull(dir)
    if (info === null) return
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Refused(`Chemin refusé : ${path}`)
  }
  const info = lstatOrNull(target)
  if (info === null) return
  if (!info.isFile() || info.isSymbolicLink()) throw new Refused(`Chemin refusé : ${path}`)
  unlinkSync(target)
}

function checkedTarget(root: string, path: string): string {
  if (!isDocFile(path)) throw new Refused(`Fichier refusé : ${path.slice(0, 100)}`)
  const target = resolve(root, path)
  if (relative(root, target).startsWith("..") || resolve(target) === resolve(root)) throw new Refused("Chemin refusé.")
  return target
}

function lstatOrNull(path: string) {
  try {
    return lstatSync(path)
  } catch {
    return null
  }
}

/** Vide un dossier sans le retirer (il peut être un point de montage) ; `rm` ne suit pas les liens. */
export function emptyDir(dir: string) {
  mkdirSync(dir, { recursive: true })
  for (const name of readdirSync(dir)) rmSync(join(dir, name), { recursive: true, force: true })
}

// --- Processus de l'uid d'Astro -----------------------------------------------------------

/** Processus de cet uid (Linux, `/proc`) ; gVisor tient son propre `/proc` par conteneur. */
export function processesOf(uid: number, proc = "/proc"): Array<number> {
  const pids: Array<number> = []
  for (const name of readdirSync(proc)) {
    if (!/^\d+$/.test(name)) continue
    try {
      const status = readFileSync(join(proc, name, "status"), "utf8")
      const real = /^Uid:\s+(\d+)/m.exec(status)?.[1]
      // Un zombie (`State: Z`) ne tourne plus : il attend d'être récolté par `init`, il ne compte pas.
      const zombie = /^State:\s+[ZX]/m.test(status)
      if (Number(real) === uid && !zombie) pids.push(Number(name))
    } catch {
      // Processus terminé entre la liste et la lecture.
    }
  }
  return pids
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

async function portFree(port: number): Promise<boolean> {
  return await new Promise((done) => {
    const socket = connect(port, "127.0.0.1")
    socket.once("connect", () => {
      socket.destroy()
      done(false)
    })
    socket.once("error", () => done(true))
  })
}

/** Page entière servie par Astro, ou `null` s'il ne répond pas encore (démarrage, redémarrage). */
async function fetchPage(port: number, path: string): Promise<{ status: number; body: string } | null> {
  return await new Promise((done) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, timeout: 120_000 }, (res) => {
      const chunks: Array<Buffer> = []
      res.on("data", (chunk: Buffer) => chunks.push(chunk))
      res.on("end", () => done({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }))
      res.on("error", () => done(null))
    })
    req.on("timeout", () => req.destroy())
    req.on("error", () => done(null))
    req.end()
  })
}

/**
 * Doc neutre du préchauffage, sans aucune donnée d'un client : de quoi compiler le modèle,
 * MDX, coloration du code et composants courants. `marker` distingue sa page de celles du locataire.
 */
export function neutralDoc(marker: string): Array<{ path: string; content: Uint8Array }> {
  const docsJson = { name: "Aperçu", navigation: { pages: ["index"] } }
  const index = `---
title: ${marker}
description: Aperçu en préparation.
---

<Note>Aperçu en préparation.</Note>

<Steps>
  <Step title="Un">Texte.</Step>
</Steps>

<Tabs>
  <Tab title="Un">Texte.</Tab>
</Tabs>

<CardGroup cols={2}>
  <Card title="Un" href="/">Texte.</Card>
</CardGroup>

<Accordion title="Un">Texte.</Accordion>

<CodeGroup>
\`\`\`sh npm
npm install
\`\`\`
</CodeGroup>

\`\`\`ts
export const value = 1
\`\`\`
`
  return [
    { path: "index.mdx", content: Buffer.from(index) },
    { path: "docs.json", content: Buffer.from(JSON.stringify(docsJson)) },
  ]
}

// --- Emplacement ----------------------------------------------------------------------------

export type AgentOptions = {
  /** Dossier de l'emplacement, sous le paquet (Vite y résout Astro et Starlight). */
  slotDir: string
  socket: string
  /** uid (et gid) d'Astro ; absent en développement local seulement. */
  astroUid: number | null
  /** Propriétaire du socket : la passerelle. */
  gateUid: number | null
  astroPort: number
  heapMb: number
  parentOrigin: string
  hmrPort: string
  /** Remplacé dans les tests : ce qui lance le serveur du site. */
  launch?: (env: NodeJS.ProcessEnv, dirs: { doc: string; astro: string }) => ChildProcess
  /**
   * Remise à neuf après un locataire. Production et `dev.ts` : l'agent sort et le conteneur
   * (ou `dev.ts`) le relance : /tmp, /dev/shm, IPC et processus repartent de zéro.
   * Tests seulement : remise à neuf dans le processus (`"in-place"`).
   */
  recycle?: "exit" | "in-place"
  /** Astro lancé sur la doc neutre dès que l'agent est neuf (par défaut). */
  prewarm?: boolean
  log?: (line: string) => void
}

/**
 * `fresh` : agent neuf, jamais servi ; seul état où un locataire est accepté.
 * `recycling` : l'agent va sortir, la passerelle attend l'agent suivant.
 */
type State = "fresh" | "idle" | "starting" | "ready" | "stopped" | "recycling"
/** Préchauffage : `warming` (Astro compile la doc neutre), `warm` (page servie), `off` (aucun ou échoué). */
type Warm = "off" | "warming" | "warm"

/** Au-delà, un redémarrage d'Astro sur la doc du locataire est tenu pour manqué : relance à froid. */
const SWAP_TIMEOUT_MS = 90_000
/** Premier « Prévisualiser » : une page servie au plus tard après ce délai, sinon l'emplacement attend. */
const READY_TIMEOUT_MS = 300_000

export function createAgent(options: AgentOptions) {
  const doc = join(options.slotDir, "doc")
  const astro = join(options.slotDir, "astro")
  /** Doc neutre du préchauffage, jamais celle d'un locataire. */
  const neutralDir = join(options.slotDir, "neutral")
  const log = options.log ?? ((line: string) => console.warn(`[emplacement] ${line}`))
  let generation: string | null = null
  let state: State = "fresh"
  let child: ChildProcess | null = null
  let bytes = new Map<string, number>()
  let busy: Promise<unknown> = Promise.resolve()
  let warm: Warm = "off"
  /** Nom de la doc neutre, tiré au hasard : il ne peut pas venir d'une doc de client. */
  let marker: string | null = null
  let assignedAt = Date.now()
  /** Redémarrages d'Astro annoncés et terminés, lus sur sa sortie (jamais recopiée). */
  let restartsBegun = 0
  let restarts = 0
  const seconds = (since: number) => ((Date.now() - since) / 1000).toFixed(1)

  /** Une opération de pilotage à la fois : jamais d'écriture pendant une réinitialisation. */
  function serial<T>(run: () => Promise<T>): Promise<T> {
    const next = busy.then(run, run)
    busy = next.catch(() => {})
    return next
  }

  async function killAll() {
    const current = child
    child = null
    if (options.astroUid !== null) {
      // Tout processus de l'uid, détaché ou non, jusqu'à ce qu'il n'en reste aucun.
      for (let round = 0; round < 100; round++) {
        const pids = processesOf(options.astroUid)
        if (!pids.length) break
        for (const pid of pids)
          try {
            process.kill(pid, "SIGKILL")
          } catch {
            // Déjà terminé.
          }
        await sleep(50)
      }
      if (processesOf(options.astroUid).length) {
        log("des processus d'Astro survivent : arrêt de l'agent, le conteneur repart propre")
        process.exit(70)
      }
    } else if (current && current.exitCode === null && current.signalCode === null) {
      // Développement local : l'arbre du serveur Astro, attendu jusqu'à sa fin.
      const exited = new Promise((done) => current.once("exit", done))
      // Sans attente bloquante : la passerelle et les autres emplacements continuent (`dev.ts`).
      if (process.platform === "win32")
        await new Promise((done) => spawn("taskkill", ["/T", "/F", "/PID", String(current.pid)]).once("exit", done))
      else current.kill("SIGKILL")
      await Promise.race([exited, sleep(10_000)])
    }
    for (let i = 0; i < 100 && !(await portFree(options.astroPort)); i++) await sleep(100)
    if (!(await portFree(options.astroPort))) {
      log("le port d'Astro reste occupé : arrêt de l'agent")
      process.exit(71)
    }
  }

  /** Prépare les dossiers de l'emplacement : la doc (à l'agent) et le dossier d'Astro (à lui). */
  function prepare() {
    emptyDir(options.slotDir)
    mkdirSync(doc, { mode: 0o755 })
    mkdirSync(astro, { mode: 0o700 })
    if (options.astroUid !== null) chownSync(astro, options.astroUid, options.astroUid)
    writeAstroConfig(null)
  }

  /**
   * Configuration d'Astro : celle du modèle, plus, pour passer de la doc neutre à celle du
   * locataire, le dossier de la doc. Astro relit ce fichier dès qu'il change et redémarre.
   * Écrite à côté puis renommée : le dossier est à Astro, un lien posé là ne serait pas suivi.
   */
  function writeAstroConfig(contentDir: string | null) {
    const template = JSON.stringify(
      relative(astro, join(PACKAGE_DIR, "template", "astro.config.ts")).replaceAll("\\", "/"),
    )
    const text = contentDir
      ? `process.env.HGDC_DOCS_DIR = ${JSON.stringify(contentDir)}\nconst { default: config } = await import(${template})\nexport default config\n`
      : `export { default } from ${template}\n`
    const staged = join(astro, `.astro.config.${randomBytes(8).toString("hex")}.ts`)
    safeWriteConfig(staged, text)
    if (options.astroUid !== null) chownSync(staged, options.astroUid, options.astroUid)
    renameSync(staged, join(astro, "astro.config.ts"))
  }

  /**
   * Agent neuf : Astro sur la doc neutre, puis une page demandée pour compiler le modèle. Le
   * locataire arrive pendant ou après ; dans les deux cas il remplace cette doc.
   */
  function prewarm() {
    if (options.prewarm === false) return
    const started = Date.now()
    marker = `apercu-neutre-${randomBytes(8).toString("hex")}`
    prepare()
    mkdirSync(neutralDir, { mode: 0o755 })
    for (const file of neutralDoc(marker)) safeWrite(neutralDir, file.path, file.content)
    warm = "warming"
    const launched = launch(neutralDir)
    const own = marker
    // Le locataire peut arriver avant la fin : plus aucune requête neutre une fois servi.
    const wanted = () => warm === "warming"
    void (async () => {
      while (child === launched && (await portFree(options.astroPort))) await sleep(100)
      // Un locataire déjà là passe d'abord : sa page, pas la page neutre, occupe Astro.
      await sleep(1000)
      const page = await servedPage(launched, "/", (body) => body.includes(own), READY_TIMEOUT_MS, { wanted })
      if (warm !== "warming" || child !== launched) return
      warm = page ? "warm" : "off"
      log(page ? `préchauffé en ${seconds(started)} s` : "préchauffage manqué")
    })()
  }

  /** Locataire suivant : seulement sur un agent neuf, jamais par-dessus le précédent. */
  async function assign(next: string) {
    if (!GENERATION.test(next)) throw new Refused("Génération invalide.")
    if (state !== "fresh") throw new Refused("Emplacement déjà servi : à recycler d'abord.")
    // Préchauffé : `doc` est vide et Astro ne la lit pas encore (il sert la doc neutre).
    if (warm === "off") prepare()
    bytes = new Map()
    generation = next
    state = "idle"
    assignedAt = Date.now()
    log(`locataire attribué (${warm === "off" ? "à froid" : warm === "warm" ? "préchauffé" : "préchauffage en cours"})`)
  }

  /** Fin d'un locataire : plus rien n'est servi, puis l'agent repart neuf. */
  async function recycle(): Promise<"fresh" | "exit"> {
    if (state === "fresh") return "fresh"
    generation = null
    state = "recycling"
    warm = "off"
    // Le serveur du site s'arrête d'abord (sans conteneur, en local, il survivrait à l'agent).
    await killAll()
    if ((options.recycle ?? "exit") === "exit") return "exit"
    emptyDir(options.slotDir)
    state = "fresh"
    prewarm()
    return "fresh"
  }

  function applyFiles(writes: Array<{ path: string; content: Uint8Array }>, deletes: Array<string>) {
    // Quotas d'abord, sur l'état d'après : rien n'est supprimé ni écrit si la requête est refusée.
    for (const write of writes)
      if (write.content.length > (isImageFile(write.path) ? PREVIEW_LIMITS.imageBytes : PREVIEW_LIMITS.textBytes))
        throw new Refused(`Fichier trop volumineux pour l'aperçu : ${write.path.slice(0, 100)}`)
    const after = new Map(bytes)
    for (const path of deletes) after.delete(path)
    for (const write of writes) after.set(write.path, write.content.length)
    const total = [...after.values()].reduce((sum, size) => sum + size, 0)
    if (after.size > PREVIEW_LIMITS.files || total > PREVIEW_LIMITS.sessionBytes)
      throw new Refused("Doc trop volumineuse pour l'aperçu.")
    for (const path of deletes) {
      safeDelete(doc, path)
      bytes.delete(path)
    }
    // docs.json en dernier : la navigation ne cite jamais une page pas encore écrite.
    const ordered = [...writes].sort((a, b) => Number(a.path === "docs.json") - Number(b.path === "docs.json"))
    for (const write of ordered) {
      safeWrite(doc, write.path, write.content)
      bytes.set(write.path, write.content.length)
    }
  }

  /** Lance le serveur du site sur la doc de `contentDir`. */
  function launch(contentDir: string): ChildProcess {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot } : {}),
      HOME: astro,
      NODE_ENV: "development",
      NODE_OPTIONS: `--max-old-space-size=${options.heapMb}`,
      ASTRO_TELEMETRY_DISABLED: "1",
      HGDC_DOCS_ROOT: astro,
      HGDC_DOCS_WORK: join(astro, "work"),
      HGDC_DOCS_OUT: join(astro, "out"),
      HGDC_DOCS_PREVIEW_PARENT: options.parentOrigin,
      HGDC_DOCS_PREVIEW_HMR_PORT: options.hmrPort,
    }
    const launched = options.launch
      ? options.launch(env, { doc: contentDir, astro })
      : spawn(process.execPath, [BIN, "dev", contentDir, "--port", String(options.astroPort), "--host", "127.0.0.1"], {
          cwd: astro,
          env,
          // Aucune sortie d'Astro dans les journaux : elle peut citer le contenu du client. Elle
          // est seulement lue, pour savoir quand un redémarrage est fini.
          stdio: ["ignore", "pipe", "ignore"],
          // uid et gid posés par libuv, qui appelle aussi `setgroups(0, NULL)` : aucun groupe
          // supplémentaire, aucune capacité effective (contrôle `Groups`/`CapEff` du runbook).
          ...(options.astroUid !== null ? { uid: options.astroUid, gid: options.astroUid } : {}),
        })
    child = launched
    let tail = ""
    launched.stdout?.on("data", (chunk: Buffer) => {
      tail = (tail + chunk.toString("utf8")).slice(-256)
      const begun = tail.includes("Restarting...")
      const done = tail.includes("server restarted")
      if (!begun && !done) return
      if (child === launched) {
        if (begun) restartsBegun++
        if (done) restarts++
      }
      tail = ""
    })
    launched.once("exit", (code) => {
      if (child !== launched) return
      child = null
      if (state === "fresh") {
        // Préchauffage en échec : le locataire partira à froid, comme sans préchauffage.
        warm = "off"
        log(`préchauffage arrêté (code ${code ?? "signal"})`)
        return
      }
      state = "stopped"
      log(`serveur du site arrêté (code ${code ?? "signal"})`)
    })
    return launched
  }

  /**
   * Attend une page entière servie par ce processus et acceptée par `accept` : Astro a compilé
   * la page, pas seulement ouvert son port. `null` si le processus change ou après `timeoutMs`.
   * Rien n'est demandé avant `gate` (une requête pendant un redémarrage le ralentit d'autant),
   * plus rien dès que `wanted` est faux.
   */
  async function servedPage(
    launched: ChildProcess,
    path: string,
    accept: (body: string) => boolean,
    timeoutMs: number,
    { gate = () => true, wanted = () => true }: { gate?: () => boolean; wanted?: () => boolean } = {},
  ): Promise<{ status: number } | null> {
    const until = Date.now() + timeoutMs
    while (child === launched && Date.now() < until && wanted()) {
      if (!gate()) {
        await sleep(100)
        continue
      }
      const page = await fetchPage(options.astroPort, path)
      if (child !== launched || !wanted()) return null
      if (page && accept(page.body)) return { status: page.status }
      await sleep(200)
    }
    return null
  }

  /** Chemin de la première page du locataire : `/`, ou son sous-chemin (`base`). */
  function tenantConfig(): { config: DocsConfig | null; path: string } {
    try {
      const parsed = parseDocsConfig(readFileSync(join(doc, "docs.json"), "utf8"))
      return parsed.ok ? { config: parsed.config, path: `${parsed.config.base ?? ""}/` } : { config: null, path: "/" }
    } catch {
      return { config: null, path: "/" }
    }
  }

  /** Prêt dès la première page servie du locataire ; l'aperçu attend jusque-là (« démarrage »). */
  function whenServed(
    launched: ChildProcess,
    path: string,
    accept: (body: string) => boolean,
    how: string,
    gate?: () => boolean,
  ) {
    const current = generation
    void (async () => {
      const page = await servedPage(launched, path, accept, READY_TIMEOUT_MS, { gate })
      if (child !== launched || generation !== current || state !== "starting") return
      if (page) {
        state = "ready"
        log(`serveur du site prêt ${how} en ${seconds(assignedAt)} s (page ${page.status})`)
      } else log(`aucune page servie ${how} après ${seconds(assignedAt)} s`)
    })()
  }

  /**
   * Sert le locataire : sur l'Astro préchauffé s'il y en a un (sa configuration est pointée
   * vers `doc`), sinon en le lançant. La synchronisation n'attend ni l'un ni l'autre.
   */
  async function start() {
    // `stopped` : le serveur du site s'est arrêté, la synchronisation suivante le relance.
    if (generation === null || (state !== "idle" && state !== "stopped")) return
    const config = tenantConfig()
    const warmChild = state === "idle" && warm !== "off" ? child : null
    const current = generation
    const live = () => generation === current && state === "starting"
    state = "starting"
    void (async () => {
      // docs.json invalide ou absent : à froid, Astro dit l'erreur comme sans préchauffage.
      if (warmChild && config.config) {
        // Astro du préchauffage à l'écoute (page neutre faite ou pas) : sa configuration change.
        // Pas encore : il repart à froid sur la doc du locataire, c'est plus court (mesures du
        // runbook `apercu.md`).
        if (warm !== "off" && child === warmChild && marker && !(await portFree(options.astroPort))) {
          warm = "off"
          const own = marker
          const before = restarts
          const begun = restartsBegun
          // Changement manqué (Astro à peine lancé) : configuration réécrite, trois fois au plus.
          for (let attempt = 0; attempt < 3 && live() && restartsBegun === begun; attempt++) {
            writeAstroConfig(doc)
            if (!warmChild.stdout) break
            for (let i = 0; i < 30 && restartsBegun === begun && live(); i++) await sleep(100)
          }
          // Rien n'est demandé pendant le redémarrage ; prêt sur la première page du locataire.
          whenServed(
            warmChild,
            config.path,
            (body) => !body.includes(own),
            "à chaud",
            () => restarts > before,
          )
          await sleep(SWAP_TIMEOUT_MS)
          await serial(async () => {
            if (!live() || child !== warmChild) return
            log("redémarrage à chaud manqué : relance à froid")
            await killAll()
            state = "idle"
            await start()
          })
          return
        }
      }
      warm = "off"
      if (child) await killAll()
      // Recyclé entre-temps : rien à lancer.
      if (!live() || child) return
      whenServed(launch(doc), config.path, () => true, "à froid")
    })()
  }

  prewarm()

  return {
    get generation() {
      return generation
    },
    get state() {
      return state
    },
    get warm() {
      return warm
    },
    assign: (next: string) => serial(() => assign(next)),
    recycle: () => serial(() => recycle()),
    files: (current: string, writes: Array<{ path: string; content: Uint8Array }>, deletes: Array<string>) =>
      serial(async () => {
        if (current !== generation) throw new Refused("Génération périmée.")
        applyFiles(writes, deletes)
      }),
    start: (current: string) =>
      serial(async () => {
        if (current !== generation) throw new Refused("Génération périmée.")
        await start()
      }),
    stop: () => serial(() => killAll()),
    dirs: { doc, astro },
  }
}

function safeWriteConfig(path: string, text: string) {
  const fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o644)
  try {
    writeSync(fd, text)
  } finally {
    closeSync(fd)
  }
}

export type Agent = ReturnType<typeof createAgent>

// --- Serveur du socket ----------------------------------------------------------------------

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Array<Buffer> = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > limit) throw new Refused("Trop volumineux.")
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function reply(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers })
  res.end(JSON.stringify(body))
}

type FilesBody = {
  generation: string
  writes: Array<{ path: string; encoding: "utf-8" | "base64"; content: string }>
  deletes: Array<string>
}

function parseFiles(raw: unknown): FilesBody {
  const body = raw as Partial<FilesBody> | null
  if (
    !body ||
    typeof body.generation !== "string" ||
    !Array.isArray(body.writes) ||
    !Array.isArray(body.deletes) ||
    body.writes.length > PREVIEW_LIMITS.files ||
    body.deletes.length > PREVIEW_LIMITS.files
  )
    throw new Refused("Requête invalide.")
  for (const write of body.writes)
    if (
      typeof write?.path !== "string" ||
      typeof write.content !== "string" ||
      (write.encoding !== "utf-8" && write.encoding !== "base64")
    )
      throw new Refused("Requête invalide.")
  if (body.deletes.some((path) => typeof path !== "string")) throw new Refused("Requête invalide.")
  return body as FilesBody
}

export function agentServer(agent: Agent, astroPort: number): Server {
  const server = createServer((req, res) => {
    if (req.headers[CONTROL_HEADER] === "1") {
      void control(req, res).catch((error: unknown) => {
        if (!res.headersSent)
          reply(res, error instanceof Refused || error instanceof SyntaxError ? 400 : 500, {
            message: error instanceof Refused ? error.message : "Erreur de l'emplacement.",
          })
      })
      return
    }
    // Requête d'une lectrice, relayée par la passerelle : seulement à la génération courante.
    if (!agent.generation || req.headers[GENERATION_HEADER] !== agent.generation)
      return reply(res, 409, { state: "gone" }, { [AGENT_STATE_HEADER]: "gone" })
    if (agent.state !== "ready") return reply(res, 503, { state: agent.state }, { [AGENT_STATE_HEADER]: agent.state })
    const headers = { ...req.headers }
    delete headers[GENERATION_HEADER]
    const upstream = httpRequest(
      { host: "127.0.0.1", port: astroPort, method: req.method, path: req.url, headers },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers)
        answer.pipe(res)
      },
    )
    upstream.on("error", () => {
      if (!res.headersSent) reply(res, 503, { state: "starting" }, { [AGENT_STATE_HEADER]: "starting" })
      else res.destroy()
    })
    req.pipe(upstream)
  })

  async function control(req: IncomingMessage, res: ServerResponse) {
    const path = req.url ?? ""
    if (req.method === "GET" && path === "/_agent/status")
      return reply(res, 200, { generation: agent.generation, state: agent.state, warm: agent.warm })
    if (req.method !== "POST") return reply(res, 404, { message: "Inconnu." })
    const body = await readJson(req, PREVIEW_LIMITS.requestBytes)
    if (path === "/_agent/assign") {
      const next = (body as { generation?: unknown } | null)?.generation
      if (typeof next !== "string") throw new Refused("Génération invalide.")
      await agent.assign(next)
      return reply(res, 200, { generation: agent.generation, state: agent.state })
    }
    if (path === "/_agent/recycle") {
      const outcome = await agent.recycle()
      reply(res, 200, { state: outcome === "exit" ? "recycling" : "fresh" })
      // Le conteneur repart neuf (Docker, `restart: always`) ; la passerelle attend l'état `fresh`.
      if (outcome === "exit") res.once("finish", () => setTimeout(() => process.exit(0), 50))
      return
    }
    if (path === "/_agent/files") {
      const files = parseFiles(body)
      await agent.files(
        files.generation,
        files.writes.map((write) => ({
          path: write.path,
          content: Buffer.from(write.content, write.encoding === "base64" ? "base64" : "utf8"),
        })),
        files.deletes,
      )
      return reply(res, 200, { generation: agent.generation })
    }
    if (path === "/_agent/start") {
      const current = (body as { generation?: unknown } | null)?.generation
      if (typeof current !== "string") throw new Refused("Génération invalide.")
      await agent.start(current)
      return reply(res, 200, { generation: agent.generation, state: agent.state })
    }
    return reply(res, 404, { message: "Inconnu." })
  }

  // Rechargement en direct de Vite : même exigence de génération, puis le flux passe tel quel.
  server.on("upgrade", (req, socket, head) => {
    if (!agent.generation || req.headers[GENERATION_HEADER] !== agent.generation || agent.state !== "ready")
      return socket.destroy()
    const upstream = connect(astroPort, "127.0.0.1", () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
      for (let i = 0; i < req.rawHeaders.length; i += 2)
        if (req.rawHeaders[i]!.toLowerCase() !== GENERATION_HEADER)
          lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`)
      if (head.length) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    upstream.on("error", () => socket.destroy())
    socket.on("error", () => upstream.destroy())
  })
  return server
}

// --- Lancement ------------------------------------------------------------------------------

function optionsFromEnv(env: NodeJS.ProcessEnv): AgentOptions {
  const production = env.NODE_ENV === "production"
  const number = (name: string) => (env[name] ? Number(env[name]) : null)
  const astroUid = number("PREVIEW_ASTRO_UID")
  const gateUid = number("PREVIEW_GATE_UID")
  const slotDir = resolve(env.PREVIEW_SLOT_DIR ?? join(PACKAGE_DIR, ".preview", "slot-0"))
  const socket = env.PREVIEW_AGENT_SOCKET ?? ""
  // En production, aucun repli : sans uid séparé ni socket, l'isolement ne tient plus.
  if (production) {
    const missing = [
      astroUid === null && "PREVIEW_ASTRO_UID",
      gateUid === null && "PREVIEW_GATE_UID",
      !socket && "PREVIEW_AGENT_SOCKET",
      process.getuid?.() !== 0 && "uid 0 (l'agent change d'uid pour lancer Astro)",
    ].filter(Boolean)
    if (missing.length) throw new Error(`Agent d'aperçu : isolement incomplet (${missing.join(", ")}).`)
  }
  if (!socket) throw new Error("PREVIEW_AGENT_SOCKET manque.")
  if (relative(PACKAGE_DIR, slotDir).startsWith("..")) throw new Error("PREVIEW_SLOT_DIR doit être dans le paquet.")
  const publicUrl = new URL(env.PREVIEW_PUBLIC_URL ?? "http://localhost:4400")
  return {
    slotDir,
    socket,
    astroUid,
    gateUid,
    astroPort: Number(env.PREVIEW_ASTRO_PORT ?? 4321),
    heapMb: Number(env.PREVIEW_ASTRO_HEAP_MB ?? 448),
    // Retour arrière sans redéploiement du code : `PREVIEW_PREWARM=0` dans compose.yaml.
    prewarm: env.PREVIEW_PREWARM !== "0",
    parentOrigin: new URL(env.PREVIEW_PARENT_ORIGIN ?? "http://localhost:3400").origin,
    hmrPort: publicUrl.port || (publicUrl.protocol === "https:" ? "443" : "80"),
  }
}

export function startAgent(options: AgentOptions = optionsFromEnv(process.env)) {
  emptyDir(options.slotDir)
  const agent = createAgent(options)
  const server = agentServer(agent, options.astroPort)
  if (!options.socket.startsWith("\\\\")) {
    mkdirSync(dirname(options.socket), { recursive: true })
    if (existsSync(options.socket)) rmSync(options.socket, { force: true })
  }
  server.listen(options.socket, () => {
    if (!options.socket.startsWith("\\\\")) {
      // Seule la passerelle s'y connecte : ni Astro (autre uid) ni un autre emplacement.
      if (options.gateUid !== null) chownSync(options.socket, options.gateUid, options.gateUid)
      chmodSync(options.socket, 0o600)
    }
    ;(options.log ?? console.warn)(`[emplacement] à l'écoute`)
  })
  const stop = () => void agent.stop().finally(() => process.exit(0))
  process.on("SIGINT", stop)
  process.on("SIGTERM", stop)
  return { agent, server }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startAgent()
