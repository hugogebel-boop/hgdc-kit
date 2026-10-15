import { createContext, useContext, type CSSProperties, type ReactElement, type ReactNode } from "react"
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
  render,
  toPlainText,
} from "react-email"

import {
  EMAIL_DARK,
  EMAIL_LIGHT,
  EMAIL_TONES,
  HGDC_EMAIL_ACCENT,
  isHexColor,
  readableOn,
  type EmailAccent,
  type EmailTone,
} from "./email-palette.ts"
import { HGDC_ACCOUNT, HGDC_PRODUCTS, type HgdcCatalogProduct } from "./products.ts"

/**
 * Modèle des e-mails transactionnels de la famille : une mise en page (`EmailLayout`) et des blocs,
 * rendus par React Email en HTML pour clients mail (tableaux, styles en ligne, 600 px) et en texte.
 * Le rendu se fait côté serveur (action Convex `"use node"`, route serveur) : `renderEmail`.
 */

/** Où hgdc.ch sert les icônes des e-mails (`packages/ui/email-icons/`). */
export const EMAIL_ICON_BASE = "https://hgdc.ch/email/"
const MAIL_HREF = "https://mail.hgdc.ch"
const LEGAL = "Hugo Gebel Développement Conseil, Lausanne"
// Pas de police web : celle du système, Inter ou Geist quand elles sont installées.
const FONT = 'Geist, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

/** Icône en PNG du produit (`mail` → `https://hgdc.ch/email/mail.png`). */
export function emailIconUrl(word: string): string {
  return `${EMAIL_ICON_BASE}${word.toLowerCase()}.png`
}

function findProduct(product: HgdcCatalogProduct | string): HgdcCatalogProduct {
  if (typeof product !== "string") return product
  const found = [HGDC_ACCOUNT, ...HGDC_PRODUCTS].find((item) => item.word.toLowerCase() === product.toLowerCase())
  if (!found) throw new Error(`@hgdc/ui/email : produit inconnu « ${product} »`)
  return found
}

function resolveAccent(accent: EmailAccent | string | undefined, product: HgdcCatalogProduct): EmailAccent {
  const value =
    typeof accent === "string" ? { light: accent, dark: accent } : (accent ?? product.accent ?? HGDC_EMAIL_ACCENT)
  if (!isHexColor(value.light) || !isHexColor(value.dark))
    throw new Error("@hgdc/ui/email : accent en hex attendu (#8538ee)")
  return value
}

/** Seuls les liens absolus http(s) et mailto partent dans un e-mail ; ils ne sont jamais réécrits. */
function assertLink(href: string): string {
  if (!/^(?:https?:\/\/|mailto:)/i.test(href)) throw new Error(`@hgdc/ui/email : lien absolu attendu, reçu « ${href} »`)
  return href
}

const AccentContext = createContext<EmailAccent>(HGDC_EMAIL_ACCENT)

/**
 * Mode sombre : les clients qui le gèrent (Apple Mail, Outlook macOS et iOS, Outlook.com par
 * `data-ogsc`/`data-ogsb`) appliquent ces classes ; les autres gardent les couleurs en ligne, claires.
 */
function darkStyles(accent: EmailAccent): string {
  const d = EMAIL_DARK
  const rules = [
    `body.hg-ground, body.hg-ground > table > tbody > tr > td { background-color: ${d.ground} !important; }`,
    `.hg-card { background-color: ${d.card} !important; border-color: ${d.border} !important; }`,
    `.hg-ink { color: ${d.ink} !important; }`,
    `.hg-body { color: ${d.body} !important; }`,
    `.hg-muted, .hg-muted a { color: ${d.muted} !important; }`,
    `.hg-wash { background-color: ${d.wash} !important; }`,
    `.hg-rule { border-color: ${d.border} !important; }`,
    `.hg-link { color: ${accent.dark} !important; }`,
    `.hg-button { background-color: ${accent.dark} !important; color: ${readableOn(accent.dark)} !important; }`,
    ...Object.entries(EMAIL_TONES).flatMap(([tone, { dark }]) => [
      `.hg-callout-${tone} { background-color: ${dark.wash} !important; border-color: ${dark.bar} !important; }`,
      `.hg-tone-${tone} { color: ${dark.ink} !important; }`,
    ]),
  ]
  const outlook = rules.flatMap((rule) => {
    const [selectors = "", declarations = ""] = rule.split(" {")
    const scoped = selectors.split(", ").filter((s) => !s.startsWith("body"))
    return scoped.length
      ? [`${scoped.map((s) => `[data-ogsc] ${s}, [data-ogsb] ${s}`).join(", ")} {${declarations}`]
      : []
  })
  return [
    ":root { color-scheme: light dark; supported-color-schemes: light dark; }",
    `@media (prefers-color-scheme: dark) { ${rules.join(" ")} }`,
    ...outlook,
    "@media only screen and (max-width: 480px) { .hg-pad { padding: 24px 20px !important; } .hg-heading { font-size: 20px !important; line-height: 26px !important; } }",
  ].join("\n")
}

