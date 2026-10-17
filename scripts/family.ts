// Identité H Collection, depuis packages/ui/family/ (copie des originaux du site hgdc.ch,
// public/family/). Ne jamais redessiner une icône ici : changer l'original, le recopier dans
// family/, puis :
//
//   bun scripts/family.ts && bun run format
//
// Les icônes des produits se posent toujours sur un fond blanc, en clair comme en sombre, sans
// bordure ni ombre (choix de Hugo, 2026-10-17). Le dessin est celui de la variante claire
// (`<mot>.svg`), à 18 % de marge. Forme selon le contexte :
//   squircle            barre des produits, menu du compte, e-mails, icon-192/512
//   rond                « Propulsé par »
//   carré arrondi 22 %  favicon
//   plein cadre         apple-touch et maskable (le système découpe lui-même)
// Le H « Double » reste sans fond, en deux variantes (clair, sombre).
//
// Écrit :
//   packages/ui/family/tile/<mot>.svg, <mot>-round.svg, <mot>-favicon.svg
//   packages/ui/src/family-svg.ts (SVG embarqués)
//   packages/ui/email-icons/<mot>.png (96 px, squircle : Gmail et Outlook n'affichent pas le SVG)
//   packages/ui/family/app/<mot>/ : favicon.svg, favicon.ico (16, 32, 48), apple-touch-icon.png
//     (180), icon-192.png, icon-512.png, icon-maskable-512.png, à recopier dans le public/ du produit
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { Resvg } from "@resvg/resvg-js"

const FAMILY = new URL("../packages/ui/family/", import.meta.url)
const EMAIL = new URL("../packages/ui/email-icons/", import.meta.url)
const PRODUCTS = ["account", "host", "mail", "portal", "status", "analytics", "docs"] as const

const svg = async (name: string) =>
  (await readFile(new URL(`${name}.svg`, FAMILY), "utf8")).replace(/\r\n/g, "\n").trim()
const inner = (text: string) => text.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")
const viewBox = (text: string) => /viewBox="([^"]+)"/.exec(text)?.[1] ?? "0 0 64 64"
const png = (text: string, px: number) => new Resvg(text, { fitTo: { mode: "width", value: px } }).render().asPng()

const SQUIRCLE =
  "M32 0C48.6 0 56.9 0 60.5 3.5C64 7.1 64 15.4 64 32C64 48.6 64 56.9 60.5 60.5C56.9 64 48.6 64 32 64C15.4 64 7.1 64 3.5 60.5C0 56.9 0 48.6 0 32C0 15.4 0 7.1 3.5 3.5C7.1 0 15.4 0 32 0Z"
const SHAPES = {
  squircle: `<path d="${SQUIRCLE}" fill="#fff"/>`,
  round: `<circle cx="32" cy="32" r="32" fill="#fff"/>`,
  square: `<rect width="64" height="64" rx="14" fill="#fff"/>`,
  full: `<rect width="64" height="64" fill="#fff"/>`,
} as const
type Shape = keyof typeof SHAPES
/** Le pictogramme clair centré sur un fond blanc de 64, à 18 % de marge. */
const tile = (picto: string, shape: Shape) => {
  const box = 64 * 0.64
  const at = (64 - box) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${SHAPES[shape]}<svg x="${at}" y="${at}" width="${box}" height="${box}" viewBox="${viewBox(picto)}">${inner(picto)}</svg></svg>`
}

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
for (const product of PRODUCTS) {
  const picto = await svg(product)
  const squircle = tile(picto, "squircle")
  const round = tile(picto, "round")
  const square = tile(picto, "square")
  const full = tile(picto, "full")
  await writeFile(new URL(`${product}.svg`, TILE), `${squircle}\n`)
  await writeFile(new URL(`${product}-round.svg`, TILE), `${round}\n`)
  await writeFile(new URL(`${product}-favicon.svg`, TILE), `${square}\n`)
  badges.push(`  ${product}: { squircle: ${JSON.stringify(squircle)}, round: ${JSON.stringify(round)} },`)
  await writeFile(new URL(`${product}.png`, EMAIL), png(squircle, 96))

  const app = new URL(`app/${product}/`, FAMILY)
  await mkdir(app, { recursive: true })
  await writeFile(new URL("favicon.svg", app), `${square}\n`)
  await writeFile(new URL("favicon.ico", app), ico([16, 32, 48].map((px) => ({ px, data: png(square, px) }))))
  await writeFile(new URL("apple-touch-icon.png", app), png(full, 180))
  await writeFile(new URL("icon-192.png", app), png(squircle, 192))
  await writeFile(new URL("icon-512.png", app), png(squircle, 512))
  await writeFile(new URL("icon-maskable-512.png", app), png(full, 512))
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

/** Forme du fond blanc d'une icône : squircle (barre, menu, e-mails) ou rond (« Propulsé par »). */
export type BadgeShape = "squircle" | "round"

/** Un dessin en deux variantes : sur fond clair et sur fond sombre. */
export type ThemedSvg = Readonly<{ light: string; dark: string }>

/**
 * SVG de l'icône de chaque produit sur son fond blanc, toujours le même en clair et en sombre
 * (\`family/tile/<mot>.svg\`, \`family/tile/<mot>-round.svg\`).
 */
export const PRODUCT_BADGE_SVG: Readonly<Record<FamilyProduct, Readonly<Record<BadgeShape, string>>>> = {
${badges.join("\n")}
}

/** SVG du H « Double », la marque de la H Collection, sans fond (\`family/hcollection-icon(-dark).svg\`). */
export const FAMILY_MARK_SVG: ThemedSvg = ${await pair("hcollection-icon")}
`
await writeFile(new URL("../packages/ui/src/family-svg.ts", import.meta.url), source)
console.log(`family-svg.ts, family/tile/, ${PRODUCTS.length} icônes d'e-mail et icônes d'application (family/app/)`)
