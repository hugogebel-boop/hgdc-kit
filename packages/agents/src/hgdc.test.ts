import { expect, test } from "vitest"

import { HGDC_DISCOVERY_FILES, HGDC_ORGANIZATION, HGDC_TRUST_PAGES, productJsonLd } from "./hgdc"

test("pages de confiance et fichiers de découverte : toujours sur hgdc.ch", () => {
  for (const target of [...Object.values(HGDC_TRUST_PAGES), ...Object.values(HGDC_DISCOVERY_FILES)])
    expect(target).toMatch(/^https:\/\/hgdc\.ch\//)
  expect(Object.keys(HGDC_DISCOVERY_FILES)).toEqual(["/.well-known/ard.json", "/.well-known/agent-skills/index.json"])
})

test("l'entreprise : contact, adresse et profils publics", () => {
  expect(HGDC_ORGANIZATION.contactPoint.email).toBe("contact@hgdc.ch")
  expect(HGDC_ORGANIZATION.address.postalCode).toBe("1135")
  expect(HGDC_ORGANIZATION.sameAs.length).toBeGreaterThan(0)
})

test("productJsonLd : l'entreprise, le site et le logiciel, reliés à l'entreprise", () => {
  const { "@graph": graph } = productJsonLd({
    name: "Status",
    url: "https://status.hgdc.ch",
    description: "Surveillance.",
  })
  expect(graph.map((n) => n["@type"])).toEqual(["Organization", "WebSite", "SoftwareApplication"])
  for (const node of graph.slice(1)) expect(node.publisher).toEqual({ "@id": "https://hgdc.ch/#organization" })
  expect(graph[2]).toMatchObject({
    name: "Status",
    url: "https://status.hgdc.ch",
    applicationCategory: "BusinessApplication",
  })
})
