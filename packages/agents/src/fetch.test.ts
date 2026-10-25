import { describe, expect, test } from "vitest"

import { linksFooter, withMarkdown } from "./fetch"
import { HGDC_TRUST_PAGES, productJsonLd } from "./hgdc"

const PAGE = "<html><head><title>Mail</title></head><body><main><h1>Mail</h1><p>Tes e-mails.</p></main></body></html>"

/** Handler qui imite TanStack Start : 406 sans text/html ni *\/*. */
function app(status = 200, body = PAGE, type = "text/html; charset=utf-8", extra: Record<string, string> = {}) {
  const seen: Request[] = []
  const handler = async (request: Request) => {
    seen.push(request)
    if (!/(^|,)\s*(\*\/\*|text\/html)/.test(request.headers.get("accept") ?? "*/*"))
      return Response.json({ error: "Only HTML requests are supported here" }, { status: 406 })
    return new Response(request.method === "HEAD" ? null : body, {
      status,
      headers: { "content-type": type, etag: '"h"', ...extra },
    })
  }
  return { handler, seen }
}

const get = (accept: string, method = "GET") =>
  new Request("https://app.hgdc.ch/mail/", { method, headers: { accept } })

describe("withMarkdown", () => {
  test("un agent reçoit la page en Markdown, plus jamais 406", async () => {
    const { handler, seen } = app(200, PAGE, "text/html; charset=utf-8", {
      "set-cookie": "s=1",
      vary: "Accept-Encoding",
    })
    const response = await withMarkdown(handler, {
      footer: linksFooter([{ label: "Résumé pour les agents", href: "https://hgdc.ch/llms.txt" }]),
    })(get("text/markdown"))
    expect(seen[0]!.headers.get("accept")).toBe("text/html")
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(response.headers.get("vary")).toBe("Accept-Encoding, Accept, User-Agent")
    expect(response.headers.get("etag")).toBeNull()
    expect(response.headers.get("set-cookie")).toBe("s=1")
    expect(await response.text()).toBe(
      '---\ntitle: "Mail"\n---\n\n# Mail\n\nTes e-mails.\n\n---\n\n[Résumé pour les agents](https://hgdc.ch/llms.txt)\n',
    )
  })

  test("le statut est gardé : une page introuvable reste 404", async () => {
    const response = await withMarkdown(app(404, "<main><h1>Page introuvable</h1></main>").handler)(
      get("text/markdown"),
    )
    expect(response.status).toBe(404)
    expect(await response.text()).toBe("# Page introuvable\n")
  })

  test("un navigateur reçoit le HTML inchangé, avec Vary: Accept", async () => {
    const { handler, seen } = app()
    const response = await withMarkdown(handler)(get("text/html,*/*;q=0.8"))
    expect(seen[0]!.headers.get("accept")).toBe("text/html,*/*;q=0.8")
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(response.headers.get("vary")).toBe("Accept, User-Agent")
    expect(await response.text()).toBe(PAGE)
  })

  test("redirection, JSON et écriture passent sans conversion", async () => {
    const redirect = async () =>
      new Response(null, { status: 307, headers: { location: "/mail/sign-in", "content-type": "text/html" } })
    const moved = await withMarkdown(redirect)(get("text/markdown"))
    expect(moved.status).toBe(307)
    expect(moved.headers.get("location")).toBe("/mail/sign-in")
    expect(moved.headers.get("vary")).toBe("Accept, User-Agent")

    const json = await withMarkdown(app(200, "{}", "application/json").handler)(get("text/markdown"))
    expect(json.headers.get("content-type")).toBe("application/json")

    const { handler, seen } = app()
    const post = new Request("https://app.hgdc.ch/mail/_serverFn/x", {
      method: "POST",
      headers: { accept: "text/markdown" },
      body: "{}",
    })
    expect((await withMarkdown(handler)(post)).status).toBe(406)
    expect(seen[0]!.headers.get("accept")).toBe("text/markdown")
  })

  test("accepte un Request qui n'est pas celui de la plateforme (srvx de Nitro)", async () => {
    const { handler, seen } = app()
    const foreign = {
      url: "https://app.hgdc.ch/mail/",
      method: "GET",
      headers: new Headers({ accept: "text/markdown" }),
      signal: new AbortController().signal,
    }
    const response = await withMarkdown(handler)(foreign as unknown as Request)
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(seen[0]!.url).toBe("https://app.hgdc.ch/mail/")
  })

  test("HEAD : en-têtes du Markdown, sans corps", async () => {
    const { handler, seen } = app()
    const response = await withMarkdown(handler)(get("text/markdown", "HEAD"))
    expect(seen[0]!.method).toBe("GET")
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(await response.text()).toBe("")
  })

  test("pages de confiance : 301 vers hgdc.ch, barre finale comprise, en lecture seulement", async () => {
    const { handler, seen } = app()
    const wrapped = withMarkdown(handler, { redirects: HGDC_TRUST_PAGES })
    for (const path of ["/about", "/about/"]) {
      const response = await wrapped(new Request(`https://status.hgdc.ch${path}`))
      expect(response.status).toBe(301)
      expect(response.headers.get("location")).toBe("https://hgdc.ch/a-propos")
    }
    expect((await wrapped(new Request("https://status.hgdc.ch/aboutx"))).status).toBe(200)
    expect(seen).toHaveLength(1)
  })

  test("JSON-LD et adresse canonique posés dans le <head>, sauf s'ils y sont déjà", async () => {
    const jsonLd = productJsonLd({ name: "Status", url: "https://status.hgdc.ch", description: "Surveillance." })
    const options = { jsonLd, canonicalOrigin: "https://status.hgdc.ch" }
    const page = "<html><head><title>x</title></head><body><main><h1>x</h1></main></body></html>"
    const html = await (await withMarkdown(app(200, page).handler, options)(get("text/html"))).text()
    expect(html).toContain('<script type="application/ld+json">{"@context":"https://schema.org"')
    expect(html).toContain('<link rel="canonical" href="https://status.hgdc.ch/mail/"></head>')
    expect(html.match(/<\/head>/g)).toHaveLength(1)
    const already =
      '<html><head><link rel="canonical" href="/x"><script type="application/ld+json">{}</script></head><body></body></html>'
    expect(await (await withMarkdown(app(200, already).handler, options)(get("text/html"))).text()).toBe(already)
    const missing = await (await withMarkdown(app(404, page).handler, options)(get("text/html"))).text()
    expect(missing).not.toContain("canonical")
  })

  test("<head> coupé entre deux morceaux du flux", async () => {
    const chunks = ["<html><he", "ad><title>x</title></he", "ad><body>corps</body></html>"]
    const handler = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const c of chunks) controller.enqueue(new TextEncoder().encode(c))
            controller.close()
          },
        }),
        { headers: { "content-type": "text/html" } },
      )
    const html = await (await withMarkdown(handler, { jsonLd: { a: "</script>" } })(get("text/html"))).text()
    expect(html).toBe(
      '<html><head><title>x</title><script type="application/ld+json">{"a":"\\u003c/script>"}</script></head><body>corps</body></html>',
    )
  })

  test("API : une page introuvable sous le préfixe devient une erreur JSON (RFC 9457)", async () => {
    const wrapped = withMarkdown(app(404).handler, {
      apiPrefix: "/api",
      apiHint: "Voir https://status.hgdc.ch/llms.txt",
    })
    const response = await wrapped(new Request("https://status.hgdc.ch/api/nope", { headers: { accept: "*/*" } }))
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toBe("application/problem+json")
    expect(await response.json()).toMatchObject({
      status: 404,
      code: "not_found",
      hint: "Voir https://status.hgdc.ch/llms.txt",
    })
    expect((await wrapped(new Request("https://status.hgdc.ch/apix"))).headers.get("content-type")).toMatch(
      /^text\/html/,
    )
  })

  test("transmet les arguments suivants du handler", async () => {
    const handler = async (_request: Request, env: { name: string }) =>
      new Response(env.name, { headers: { "content-type": "text/plain" } })
    expect(await (await withMarkdown(handler)(get("*/*"), { name: "edge" })).text()).toBe("edge")
  })

  test("robot d'IA connu et ?mode=agent : Markdown même avec Accept: text/html", async () => {
    const { handler } = app()
    const wrapped = withMarkdown(handler)
    const bot = await wrapped(
      new Request("https://app.hgdc.ch/mail/", {
        headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (compatible; ClaudeBot/1.0)" },
      }),
    )
    expect(bot.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    const mode = await wrapped(
      new Request("https://app.hgdc.ch/mail/?mode=agent", { headers: { accept: "text/html" } }),
    )
    expect(await mode.text()).toContain("# Mail")
    const google = await wrapped(
      new Request("https://app.hgdc.ch/mail/", { headers: { accept: "text/html", "user-agent": "Googlebot/2.1" } }),
    )
    expect(google.headers.get("content-type")).toMatch(/^text\/html/)
  })

  test("suffixe .md : jumeau Markdown de la page, sauf si l'app sert ce fichier", async () => {
    const paths: string[] = []
    const handler = async (request: Request) => {
      const path = new URL(request.url).pathname
      paths.push(path)
      if (path === "/notes.md") return new Response("# Notes", { headers: { "content-type": "text/markdown" } })
      if (!["/", "/mail/", "/tarifs"].includes(path))
        return new Response(PAGE, { status: 404, headers: { "content-type": "text/html" } })
      return new Response(PAGE, { headers: { "content-type": "text/html" } })
    }
    const wrapped = withMarkdown(handler, { canonicalOrigin: "https://app.hgdc.ch" })
    const home = await wrapped(new Request("https://app.hgdc.ch/index.md", { headers: { accept: "*/*" } }))
    expect(home.status).toBe(200)
    expect(home.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(await home.text()).toContain('canonical: "https://app.hgdc.ch/"')
    expect((await wrapped(new Request("https://app.hgdc.ch/mail/index.md"))).status).toBe(200)
    expect((await wrapped(new Request("https://app.hgdc.ch/tarifs.md"))).headers.get("link")).toContain(
      '</tarifs>; rel="alternate"; type="text/html"',
    )
    expect(await (await wrapped(new Request("https://app.hgdc.ch/notes.md"))).text()).toBe("# Notes")
    const missing = await wrapped(new Request("https://app.hgdc.ch/absent.md"))
    expect(missing.status).toBe(404)
    expect(missing.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(paths).toContain("/absent")
  })

  test("en-tête Link : alternative Markdown et liens des options, sur les pages en 200 seulement", async () => {
    const wrapped = withMarkdown(app().handler, { links: ['</llms.txt>; rel="describedby"'] })
    const page = await wrapped(get("text/html"))
    expect(page.headers.get("link")).toBe(
      '</mail/index.md>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"',
    )
    const missing = await withMarkdown(app(404).handler, { links: ["</llms.txt>"] })(get("text/html"))
    expect(missing.headers.get("link")).toBeNull()
  })

  test("catalogue d'API (RFC 9727) et documents Markdown servis tels quels", async () => {
    const { handler, seen } = app()
    const wrapped = withMarkdown(handler, {
      apiCatalog: [
        {
          anchor: "https://status.hgdc.ch/",
          "service-desc": [{ href: "https://status.hgdc.ch/openapi.json", type: "application/openapi+json" }],
        },
      ],
      markdownFiles: { "/auth.md": "# Accès\n" },
    })
    const catalog = await wrapped(new Request("https://status.hgdc.ch/.well-known/api-catalog"))
    expect(catalog.headers.get("content-type")).toBe(
      'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
    )
    expect(catalog.headers.get("link")).toBe('</.well-known/api-catalog>; rel="api-catalog"')
    expect((await catalog.json()).linkset[0].anchor).toBe("https://status.hgdc.ch/")
    const head = await wrapped(new Request("https://status.hgdc.ch/.well-known/api-catalog", { method: "HEAD" }))
    expect(head.body).toBeNull()
    const auth = await wrapped(new Request("https://status.hgdc.ch/auth.md"))
    expect(auth.headers.get("content-type")).toBe("text/markdown; charset=utf-8")
    expect(await auth.text()).toBe("# Accès\n")
    expect(seen).toHaveLength(0)
  })
})
