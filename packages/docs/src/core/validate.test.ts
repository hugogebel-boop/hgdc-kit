// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { BLOCKS, COMPONENT_PROPS, expandSnippet, MDX_COMPONENTS } from "./components.ts"
import { checkPage, checkSite, isPageFile, pageOfFile, readFrontmatter, splitFrontmatter } from "./validate.ts"

const page = (body: string, title = "Accueil") => `---\ntitle: ${title}\n---\n\n${body}\n`

describe("validation d'une page", () => {
  it("une page correcte, composants sans import compris", async () => {
    expect(
      await checkPage("index.mdx", page('<Note>Une note.</Note>\n\n<Steps>\n<Step title="Un">A</Step>\n</Steps>')),
    ).toEqual([])
  })

  it("sans en-tête ou sans titre : refusée, Starlight exige un titre", async () => {
    expect((await checkPage("a.mdx", "# Bonjour\n"))[0]?.message).toMatch(/en-tête/)
    expect((await checkPage("a.mdx", "---\ndescription: x\n---\n\nTexte\n"))[0]?.message).toMatch(/titre/)
    expect((await checkPage("a.mdx", "---\ntitle: [oups\n---\n\nTexte\n"))[0]?.message).toMatch(/illisible/)
  })

  it("balise jamais fermée : message en français, à la bonne ligne du fichier", async () => {
    const problems = await checkPage("a.mdx", page("Texte\n\n<Note>\nUne note"))
    expect(problems).toHaveLength(1)
    expect(problems[0]!.message).toMatch(/<Note> n'est jamais fermée/)
    expect(problems[0]!.line).toBe(7)
  })

  it("accolade de texte non échappée", async () => {
    const problems = await checkPage("a.mdx", page("Un objet { a: 1 "))
    expect(problems[0]?.message).toMatch(/Accolade|accolades/)
  })

  it("composant inconnu : refusé, sauf s'il est importé par la page", async () => {
    const problems = await checkPage("a.mdx", page("<Callout>x</Callout>"))
    expect(problems[0]?.message).toMatch(/<Callout> n'existe pas/)
    expect(problems[0]?.line).toBe(5)
    expect(await checkPage("a.mdx", page('import Callout from "./callout.astro"\n\n<Callout>x</Callout>'))).toEqual([])
    // Une balise HTML en minuscules reste permise.
    expect(await checkPage("a.mdx", page("<div>x</div>"))).toEqual([])
  })

  it("un .md se compile en Markdown : les accolades y sont du texte", async () => {
    expect(await checkPage("a.md", page("Un objet { a: 1 "))).toEqual([])
  })

  it("en-tête lu sans perdre les lignes", () => {
    const source = page("Texte")
    expect(splitFrontmatter(source)).toMatchObject({ raw: "title: Accueil", lines: 3 })
    expect(readFrontmatter(source)).toEqual({ title: "Accueil" })
    expect(readFrontmatter("# rien")).toBeNull()
  })
})

describe("validation de docs.json", () => {
  const json = (navigation: unknown) => JSON.stringify({ name: "Acme", navigation })

  it("pages citées présentes : rien à signaler", () => {
    expect(
      checkSite(json({ pages: ["index", "guides/publier"] }), ["index.mdx", "guides/publier.md", "images/a.png"]),
    ).toEqual([])
  })

  it("page citée absente, JSON invalide, schéma faux", () => {
    expect(checkSite(json({ pages: ["index", "absente"] }), ["index.mdx"])[0]?.message).toMatch(
      /absente\.mdx n'existe pas/,
    )
    expect(checkSite("{", [])[0]?.message).toMatch(/JSON valide/)
    expect(checkSite(JSON.stringify({ navigation: { pages: ["index"] } }), ["index.mdx"])[0]?.message).toMatch(/name/)
  })

  it("chemin de page d'un fichier", () => {
    expect(pageOfFile("guides/publier.mdx")).toBe("guides/publier")
    expect(pageOfFile("images/a.png")).toBeNull()
  })
})

describe("l'exemple livré passe la validation, comme son build", () => {
  const root = fileURLToPath(new URL("../../example/", import.meta.url))
  const files: Array<string> = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else files.push(relative(root, full).replaceAll("\\", "/"))
    }
  }
  walk(root)

  it("docs.json et toutes les pages", async () => {
    expect(checkSite(readFileSync(join(root, "docs.json"), "utf8"), files)).toEqual([])
    for (const file of files.filter((f) => pageOfFile(f)))
      expect(await checkPage(file, readFileSync(join(root, file), "utf8")), file).toEqual([])
  })
})

describe("blocs de l'éditeur", () => {
  it("chaque bloc inséré donne une page valide, et ne cite que des composants du modèle", async () => {
    for (const block of BLOCKS) {
      const { text } = expandSnippet(block.snippet)
      expect(await checkPage("a.mdx", page(text)), block.id).toEqual([])
      for (const name of text.matchAll(/<([A-Z]\w*)/g)) expect(MDX_COMPONENTS, block.id).toContain(name[1])
    }
    expect(Object.keys(COMPONENT_PROPS).sort()).toEqual([...MDX_COMPONENTS].sort())
  })
})

describe("pages et autres fichiers Markdown", () => {
  it("un extrait ou le README n'exige pas de titre, mais doit compiler", async () => {
    expect(isPageFile("guides/publier.mdx")).toBe(true)
    expect(isPageFile("_extrait.mdx")).toBe(false)
    expect(isPageFile("guides/_extrait.mdx")).toBe(false)
    expect(isPageFile("README.md")).toBe(false)
    expect(isPageFile("guides/README.md")).toBe(true)
    expect(await checkPage("_extrait.mdx", "Un extrait sans en-tête.\n")).toEqual([])
    expect(await checkPage("README.md", "# Dépôt\n")).toEqual([])
    expect((await checkPage("_extrait.mdx", "<Note>ouverte\n"))[0]?.message).toMatch(/jamais fermée/)
    expect(pageOfFile("README.md")).toBeNull()
  })
})

describe("messages traduits", () => {
  it("balise fermante collée au texte d'un paragraphe", async () => {
    const problems = await checkPage("a.mdx", page("<Note>\n  Une note\n</Note>Note>"))
    expect(problems[0]?.message).toMatch(/<\/Note> est mal placée/)
  })
})

describe("redirections", () => {
  const site = (redirects: unknown) =>
    JSON.stringify({ name: "A", navigation: { pages: ["index", "guides/nouveau"] }, redirects })
  const files = ["index.mdx", "guides/nouveau.mdx"]

  it("une redirection valide passe ; source qui masque une page, destination absente ou doublon refusés", () => {
    expect(checkSite(site([{ source: "/guides/ancien", destination: "/guides/nouveau/" }]), files)).toEqual([])
    expect(checkSite(site([{ source: "/a", destination: "https://acme.ch/doc" }]), files)).toEqual([])
    const messages = checkSite(
      site([
        { source: "/guides/nouveau", destination: "/" },
        { source: "/b", destination: "/guides/absent" },
        { source: "/b", destination: "/" },
      ]),
      files,
    ).map((p) => p.message)
    expect(messages.join("\n")).toMatch(/masque une page/)
    expect(messages.join("\n")).toMatch(/n'existe pas/)
    expect(messages.join("\n")).toMatch(/Deux redirections/)
    expect(checkSite(site([{ source: "guides", destination: "/" }]), files)[0]?.message).toMatch(/commençant par/)
  })
})
