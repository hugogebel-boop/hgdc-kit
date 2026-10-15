import { describe, expect, it } from "vitest"

import {
  cleanRecord,
  dnsInstructions,
  evaluateDomain,
  hasRecord,
  isApex,
  isWithinAny,
  normalizeHostname,
  registrableDomain,
  relativeName,
  resolve,
  sameAddresses,
  sameRecord,
  verificationName,
  verificationToken,
} from "./index.ts"

describe("normalizeHostname", () => {
  it.each([
    ["status.exemple.ch", "status.exemple.ch"],
    ["  Status.Exemple.CH. ", "status.exemple.ch"],
    ["https://status.exemple.ch/page?x=1", "status.exemple.ch"],
    ["http://status.exemple.ch:8080", "status.exemple.ch"],
    ["xn--bcher-kva.ch", "xn--bcher-kva.ch"],
  ])("%s donne %s", (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected)
  })

  it.each(["", "localhost", "exemple", "-a.exemple.ch", "a-.exemple.ch", "a..ch", "a b.ch", "*.exemple.ch", "1.2.3.4"])(
    "refuse %j",
    (input) => {
      expect(normalizeHostname(input)).toBeNull()
    },
  )

  it("refuse une étiquette de plus de 63 caractères", () => {
    expect(normalizeHostname(`${"a".repeat(64)}.ch`)).toBeNull()
    expect(normalizeHostname(`${"a".repeat(63)}.ch`)).toBe(`${"a".repeat(63)}.ch`)
  })
})

describe("domaine racine ou sous-domaine", () => {
  it("reconnaît le domaine enregistrable", () => {
    expect(registrableDomain("status.exemple.ch")).toBe("exemple.ch")
    expect(registrableDomain("a.b.exemple.ch")).toBe("exemple.ch")
    expect(registrableDomain("status.exemple.co.uk")).toBe("exemple.co.uk")
  })

  it("distingue racine et sous-domaine", () => {
    expect(isApex("exemple.ch")).toBe(true)
    expect(isApex("exemple.co.uk")).toBe(true)
    expect(isApex("status.exemple.ch")).toBe(false)
    expect(isApex("www.exemple.co.uk")).toBe(false)
  })

  it("protège les zones de la plateforme", () => {
    const zones = ["hgdc.ch", "vercel.app"]
    expect(isWithinAny("status.hgdc.ch", zones)).toBe(true)
    expect(isWithinAny("hgdc.ch", zones)).toBe(true)
    expect(isWithinAny("projet.vercel.app", zones)).toBe(true)
    expect(isWithinAny("nothgdc.ch", zones)).toBe(false)
    expect(isWithinAny("hgdc.ch.exemple.ch", zones)).toBe(false)
  })

  it("donne le nom relatif à saisir chez le fournisseur", () => {
    expect(relativeName("status.exemple.ch")).toBe("status")
    expect(relativeName("exemple.ch")).toBe("@")
    expect(relativeName("_hgdc-status.status.exemple.ch", "status.exemple.ch")).toBe("_hgdc-status.status")
    expect(relativeName("_x.www.exemple.co.uk", "www.exemple.co.uk")).toBe("_x.www")
  })
})

describe("preuve TXT", () => {
  it("nomme et génère la preuve", () => {
    expect(verificationName("hgdc-status", "status.exemple.ch")).toBe("_hgdc-status.status.exemple.ch")
    expect(verificationToken("hgdc-status", () => "AB-CD-ef")).toBe("hgdc-status-verify=abcdef")
    expect(verificationToken("hgdc-status")).toMatch(/^hgdc-status-verify=[0-9a-f]{32}$/)
  })
})

describe("comparaison d'enregistrements", () => {
  it("nettoie les valeurs", () => {
    expect(cleanRecord('"abc" "def"')).toBe("abcdef")
    expect(cleanRecord("Cname.Vercel-DNS.com.")).toBe("cname.vercel-dns.com")
    expect(sameRecord("cname.vercel-dns.com.", "CNAME.vercel-dns.com")).toBe(true)
  })

  it("cherche une valeur parmi les réponses", () => {
    expect(hasRecord(["a", "hgdc-status-verify=x"], '"HGDC-status-verify=x"')).toBe(true)
    expect(hasRecord([], "x")).toBe(false)
    expect(hasRecord(null, "x")).toBe(false)
  })

  it("compare les adresses d'un domaine racine", () => {
    expect(sameAddresses(["76.76.21.21"], ["76.76.21.21", "76.76.21.22"])).toBe(true)
    expect(sameAddresses(["76.76.21.21", "1.1.1.1"], ["76.76.21.21"])).toBe(false)
    expect(sameAddresses([], ["76.76.21.21"])).toBe(false)
    expect(sameAddresses(null, ["76.76.21.21"])).toBe(false)
  })
})

