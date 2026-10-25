import { describe, expect, test } from "vitest"

import { appendLinks, isAgentUserAgent, markdownTwin, pageOfTwin } from "./discovery"

describe("découverte", () => {
  test("robots d'IA reconnus, moteurs de recherche et navigateurs exclus", () => {
    for (const ua of [
      "GPTBot/1.1",
      "ChatGPT-User/1.0",
      "Claude-User/1.0",
      "Mozilla/5.0 (compatible; PerplexityBot/1.0)",
    ])
      expect(isAgentUserAgent(ua), ua).toBe(true)
    for (const ua of ["Googlebot/2.1", "Mozilla/5.0 (Windows NT 10.0) Chrome/140", "", null])
      expect(isAgentUserAgent(ua), String(ua)).toBe(false)
  })

  test("jumeau Markdown d'une page, et retour", () => {
    const pairs: [string, string][] = [
      ["/", "/index.md"],
      ["/mail/", "/mail/index.md"],
      ["/tarifs", "/tarifs.md"],
    ]
    for (const [page, twin] of pairs) {
      expect(markdownTwin(page)).toBe(twin)
      expect(pageOfTwin(twin)).toBe(page)
    }
    expect(pageOfTwin("/tarifs")).toBeNull()
  })

  test("Link : ajout sans doublon", () => {
    const headers = new Headers({ link: '</a>; rel="x"' })
    appendLinks(headers, ['</a>; rel="x"', '</b>; rel="y"'])
    expect(headers.get("link")).toBe('</a>; rel="x", </b>; rel="y"')
  })
})
