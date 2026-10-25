import { describe, expect, test } from "vitest"

import { htmlToMarkdown, pageFrontmatter, pageTitle } from "./markdown"

const md = (body: string, base = "https://hgdc.ch/page") =>
  htmlToMarkdown(`<html><body><main>${body}</main></body></html>`, base)

describe("htmlToMarkdown", () => {
  test("titres, paragraphes et liens absolus", () => {
    expect(md('<h1>Titre</h1><p>Un <a href="/contact">lien</a> et <strong>du gras</strong>.</p>')).toBe(
      "# Titre\n\nUn [lien](https://hgdc.ch/contact) et **du gras**.\n",
    )
  })

  test("ne lit que le <main>, sans ce qui est caché ou décoratif", () => {
    const html =
      '<header><p>Menu</p></header><main><h1>T</h1><p>Visible<span aria-hidden="true">→</span></p>' +
      '<p class="visually-hidden">(nouvel onglet)</p><div hidden>Caché</div><svg><text>x</text></svg>' +
      "<script>alert(1)</script><button>Clair</button></main><footer>Pied</footer>"
    expect(htmlToMarkdown(html, "https://hgdc.ch/")).toBe("# T\n\nVisible\n")
  })

  test("sans <main> : le <body>, et le <title> quand la page n'a pas de h1", () => {
    const html =
      "<html><head><title>Connexion · Mail</title></head><body><p>Entre ton e-mail.</p><script>x()</script></body></html>"
    expect(htmlToMarkdown(html, "https://app.hgdc.ch/mail/")).toBe("# Connexion · Mail\n\nEntre ton e-mail.\n")
  })

  test("listes, blocs dans un élément de liste sans espaces en fin de ligne", () => {
    expect(md("<ul><li>Un</li><li>Deux</li></ul><ol><li><h3>A</h3><p>Texte</p></li></ol>")).toBe(
      "- Un\n- Deux\n\n1. ### A\n\n   Texte\n",
    )
  })

  test("liens collés séparés, ancres sans lien, mailto gardé, javascript: retiré", () => {
    expect(
      md(
        '<p><a href="/contact">Nous écrire</a><a href="mailto:contact@hgdc.ch">contact@hgdc.ch</a><a href="#produits">Découvrir</a><a href="javascript:alert(1)">X</a></p>',
      ),
    ).toBe("[Nous écrire](https://hgdc.ch/contact) [contact@hgdc.ch](mailto:contact@hgdc.ch) Découvrir X\n")
  })

  test("logo clair et sombre (Tailwind) : lu une fois", () => {
    expect(
      md(
        '<h1><img class="h-8 dark:hidden" alt="H Collection"><img class="hidden h-8 dark:block" alt="H Collection"></h1>',
      ),
    ).toBe("# H Collection\n")
  })

  test("badges collés séparés", () => {
    expect(md("<p><span>Zurich</span><span>E-mails envoyés depuis la Suisse</span></p>")).toBe(
      "Zurich E-mails envoyés depuis la Suisse\n",
    )
  })

  test("entités décodées, espace fine gardée, caractères Markdown échappés", () => {
    expect(md("<p>L&#39;IA &amp; vous ? *non* [x] &#x1F600;</p>")).toBe("L'IA & vous ? \\*non\\* \\[x\\] 😀\n")
  })

  test("retour à la ligne forcé et image en double pour le thème sombre", () => {
    expect(
      md('<p>Rue 1<br>1135 Denens<br></p><p><img alt="Logo" class="only-light"><img alt="Logo" class="only-dark"></p>'),
    ).toBe("Rue 1\\\n1135 Denens\n\nLogo\n")
  })

  test("lien qui enveloppe des blocs : contenu puis lien", () => {
    expect(md('<a href="/ia"><h3>IA</h3><p>Texte</p></a>')).toBe("### IA\n\nTexte\n\n[IA](https://hgdc.ch/ia)\n")
  })

  test("citation, définition, code", () => {
    expect(md("<blockquote><p>Dit</p></blockquote><dl><dt>Terme</dt><dd>Sens</dd></dl><p><code>a*b</code></p>")).toBe(
      "> Dit\n\n**Terme**\n\nSens\n\n`a*b`\n",
    )
  })
})

test("pageFrontmatter : titre, description et adresse canonique du <head>, en chaînes JSON", () => {
  const head =
    '<head><title>À propos · HGDC</title><meta name="description" content="Qui est &quot;HGDC&quot;"><link rel="canonical" href="https://hgdc.ch/a-propos"></head>'
  expect(pageFrontmatter(head, "https://hgdc.ch/ignoree")).toBe(
    '---\ntitle: "À propos · HGDC"\ndescription: "Qui est \\"HGDC\\""\ncanonical: "https://hgdc.ch/a-propos"\n---\n\n',
  )
  expect(pageFrontmatter("<title>x</title>", "https://hgdc.ch/x")).toBe(
    '---\ntitle: "x"\ncanonical: "https://hgdc.ch/x"\n---\n\n',
  )
  expect(pageFrontmatter("<p>rien</p>")).toBe("")
})

test("pageTitle", () => {
  expect(pageTitle("<title> Host · Déploie &amp; publie </title>")).toBe("Host · Déploie & publie")
  expect(pageTitle("<p>x</p>")).toBeNull()
})