export type EmailLayoutProps = {
  /** Produit qui écrit : son mot (« Status ») ou son entrée du catalogue. */
  product: HgdcCatalogProduct | string
  /** Aperçu affiché après l'objet dans la boîte de réception, 90 caractères utiles. */
  preview: string
  children: ReactNode
  /** Nom affiché en tête, à la place de celui du produit (page de statut d'un client). */
  name?: string | undefined
  /** Icône en tête, PNG en https ; à la place de celle du produit. */
  iconSrc?: string | undefined
  /** Accent en hex à la place de celui du catalogue (couleur d'un client). */
  accent?: EmailAccent | string | undefined
  /** Ligne au-dessus du pied : pourquoi la personne reçoit l'e-mail, lien de désabonnement. */
  footer?: ReactNode
}

export function EmailLayout({
  product: ref,
  preview,
  children,
  name,
  iconSrc,
  accent,
  footer,
}: EmailLayoutProps): ReactElement {
  const product = findProduct(ref)
  const colors = resolveAccent(accent, product)
  const l = EMAIL_LIGHT
  const muted: CSSProperties = { color: l.muted, fontSize: 12, lineHeight: "18px", margin: 0 }
  return (
    <Html lang="fr" dir="ltr">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Brut : React échapperait le « > » des sélecteurs. Rien ici ne vient d'un utilisateur (accent vérifié en hex). */}
        <style dangerouslySetInnerHTML={{ __html: darkStyles(colors) }} />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        lang="fr"
        className="hg-ground"
        style={{ backgroundColor: l.ground, fontFamily: FONT, margin: 0, padding: "32px 12px" }}
      >
        <AccentContext value={colors}>
          <Container style={{ width: "100%", maxWidth: 600 }}>
            <Section style={{ padding: "0 4px 16px" }}>
              <Row>
                <Column style={{ width: 40, verticalAlign: "middle" }}>
                  <Img
                    src={assertLink(iconSrc ?? emailIconUrl(product.word))}
                    width={32}
                    height={32}
                    alt=""
                    style={{ display: "block", borderRadius: 16 }}
                  />
                </Column>
                <Column style={{ verticalAlign: "middle" }}>
                  <Text
                    className="hg-ink"
                    style={{ color: l.ink, fontSize: 15, fontWeight: 600, lineHeight: "20px", margin: 0 }}
                  >
                    {name ?? product.name}
                  </Text>
                </Column>
              </Row>
            </Section>
            <Section
              className="hg-card"
              tdClassName="hg-pad"
              style={{
                backgroundColor: l.card,
                border: `1px solid ${l.border}`,
                borderRadius: 16,
                padding: "32px 28px",
              }}
            >
              {children}
            </Section>
            <Section style={{ padding: "20px 4px 0" }}>
              {footer ? (
                <Text className="hg-muted" style={{ ...muted, margin: "0 0 12px" }}>
                  {footer}
                </Text>
              ) : null}
              <Text className="hg-muted" style={muted}>
                <Img
                  src={emailIconUrl("mail")}
                  width={16}
                  height={16}
                  alt=""
                  style={{ display: "inline-block", verticalAlign: "middle", borderRadius: 8, marginRight: 6 }}
                />
                <span style={{ verticalAlign: "middle" }}>
                  Envoyé avec{" "}
                  <Link href={MAIL_HREF} className="hg-muted" style={{ color: l.muted, textDecoration: "underline" }}>
                    Mail
                  </Link>{" "}
                  de la H family
                </span>
              </Text>
              <Text className="hg-muted" style={{ ...muted, margin: "4px 0 0" }}>
                {LEGAL}
              </Text>
            </Section>
          </Container>
        </AccentContext>
      </Body>
    </Html>
  )
}

export function EmailHeading({ children }: { children: ReactNode }): ReactElement {
  return (
    <Heading
      as="h1"
      className="hg-ink hg-heading"
      style={{ color: EMAIL_LIGHT.ink, fontSize: 22, fontWeight: 600, lineHeight: "28px", margin: "0 0 12px" }}
    >
      {children}
    </Heading>
  )
}

/** Paragraphe. `small` : note secondaire (validité d'un code, « si tu n'as rien demandé »). */
export function EmailText({ children, small = false }: { children: ReactNode; small?: boolean }): ReactElement {
  return (
    <Text
      className={small ? "hg-muted" : "hg-body"}
      style={{
        color: small ? EMAIL_LIGHT.muted : EMAIL_LIGHT.body,
        fontSize: small ? 13 : 15,
        lineHeight: small ? "20px" : "24px",
        margin: "0 0 16px",
      }}
    >
      {children}
    </Text>
  )
}

/** Lien dans le texte, à la couleur d'accent. */
export function EmailLink({ href, children }: { href: string; children: ReactNode }): ReactElement {
  const accent = useContext(AccentContext)
  return (
    <Link href={assertLink(href)} className="hg-link" style={{ color: accent.light, textDecoration: "underline" }}>
      {children}
    </Link>
  )
}

