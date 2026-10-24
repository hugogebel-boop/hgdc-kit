import { describe, expect, test } from "vitest"

import { linksFooter, withMarkdown } from "./fetch"

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
    expect(response.headers.get("vary")).toBe("Accept-Encoding, Accept")
    expect(response.headers.get("etag")).toBeNull()
    expect(response.headers.get("set-cookie")).toBe("s=1")
    expect(await response.text()).toBe(
      "# Mail\n\nTes e-mails.\n\n---\n\n[Résumé pour les agents](https://hgdc.ch/llms.txt)\n",
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
    expect(response.headers.get("vary")).toBe("Accept")
    expect(await response.text()).toBe(PAGE)
  })

  test("redirection, JSON et écriture passent sans conversion", async () => {
    const redirect = async () =>
      new Response(null, { status: 307, headers: { location: "/mail/sign-in", "content-type": "text/html" } })
    const moved = await withMarkdown(redirect)(get("text/markdown"))
    expect(moved.status).toBe(307)
    expect(moved.headers.get("location")).toBe("/mail/sign-in")
    expect(moved.headers.get("vary")).toBe("Accept")

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

  test("transmet les arguments suivants du handler", async () => {
    const handler = async (_request: Request, env: { name: string }) =>
      new Response(env.name, { headers: { "content-type": "text/plain" } })
    expect(await (await withMarkdown(handler)(get("*/*"), { name: "edge" })).text()).toBe("edge")
  })
})
