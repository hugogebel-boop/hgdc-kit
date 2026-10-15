import { describe, expect, it } from "vitest"

import {
  EmailButton,
  EmailCallout,
  EmailCode,
  EmailDetails,
  EmailDivider,
  EmailHeading,
  EmailLayout,
  EmailLink,
  EmailText,
  emailIconUrl,
  renderEmail,
} from "./email.tsx"
import { EMAIL_DARK, EMAIL_LIGHT, EMAIL_TONES, HGDC_EMAIL_ACCENT, contrastRatio, readableOn } from "./email-palette.ts"
import { HGDC_ACCOUNT, HGDC_PRODUCTS } from "./products.ts"

/** Valeur d'un attribut, entités HTML décodées comme le ferait le client mail. */
function attributes(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map((m) =>
    (m[1] ?? "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'"),
  )
}

describe("EmailLayout", () => {
  it("met en tête l'icône et le nom du produit, en pied « Envoyé avec Mail » et les mentions légales", async () => {
    const { html } = await renderEmail(
      <EmailLayout product="status" preview="Aperçu">
        <EmailText>Bonjour</EmailText>
      </EmailLayout>,
    )
    expect(html).toContain(">Status<")
    expect(attributes(html, "src")).toEqual(["https://hgdc.ch/email/status.png", "https://hgdc.ch/email/mail.png"])
    expect(html).toContain("Envoyé avec")
    expect(html).toContain(">Mail de la H family</a>")
    expect(attributes(html, "href")).toContain("https://mail.hgdc.ch")
    expect(html).toContain("Hugo Gebel Développement Conseil, Lausanne")
    expect(html).toMatch(/<html[^>]*lang="fr"/)
  })

  it("déclare les deux thèmes, la largeur de 600 px et la feuille du mode sombre", async () => {
    const { html } = await renderEmail(
      <EmailLayout product={HGDC_ACCOUNT} preview="x">
        contenu
      </EmailLayout>,
    )
    expect(html).toContain('<meta name="color-scheme" content="light dark"')
    expect(html).toContain('<meta name="supported-color-schemes" content="light dark"')
    expect(html).toContain("max-width:600px")
    expect(html).toContain("@media (prefers-color-scheme: dark)")
    expect(html).toContain(`.hg-card { background-color: ${EMAIL_DARK.card} !important;`)
    expect(html).toContain("[data-ogsc] .hg-ink")
    // Le sélecteur `>` reste brut : React ne l'échappe pas dans la feuille.
    expect(html).toContain("body.hg-ground > table")
  })

  it("prend l'accent du catalogue, ou celui du client, avec un texte lisible dessus", async () => {
    const button = (accent?: string) =>
      renderEmail(
        <EmailLayout product="Portal" preview="x" accent={accent}>
          <EmailButton href="https://portal.hgdc.ch">Ouvrir</EmailButton>
        </EmailLayout>,
      )
    expect((await button()).html).toContain(`background-color:${HGDC_EMAIL_ACCENT.light}`)
    const custom = (await button("#facc15")).html
    expect(custom).toContain("background-color:#facc15")
    expect(custom).toContain("color:#0a0a0a")
  })

  it("remplace le nom et l'icône pour la page d'un client", async () => {
    const { html } = await renderEmail(
      <EmailLayout
        product="Status"
        preview="x"
        name="Statut · Atelier"
        iconSrc="https://status.hgdc.ch/p/atelier/icon.png"
      >
        y
      </EmailLayout>,
    )
    expect(html).toContain("Statut · Atelier")
    expect(html).not.toContain(">Status<")
    expect(attributes(html, "src")[0]).toBe("https://status.hgdc.ch/p/atelier/icon.png")
  })

  it("refuse un produit inconnu, un accent qui n'est pas en hex et une icône non https", async () => {
    await expect(
      renderEmail(
        <EmailLayout product="Inconnu" preview="x">
          y
        </EmailLayout>,
      ),
    ).rejects.toThrow("produit inconnu")
    await expect(
      renderEmail(
        <EmailLayout product="Mail" preview="x" accent="red">
          y
        </EmailLayout>,
      ),
    ).rejects.toThrow("hex")
    await expect(
      renderEmail(
        <EmailLayout product="Mail" preview="x" iconSrc="/icon.png">
          y
        </EmailLayout>,
      ),
    ).rejects.toThrow("lien absolu")
  })
})

