// @vitest-environment node
import { createHash } from "node:crypto"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import {
  BASE_POLICY,
  connectSources,
  documentPolicy,
  FAMILY_CONNECT_SOURCES,
  KIT_INLINE_SCRIPT_HASHES,
  KIT_INLINE_SCRIPTS,
  newNonce,
} from "./csp"
import { FamilyLoaderRoot } from "./family-loader"

/** Empreinte CSP d'un script en ligne (`'sha256-…'`), comme le navigateur la calcule. */
const hashOf = (source: string) => `sha256-${createHash("sha256").update(source, "utf8").digest("base64")}`

const NONCE = "AAAAAAAAAAAAAAAAAAAAAA=="

describe("politique de sécurité des documents", () => {
  test("chaque script en ligne du paquet a son empreinte, et aucune empreinte n'est orpheline", () => {
    expect(KIT_INLINE_SCRIPTS.map(hashOf).toSorted()).toEqual([...KIT_INLINE_SCRIPT_HASHES].toSorted())
  })

  test("le chargeur ne rend aucun script en ligne hors de la liste", () => {
    const html = renderToStaticMarkup(createElement(FamilyLoaderRoot, null, "page"))
    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? "")
    expect(scripts.map(hashOf).filter((hash) => !KIT_INLINE_SCRIPT_HASHES.includes(hash))).toEqual([])
  })

  test("nonce, empreintes, origines du backend en https et wss, origines de la famille", () => {
    const policy = documentPolicy({
      nonce: NONCE,
      connect: connectSources(["https://convex.exemple.ch/api", "pas une adresse", undefined, "javascript:alert(1)"]),
    })
    expect(policy.startsWith(BASE_POLICY)).toBe(true)
    expect(policy).toContain(`script-src 'self' 'nonce-${NONCE}' '${KIT_INLINE_SCRIPT_HASHES[0]}'`)
    expect(policy).toContain("connect-src 'self' https://convex.exemple.ch wss://convex.exemple.ch")
    for (const source of FAMILY_CONNECT_SOURCES) expect(policy).toContain(source)
    expect(policy).not.toContain("unsafe")
  })

  test("une empreinte propre à l'application s'ajoute, une origine en double n'est écrite qu'une fois", () => {
    const policy = documentPolicy({
      nonce: NONCE,
      connect: ["https://status.hgdc.ch"],
      scriptHashes: ["sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="],
    })
    expect(policy).toContain("'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='")
    expect(policy.split("https://status.hgdc.ch").length).toBe(2)
  })

  test("une valeur qui ajouterait une directive est refusée", () => {
    expect(() => documentPolicy({ nonce: "x'; script-src *", connect: [] })).toThrow("nonce CSP invalide")
    expect(() => documentPolicy({ nonce: NONCE, connect: ["https://a.ch; script-src *"] })).toThrow("source CSP")
    expect(() => documentPolicy({ nonce: NONCE, connect: ["'unsafe-inline'"] })).toThrow("source CSP")
    expect(() => documentPolicy({ nonce: NONCE, connect: [], scriptHashes: ["sha256-x' *"] })).toThrow("empreinte CSP")
  })

  test("un nonce neuf par appel, accepté par la politique", () => {
    const first = newNonce()
    expect(first).not.toBe(newNonce())
    expect(() => documentPolicy({ nonce: first, connect: [] })).not.toThrow()
  })
})
