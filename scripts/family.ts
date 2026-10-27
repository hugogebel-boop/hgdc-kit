// Identité H Collection, depuis packages/ui/family/ (copie des originaux du site hgdc.ch,
// public/family/). Ne jamais redessiner une icône ici : changer l'original, le recopier dans
// family/, puis :
//
//   bun scripts/family.ts && bun run format
//
// Puis un changeset @hgdc/ui et la release : les produits et le site reçoivent la nouvelle version
// (propagate.yml) et posent les icônes à leur build (`hgdc-brand`). Rien à recopier à la main
// (runbook docs/runbooks/changer-une-icone.md).
//
// Les icônes des produits sont le pictogramme clair seul (`<mot>.svg`), sans cellule blanche
// (choix de Hugo, 2026-10-19, version « fond gris, sans blanc »). Le dessin n'est pas retouché :
// mêmes traits, mêmes opacités. Il est centré sur son encre et remplit le cadre, pour occuper
// la place de l'ancienne tuile. La maskable garde l'encre dans le cercle sûr (80 %), toujours
// sans fond. Le favicon reste sans fond, marge 4 %, variante sombre sous prefers-color-scheme: dark.
// Le H « Double » reste sans fond, en deux variantes (clair, sombre).
//
// Écrit :
//   packages/ui/family/tile/<mot>.svg
//   packages/ui/src/family-svg.ts (SVG embarqués, empreinte des icônes d'e-mail)
//   packages/ui/email-icons/<mot>.png (96 px, pictogramme seul : Gmail et Outlook n'affichent pas le SVG)
//   packages/ui/family/app/<mot>/ : favicon.svg, favicon.ico (16, 32, 48), apple-touch-icon.png
//     (180), icon-192.png, icon-512.png, icon-maskable-512.png, posés dans le public/ du produit
//     par `hgdc-brand sync <mot>` à chaque build
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { Resvg } from "@resvg/resvg-js"

const FAMILY = new URL("../packages/ui/family/", import.meta.url)
const EMAIL = new URL("../packages/ui/email-icons/", import.meta.url)
const PRODUCTS = ["account", "host", "mail", "portal", "status", "analytics", "docs", "iassistant"] as const

/** Marge du favicon, sans fond : le pictogramme le plus grand possible dans l'onglet. */
const FAVICON_MARGIN = 0.04
/** Rayon de la zone sûre d'une icône maskable (cercle de 80 %), sur 64. */
const MASKABLE_SAFE_RADIUS = 25.6

// Sans les polices du système : leur chargement à chaque rendu rend le script très lent.
const NO_FONTS = { font: { loadSystemFonts: false } }

const svg = async (name: string) =>
  (await readFile(new URL(`${name}.svg`, FAMILY), "utf8")).replace(/\r\n/g, "\n").trim()
const inner = (text: string) => text.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")
const png = (text: string, px: number) =>
  new Resvg(text, { ...NO_FONTS, fitTo: { mode: "width", value: px } }).render().asPng()

