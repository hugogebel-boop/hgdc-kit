import { describe, expect, it } from "vitest"

import { auditDemoGuards, guardCallPattern, listPublicWrites } from "./demo-testing"

/** Forme d'une fonction enregistrée par Convex (`mutation({ handler })`). */
function registered(kind: "mutation" | "action" | "query", handler: (...args: never[]) => unknown, isPublic = true) {
  return Object.assign(() => undefined, {
    isPublic,
    isMutation: kind === "mutation",
    isAction: kind === "action",
    isQuery: kind === "query",
    _handler: handler,
  })
}

declare function refuseDemo(id: string): void
declare function requireTeam(ctx: unknown, id: string): Promise<void>
declare const internal: { teams: { current: unknown } }
declare const ctx: { runQuery: (ref: unknown, args: unknown) => Promise<void> }

const modules = {
  "./teams.ts": async () => ({
    rename: registered("mutation", (id: string) => refuseDemo(id)),
    archive: registered("mutation", async (id: string) => await requireTeam(null, id)),
    leak: registered("mutation", () => "écrit sans garde"),
    list: registered("query", () => []),
    hidden: registered("mutation", () => "interne", false),
    helper: 42,
  }),
  "./forms/consent.tsx": {
    confirm: registered("action", () => "lien secret"),
    send: registered("action", async () => await ctx.runQuery(internal.teams.current, {})),
  },
  "./teams.test.ts": async () => ({ bad: registered("mutation", () => "ignoré") }),
  "./_generated/api.ts": async () => ({ bad: registered("mutation", () => "ignoré") }),
  "./convex.config.ts": async () => ({ bad: registered("mutation", () => "ignoré") }),
}

describe("listPublicWrites", () => {
  it("énumère les seules mutations et actions publiques, modules paresseux ou chargés", async () => {
    const names = (await listPublicWrites(modules)).map((w) => w.name)
    expect(names).toEqual([
      "forms/consent:confirm",
      "forms/consent:send",
      "teams:archive",
      "teams:leak",
      "teams:rename",
    ])
  })
})

describe("guardCallPattern", () => {
  const pattern = guardCallPattern(["refuseDemo", "internal.teams.current"])

  it("reconnaît un appel, un appel compilé et une référence passée à ctx.run*", () => {
    expect(pattern.test("refuseDemo(id)")).toBe(true)
    expect(pattern.test("(0, refuseDemo)(id)")).toBe(true)
    expect(pattern.test("ctx.runQuery(internal.teams.current, {})")).toBe(true)
  })

  it("ne prend ni un nom plus long, ni un point comme joker, ni une simple mention", () => {
    expect(pattern.test("refuseDemoLater(id)")).toBe(false)
    expect(pattern.test("internalXteams.current(")).toBe(false)
    expect(pattern.test("// refuseDemo est appelée ailleurs")).toBe(false)
  })

  it("refuse une liste vide", () => {
    expect(() => guardCallPattern([])).toThrow("aucune garde")
  })
})

describe("auditDemoGuards", () => {
  const guards = ["refuseDemo", "requireTeam", "internal.teams.current"]

  it("rend les fonctions sans garde ni exception", async () => {
    const audit = await auditDemoGuards({ modules, guards, allowed: {} })
    expect(audit.unguarded).toEqual(["forms/consent:confirm", "teams:leak"])
    expect(audit.staleAllowed).toEqual([])
  })

  it("accepte une exception commentée, jamais une raison vide", async () => {
    const audit = await auditDemoGuards({
      modules,
      guards,
      allowed: { "forms/consent:confirm": "lien secret, la démo n'en a aucun", "teams:leak": "  " },
    })
    expect(audit.unguarded).toEqual(["teams:leak"])
  })

  it("rend les exceptions qui nomment une fonction disparue ou non publique", async () => {
    const audit = await auditDemoGuards({
      modules,
      guards,
      allowed: { "teams:gone": "supprimée", "teams:hidden": "interne", "teams:list": "query" },
    })
    expect(audit.staleAllowed).toEqual(["teams:gone", "teams:hidden", "teams:list"])
  })

  it("laisse le produit choisir sa lecture", async () => {
    const audit = await auditDemoGuards({
      modules,
      guards,
      allowed: {},
      isGuarded: (write, pattern) =>
        write.exportName !== "leak" && (write.path.endsWith(".tsx") || pattern.test(write.handler)),
    })
    expect(audit.unguarded).toEqual(["teams:leak"])
  })

  it("une garde retirée fait échouer l'audit", async () => {
    const audit = await auditDemoGuards({ modules, guards: ["refuseDemo"], allowed: {} })
    expect(audit.unguarded).toContain("teams:archive")
    expect(audit.unguarded).toContain("forms/consent:send")
  })
})