/** Bouton d'action : un lien direct vers `href`, tel quel, sans redirection de suivi. */
export function EmailButton({ href, children }: { href: string; children: ReactNode }): ReactElement {
  const accent = useContext(AccentContext)
  return (
    <Section style={{ margin: "8px 0 24px" }}>
      <Button
        href={assertLink(href)}
        className="hg-button"
        style={{
          backgroundColor: accent.light,
          borderRadius: 999,
          color: readableOn(accent.light),
          fontSize: 15,
          fontWeight: 600,
          padding: "12px 24px",
        }}
      >
        {children}
      </Button>
    </Section>
  )
}

/** Code à usage unique : chiffres à chasse fixe, coupés en deux groupes à l'œil mais copiés d'un bloc. */
export function EmailCode({ code }: { code: string }): ReactElement {
  const half = code.length >= 6 && code.length % 2 === 0 ? code.length / 2 : code.length
  const groups = [code.slice(0, half), code.slice(half)].filter(Boolean)
  return (
    <Section
      className="hg-wash"
      style={{
        backgroundColor: EMAIL_LIGHT.wash,
        borderRadius: 12,
        margin: "8px 0 24px",
        padding: "18px 16px",
        textAlign: "center",
      }}
    >
      <Text
        className="hg-ink"
        style={{
          color: EMAIL_LIGHT.ink,
          fontFamily: MONO,
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: 6,
          lineHeight: "40px",
          margin: 0,
        }}
      >
        {groups.map((group, i) => (
          <span key={i} style={i ? { marginLeft: 14 } : undefined}>
            {group}
          </span>
        ))}
      </Text>
    </Section>
  )
}

/** Encadré : une information à ne pas manquer. Le titre porte le sens, jamais la couleur seule. */
export function EmailCallout({
  tone = "neutral",
  title,
  children,
}: {
  tone?: EmailTone
  title?: ReactNode
  children: ReactNode
}): ReactElement {
  const colors = EMAIL_TONES[tone].light
  return (
    <Section
      className={`hg-callout-${tone}`}
      style={{
        backgroundColor: colors.wash,
        borderLeft: `3px solid ${colors.bar}`,
        borderRadius: 8,
        margin: "4px 0 20px",
        padding: "14px 16px",
      }}
    >
      {title ? (
        <Text
          className={`hg-tone-${tone}`}
          style={{ color: colors.ink, fontSize: 14, fontWeight: 600, lineHeight: "20px", margin: "0 0 4px" }}
        >
          {title}
        </Text>
      ) : null}
      <Text className="hg-body" style={{ color: EMAIL_LIGHT.body, fontSize: 14, lineHeight: "22px", margin: 0 }}>
        {children}
      </Text>
    </Section>
  )
}

export function EmailDivider(): ReactElement {
  return (
    <Hr
      className="hg-rule"
      style={{ border: "none", borderTop: `1px solid ${EMAIL_LIGHT.border}`, margin: "24px 0" }}
    />
  )
}

export type EmailDetail = { label: string; value: ReactNode }

/** Liste clé / valeur : site, heure, durée, organisation. */
export function EmailDetails({ items }: { items: ReadonlyArray<EmailDetail> }): ReactElement {
  return (
    <Section style={{ margin: "4px 0 20px" }}>
      {items.map((item, i) => {
        const cell: CSSProperties = {
          borderTop: i ? `1px solid ${EMAIL_LIGHT.border}` : undefined,
          padding: "9px 0",
          verticalAlign: "top",
        }
        return (
          <Row key={item.label} className="hg-detail">
            <Column className={i ? "hg-rule" : undefined} style={{ ...cell, width: "38%", paddingRight: 12 }}>
              <Text
                className="hg-muted"
                style={{ color: EMAIL_LIGHT.muted, fontSize: 13, lineHeight: "20px", margin: 0 }}
              >
                {item.label}
              </Text>
            </Column>
            <Column className={i ? "hg-rule" : undefined} style={cell}>
              <Text className="hg-ink" style={{ color: EMAIL_LIGHT.ink, fontSize: 14, lineHeight: "20px", margin: 0 }}>
                {item.value}
              </Text>
            </Column>
          </Row>
        )
      })}
    </Section>
  )
}

export type RenderedEmail = { html: string; text: string }

const TEXT_SELECTORS = [
  { selector: "h1", options: { uppercase: false } },
  // Une ligne par détail, « Libellé   valeur », plutôt que deux paragraphes.
  { selector: "table.hg-detail", format: "dataTable" },
]

/** HTML pour les clients mail et version texte, tirée du même rendu. */
export async function renderEmail(element: ReactElement): Promise<RenderedEmail> {
  const html = await render(element)
  return { html, text: toPlainText(html, { selectors: TEXT_SELECTORS }).trim() }
}