/** Encre du pictogramme dans un carré qui la centre : le centrage suit le dessin, pas sa viewBox. */
const ink = (picto: string) => {
  const box = new Resvg(picto, NO_FONTS).innerBBox()
  if (!box) throw new Error("pictogramme vide")
  const side = Math.max(box.width, box.height)
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    viewBox: [box.x + box.width / 2 - side / 2, box.y + box.height / 2 - side / 2, side, side].map(round).join(" "),
    /** Diagonale de l'encre, rapportée au côté du carré. */
    diagonal: Math.hypot(box.width, box.height) / side,
  }
}
/** Le pictogramme dans un carré de 64, à `margin` de chaque côté. */
const place = (picto: string, margin: number) => {
  const box = 64 * (1 - 2 * margin)
  const at = 64 * margin
  return `<svg x="${at}" y="${at}" width="${box}" height="${box}" viewBox="${ink(picto).viewBox}">${inner(picto)}</svg>`
}
/** Pictogramme seul, centré, qui remplit le carré de 64. */
const mark = (picto: string, margin = 0) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${place(picto, margin)}</svg>`
/** Marge qui garde l'encre dans le cercle sûr de la maskable. */
const maskableMargin = (picto: string) => {
  const box = (2 * MASKABLE_SAFE_RADIUS) / ink(picto).diagonal
  return (64 - box) / 2 / 64
}
/** Préfixe les identifiants : deux dessins dans un même fichier ne se marchent pas dessus. */
const prefixIds = (text: string, prefix: string) =>
  text
    .replace(/id="([^"]+)"/g, `id="${prefix}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${prefix}$1"`)
/** Favicon sans fond : la variante sombre (dégradé éclairci) quand le système est en sombre. */
const favicon = (light: string, dark: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>.d{display:none}@media (prefers-color-scheme:dark){.l{display:none}.d{display:inline}}</style><g class="l">${place(prefixIds(light, "l"), FAVICON_MARGIN)}</g><g class="d">${place(prefixIds(dark, "d"), FAVICON_MARGIN)}</g></svg>`
const bare = (picto: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${place(picto, FAVICON_MARGIN)}</svg>`

/** ICO à entrées PNG (Windows Vista et suivants, tous les navigateurs). */
const ico = (images: Array<{ px: number; data: Uint8Array }>) => {
  const header = Buffer.alloc(6 + 16 * images.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach(({ px, data }, i) => {
    const at = 6 + 16 * i
    header.writeUInt8(px >= 256 ? 0 : px, at)
    header.writeUInt8(px >= 256 ? 0 : px, at + 1)
    header.writeUInt16LE(1, at + 4)
    header.writeUInt16LE(32, at + 6)
    header.writeUInt32LE(data.length, at + 8)
    header.writeUInt32LE(offset, at + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...images.map(({ data }) => Buffer.from(data))])
}

const TILE = new URL("tile/", FAMILY)
await mkdir(TILE, { recursive: true })
const badges: Array<string> = []
const emailVersions: Array<string> = []
for (const product of PRODUCTS) {
  const picto = await svg(product)
  const glyph = mark(picto)
  const maskable = mark(picto, maskableMargin(picto))
  await writeFile(new URL(`${product}.svg`, TILE), `${glyph}\n`)
  badges.push(`  ${product}: ${JSON.stringify(glyph)},`)
  const email = png(glyph, 96)
  await writeFile(new URL(`${product}.png`, EMAIL), email)
  emailVersions.push(`  ${product}: "${createHash("sha256").update(email).digest("hex").slice(0, 8)}",`)

  const app = new URL(`app/${product}/`, FAMILY)
  await mkdir(app, { recursive: true })
  await writeFile(new URL("favicon.svg", app), `${favicon(picto, await svg(`${product}-dark`))}\n`)
  await writeFile(new URL("favicon.ico", app), ico([16, 32, 48].map((px) => ({ px, data: png(bare(picto), px) }))))
  await writeFile(new URL("apple-touch-icon.png", app), png(glyph, 180))
  await writeFile(new URL("icon-192.png", app), png(glyph, 192))
  await writeFile(new URL("icon-512.png", app), png(glyph, 512))
  await writeFile(new URL("icon-maskable-512.png", app), png(maskable, 512))
}

const pair = async (name: string) =>
  `{ light: ${JSON.stringify(await svg(name))}, dark: ${JSON.stringify(await svg(`${name}-dark`))} }`

const source = `// Généré par \`bun scripts/family.ts\` depuis \`packages/ui/family/\`. Ne pas modifier à la main.

/** Les produits de la H Collection qui ont une icône, par leur mot en minuscules. */
export const FAMILY_PRODUCTS = ${JSON.stringify(PRODUCTS)} as const

export type FamilyProduct = (typeof FAMILY_PRODUCTS)[number]

/** Vrai si le mot en minuscules (« host ») désigne un produit qui a une icône. */
export function isFamilyProduct(word: string): word is FamilyProduct {
  return (FAMILY_PRODUCTS as ReadonlyArray<string>).includes(word)
}

/** Un dessin en deux variantes : sur fond clair et sur fond sombre. */
export type ThemedSvg = Readonly<{ light: string; dark: string }>

/**
 * SVG de l'icône de chaque produit : le pictogramme clair seul, sans fond
 * (\`family/tile/<mot>.svg\`).
 */
export const PRODUCT_BADGE_SVG: Readonly<Record<FamilyProduct, string>> = {
${badges.join("\n")}
}

/**
 * Empreinte de chaque icône d'e-mail (\`email-icons/<mot>.png\`), ajoutée à son adresse : un client
 * mail qui garde l'ancienne image en cache (proxy d'images de Gmail) charge la nouvelle.
 */
export const EMAIL_ICON_VERSION: Readonly<Record<FamilyProduct, string>> = {
${emailVersions.join("\n")}
}

/** SVG du H « Double », la marque de la H Collection, sans fond (\`family/hcollection-icon(-dark).svg\`). */
export const FAMILY_MARK_SVG: ThemedSvg = ${await pair("hcollection-icon")}
`
await writeFile(new URL("../packages/ui/src/family-svg.ts", import.meta.url), source)
console.log(`family-svg.ts, family/tile/, ${PRODUCTS.length} icônes d'e-mail et icônes d'application (family/app/)`)