describe("evaluateDomain", () => {
  const expected = { token: "t=1", cnameTarget: "abc.vercel-dns-017.com", cnameAlternatives: ["cname.vercel-dns.com"] }

  it("ne conclut rien sans réponse", () => {
    expect(evaluateDomain({ txt: null, cname: [] }, expected)).toEqual({ conclusive: false })
    expect(evaluateDomain({ txt: [], cname: null }, expected)).toEqual({ conclusive: false })
  })

  it("prouve la propriété et le pointage", () => {
    expect(evaluateDomain({ txt: ["t=1"], cname: ["abc.vercel-dns-017.com."] }, expected)).toEqual({
      conclusive: true,
      owned: true,
      pointing: true,
    })
    expect(evaluateDomain({ txt: ["t=1"], cname: ["cname.vercel-dns.com"] }, expected)).toMatchObject({
      pointing: true,
    })
  })

  it("voit un domaine qui ne pointe plus", () => {
    expect(evaluateDomain({ txt: ["t=1"], cname: ["autre.exemple.net"] }, expected)).toEqual({
      conclusive: true,
      owned: true,
      pointing: false,
    })
    expect(evaluateDomain({ txt: [], cname: [] }, expected)).toEqual({
      conclusive: true,
      owned: false,
      pointing: false,
    })
  })

  it("accepte un domaine racine par ses adresses", () => {
    expect(
      evaluateDomain(
        { txt: ["t=1"], cname: [], addresses: ["76.76.21.21"] },
        { token: "t=1", addresses: ["76.76.21.21"] },
      ),
    ).toMatchObject({ owned: true, pointing: true })
  })
})

describe("dnsInstructions", () => {
  it("liste la preuve puis le CNAME d'un sous-domaine", () => {
    const rows = dnsInstructions({
      hostname: "status.exemple.ch",
      cnameTarget: "ABC.vercel-dns-017.com.",
      verification: { name: "_hgdc-status.status.exemple.ch", value: "hgdc-status-verify=x" },
      checks: { owned: true, pointing: false },
    })
    expect(rows).toEqual([
      {
        id: "verification",
        type: "TXT",
        name: "_hgdc-status.status",
        fqdn: "_hgdc-status.status.exemple.ch",
        value: "hgdc-status-verify=x",
        status: "verified",
      },
      {
        id: "pointing",
        type: "CNAME",
        name: "status",
        fqdn: "status.exemple.ch",
        value: "abc.vercel-dns-017.com",
        status: "pending",
      },
    ])
  })

  it("ajoute les TXT supplémentaires et marque les lignes jamais contrôlées", () => {
    const rows = dnsInstructions({
      hostname: "status.exemple.ch",
      cnameTarget: "cname.vercel-dns.com",
      extra: [{ name: "_vercel.exemple.ch", value: "vc-domain-verify=status.exemple.ch,1" }],
    })
    expect(rows.map((r) => [r.type, r.name, r.status])).toEqual([
      ["TXT", "_vercel", "not_started"],
      ["CNAME", "status", "not_started"],
    ])
  })

  it("pointe un domaine racine par A, ou pas du tout sans adresse", () => {
    expect(dnsInstructions({ hostname: "exemple.ch", address: "76.76.21.21" })).toMatchObject([
      { type: "A", name: "@", value: "76.76.21.21" },
    ])
    expect(dnsInstructions({ hostname: "exemple.ch", cnameTarget: "cname.vercel-dns.com" })).toEqual([])
  })
})

describe("resolve", () => {
  const answer = (body: unknown, ok = true) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: ok ? 200 : 500 }))

  it("réunit les réponses des résolveurs et écarte les autres types", async () => {
    const calls: string[] = []
    const fetch = ((url: string) => {
      calls.push(url)
      return url.startsWith("https://a")
        ? answer({
            Status: 0,
            Answer: [
              { type: 5, data: "alias.exemple.ch." },
              { type: 16, data: '"v=1"' },
            ],
          })
        : answer({ Status: 0, Answer: [{ type: 16, data: '"v=2"' }] })
    }) as unknown as typeof globalThis.fetch
    const found = await resolve("_x.exemple.ch", "TXT", { fetch, resolvers: ["https://a/q", "https://b/q"] })
    expect(found).toEqual(["v=1", "v=2"])
    expect(calls[0]).toBe("https://a/q?name=_x.exemple.ch&type=TXT")
  })

  it("rend une liste vide quand le nom n'existe pas", async () => {
    const fetch = (() => answer({ Status: 3 })) as unknown as typeof globalThis.fetch
    expect(await resolve("absent.exemple.ch", "CNAME", { fetch, resolvers: ["https://a/q"] })).toEqual([])
  })

  it("rend null quand aucun résolveur ne répond", async () => {
    const fetch = ((url: string) =>
      url.startsWith("https://a") ? answer({}, false) : answer({ Status: 2 })) as unknown as typeof globalThis.fetch
    expect(await resolve("x.exemple.ch", "TXT", { fetch, resolvers: ["https://a/q", "https://b/q"] })).toBeNull()
    const failing = (() => Promise.reject(new Error("réseau"))) as unknown as typeof globalThis.fetch
    expect(await resolve("x.exemple.ch", "TXT", { fetch: failing, resolvers: ["https://a/q"] })).toBeNull()
  })
})