describe("liens", () => {
  it("garde le lien tel quel : ni redirection, ni paramètre ajouté", async () => {
    const url = "https://portal.hgdc.ch/invitations/8fK2?source=email&lang=fr#haut"
    const { html, text } = await renderEmail(
      <EmailLayout product="Portal" preview="x">
        <EmailButton href={url}>Voir l&apos;invitation</EmailButton>
        <EmailText>
          Ou <EmailLink href="mailto:aide@hgdc.ch">écris-nous</EmailLink>.
        </EmailText>
      </EmailLayout>,
    )
    expect(attributes(html, "href")).toEqual([url, "mailto:aide@hgdc.ch", "https://mail.hgdc.ch"])
    expect(text).toContain(`Voir l'invitation ${url}`)
  })

  it("refuse un lien relatif ou javascript:", async () => {
    for (const href of ["/invitations/1", "javascript:alert(1)", "www.hgdc.ch"]) {
      await expect(
        renderEmail(
          <EmailLayout product="Mail" preview="x">
            <EmailButton href={href}>Ouvrir</EmailButton>
          </EmailLayout>,
        ),
        href,
      ).rejects.toThrow("lien absolu")
    }
  })
})

describe("blocs", () => {
  it("échappe ce qu'une personne a saisi", async () => {
    const name = `<script>alert("x")</script><img src=x onerror=alert(1)>`
    const { html, text } = await renderEmail(
      <EmailLayout product="Mail" preview={name}>
        <EmailHeading>{name}</EmailHeading>
        <EmailDetails items={[{ label: "Nom", value: name }]} />
      </EmailLayout>,
    )
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;script&gt;")
    expect(text).toContain(name)
  })

  it("coupe un code de six chiffres en deux groupes à l'œil, d'un bloc dans le texte", async () => {
    const { html, text } = await renderEmail(
      <EmailLayout product="Account" preview="Ton code">
        <EmailCode code="482913" />
      </EmailLayout>,
    )
    expect(html).toMatch(/<span>482<\/span><span style="margin-left:14px">913<\/span>/)
    expect(html).toContain("ui-monospace")
    expect(text).toContain("482913")
  })

  it("rend encadrés, séparateur et détails, en texte aussi", async () => {
    const { html, text } = await renderEmail(
      <EmailLayout product="Status" preview="x">
        <EmailCallout tone="danger" title="Panne en cours">
          Le site ne répond plus.
        </EmailCallout>
        <EmailDivider />
        <EmailDetails
          items={[
            { label: "Service", value: "Site public" },
            { label: "Début", value: "14 h 32" },
          ]}
        />
      </EmailLayout>,
    )
    expect(html).toContain(`border-left:3px solid ${EMAIL_TONES.danger.light.bar}`)
    expect(html).toContain('class="hg-callout-danger"')
    expect(html).toContain("<hr")
    expect(text).toMatch(/Service\s+Site public/)
    expect(text).toContain("Panne en cours")
  })

  it("donne un texte sans balise, sans aperçu ni image, titre en casse normale", async () => {
    const { text } = await renderEmail(
      <EmailLayout product="Mail" preview="Texte d'aperçu seul">
        <EmailHeading>Ton domaine est prêt</EmailHeading>
        <EmailText>Tes applications peuvent envoyer.</EmailText>
      </EmailLayout>,
    )
    expect(text).not.toMatch(/<[a-z]/i)
    expect(text).not.toContain("Texte d'aperçu seul")
    expect(text).toContain("Ton domaine est prêt")
    expect(text.startsWith("Mail")).toBe(true)
    expect(text.endsWith("Hugo Gebel Développement Conseil, Lausanne")).toBe(true)
  })
})

describe("couleurs", () => {
  it("chaque produit a son icône et un accent lisible sous son texte de bouton", () => {
    for (const product of [HGDC_ACCOUNT, ...HGDC_PRODUCTS]) {
      expect(emailIconUrl(product.word)).toMatch(/^https:\/\/hgdc\.ch\/email\/[a-z]+\.png$/)
      const accent = product.accent ?? HGDC_EMAIL_ACCENT
      for (const color of [accent.light, accent.dark])
        expect(contrastRatio(color, readableOn(color))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("texte courant et encres des encadrés à 4,5:1 au moins, dans les deux thèmes", () => {
    for (const theme of [EMAIL_LIGHT, EMAIL_DARK]) {
      for (const ink of [theme.ink, theme.body, theme.muted])
        expect(contrastRatio(ink, theme.card)).toBeGreaterThanOrEqual(4.5)
    }
    for (const [tone, { light, dark }] of Object.entries(EMAIL_TONES)) {
      expect(contrastRatio(light.ink, light.wash), `${tone} clair`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(dark.ink, dark.wash), `${tone} sombre`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(EMAIL_LIGHT.body, light.wash), `${tone} texte clair`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(EMAIL_DARK.body, dark.wash), `${tone} texte sombre`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
