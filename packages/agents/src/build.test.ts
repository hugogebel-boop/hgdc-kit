import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

import { describe, expect, test } from "vitest"

import { markdownRoutes, writeMarkdownPages, type MarkdownPage, type Route } from "./build"

async function site(files: Record<string, string>): Promise<URL> {
  const dir = await mkdtemp(join(tmpdir(), "agents-"))
  for (const [name, html] of Object.entries(files)) {
    await mkdir(join(dir, name, ".."), { recursive: true })
    await writeFile(join(dir, name), html)
  }
  return pathToFileURL(`${dir}/`)
}

const page = (title: string) =>
  `<html><body><main><h1>${title}</h1><p><a href="contact">Contact</a></p></main></body></html>`

/** Rejoue les routes comme Host et Vercel : avant le système de fichiers, puis après pour une adresse absente. */
function serve(routes: { before: Route[]; miss: Route[] }, files: Set<string>, path: string, accept: string) {
  const headers: Record<string, string> = {}
  let status = 200
  const phase = (list: Route[], current: string) => {
    for (const route of list) {
      const m = new RegExp(route.src).exec(current)
      if (!m || !(route.has ?? []).every((c) => new RegExp(`^(?:${c.value})$`).test(accept))) continue
      const sub = (v: string) => v.replace(/\$(\d)/g, (_, i: string) => m[Number(i)] ?? "")
      for (const [k, v] of Object.entries(route.headers ?? {})) headers[k.toLowerCase()] = sub(v)
      if (route.status) status = route.status
      if (route.dest) return sub(route.dest)
      if (!route.continue) break
    }
    return current
  }
  const rewritten = phase(routes.before, path)
  const key = rewritten === "/" ? "index.html" : rewritten.slice(1)
  if (files.has(key) || files.has(`${key}/index.html`))
    return { status, headers, file: files.has(key) ? key : `${key}/index.html` }
  const file = phase(routes.miss, rewritten).slice(1)
  return { status, headers, file }
}

describe("site à la racine", async () => {
  const dir = await site({
    "index.html": page("Accueil"),
    "contact/index.html": page("Contact"),
    "404.html": page("Introuvable"),
    "a.css": "",
  })
  const pages = await writeMarkdownPages(dir, {
    site: "https://hgdc.ch",
    footer: "[llms.txt](https://hgdc.ch/llms.txt)",
  })
  const routes = markdownRoutes(pages, { site: "https://hgdc.ch" })
  const files = new Set(["index.html", "contact/index.html", "404.html", "a.css", "index.md", "contact.md", "404.md"])

  test("écrit une page Markdown par page HTML, et 404.md", async () => {
    expect(pages).toEqual<MarkdownPage[]>([
      { path: "/contact", file: "contact.md" },
      { path: "/", file: "index.md" },
    ])
    expect(await readFile(new URL("contact.md", dir), "utf-8")).toBe(
      "# Contact\n\n[Contact](https://hgdc.ch/contact)\n\n---\n\n[llms.txt](https://hgdc.ch/llms.txt)\n",
    )
    expect(await readFile(new URL("404.md", dir), "utf-8")).toMatch(/^# Introuvable/)
  })

  test("Markdown sur Accept: text/markdown, HTML sinon, Vary: Accept partout", () => {
    expect(serve(routes, files, "/", "text/markdown")).toMatchObject({
      status: 200,
      file: "index.md",
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        vary: "Accept",
        link: '<https://hgdc.ch/>; rel="canonical"',
      },
    })
    expect(serve(routes, files, "/contact", "text/markdown")).toMatchObject({
      file: "contact.md",
      headers: { link: '<https://hgdc.ch/contact>; rel="canonical"' },
    })
    expect(serve(routes, files, "/contact", "text/html")).toEqual({
      status: 200,
      file: "contact/index.html",
      headers: { vary: "Accept" },
    })
    expect(serve(routes, files, "/contact.md", "*/*")).toMatchObject({
      file: "contact.md",
      headers: { link: '<https://hgdc.ch/contact>; rel="canonical"' },
    })
  })

  test("adresse inconnue : 404.md pour un agent", () => {
    expect(serve(routes, files, "/nope", "text/markdown")).toMatchObject({ status: 404, file: "404.md" })
    expect(serve(routes, files, "/a.css", "text/markdown")).toMatchObject({ status: 200, file: "a.css" })
  })
})

describe("site sous un préfixe", async () => {
  const dir = await site({
    "agence/index.html": page("Agence"),
    "agence/blog/article/index.html": page("Article"),
    "agence/404.html": page("Introuvable"),
  })
  const pages = await writeMarkdownPages(dir, { site: "https://hgdc.ch", base: "/agence" })
  const routes = markdownRoutes(pages, { site: "https://hgdc.ch", base: "/agence" })
  const files = new Set([
    "agence/index.html",
    "agence/blog/article/index.html",
    "agence/index.md",
    "agence/blog/article.md",
    "agence/404.md",
  ])

  test("accueil du préfixe en <base>/index.md, liens relatifs résolus sous le préfixe", async () => {
    expect(pages.map((p) => p.file).sort()).toEqual(["agence/blog/article.md", "agence/index.md"])
    expect(await readFile(new URL("agence/index.md", dir), "utf-8")).toContain("(https://hgdc.ch/contact)")
    expect(serve(routes, files, "/agence", "text/markdown")).toMatchObject({ file: "agence/index.md" })
    expect(serve(routes, files, "/agence/blog/article", "text/markdown")).toMatchObject({
      file: "agence/blog/article.md",
    })
    expect(serve(routes, files, "/agence/nope", "text/markdown")).toMatchObject({ status: 404, file: "agence/404.md" })
  })
})

test("les longues listes de pages se découpent sous la limite de Host", () => {
  const pages = Array.from({ length: 400 }, (_, i) => ({
    path: `/blog/un-article-au-titre-long-${i}`,
    file: `blog/un-article-au-titre-long-${i}.md`,
  }))
  const { before } = markdownRoutes(pages, { site: "https://hgdc.ch" })
  expect(before.length).toBeGreaterThan(3)
  for (const route of before) expect(route.src.length).toBeLessThan(4096)
})
