// Identité H Collection, depuis packages/ui/family/ (copie des originaux du site hgdc.ch,
// public/family/). Ne jamais redessiner une icône ici : changer l'original, le recopier dans
// family/, puis :
//
//   bun scripts/family.ts && bun run format
//
// Les icônes des produits se posent toujours sur un fond blanc, en clair comme en sombre, sans
// bordure ni ombre (choix de Hugo, 2026-10-17). Le dessin est celui de la variante claire
// (`<mot>.svg`), centré sur son encre (pas sur sa viewBox), à 10 % de marge. Formes (2026-10-18) :
//   carré arrondi (rx 14/64, 22 %)  partout : barre, menu du compte, « Propulsé par », e-mails, icon-192/512
//   plein cadre                     apple-touch et maskable (le système découpe lui-même ; la maskable
//                                   garde l'encre dans la zone sûre, cercle de 80 %)
//   sans fond                       favicon, marge 4 %, variante sombre sous prefers-color-scheme: dark
// Le H « Double » reste sans fond, en deux variantes (clair, sombre).
//
// Écrit :
//   packages/ui/family/tile/<mot>.svg
//   packages/ui/src/family-svg.ts (SVG embarqués)
//   packages/ui/email-icons/<mot>.png (96 px, carré arrondi : Gmail et Outlook n'affichent pas le SVG)
//   packages/ui/family/app/<mot>/ : favicon.svg, favicon.ico (16, 32, 48), apple-touch-icon.png
//     (180), icon-192.png, icon-512.png, icon-maskable-512.png, à recopier dans le public/ du produit
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { Resvg } from "@resvg/resvg-js"

const FAMILY = new URL("../packages/ui/family/", import.meta.url)
const EMAIL = new URL("../packages/ui/email-icons/", import.meta.url)
const PRODUCTS = ["account", "host", "mail", "portal", "status", "analytics", "docs"] as const

/** Marge du pictogramme dans sa tuile blanche, de chaque côté. */
const MARGIN = 0.1
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

const SHAPES = {
  square: `<rect width="64" height="64" rx="14" fill="#fff"/>`,
  full: `<rect width="64" height="64" fill="#fff"/>`,
} as const
type Shape = keyof typeof SHAPES

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
const tile = (picto: string, shape: Shape, margin = MARGIN) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${SHAPES[shape]}${place(picto, margin)}</svg>`
/** Marge qui garde l'encre dans le cercle sûr de la maskable, jamais moins que MARGIN. */
const maskableMargin = (picto: string) => {
  const box = Math.min(64 * (1 - 2 * MARGIN), (2 * MASKABLE_SAFE_RADIUS) / ink(picto).diagonal)
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
for (const product of PRODUCTS) {
  const picto = await svg(product)
  const square = tile(picto, "square")
  const full = tile(picto, "full")
  const maskable = tile(picto, "full", maskableMargin(picto))
  await writeFile(new URL(`${product}.svg`, TILE), `${square}\n`)
  badges.push(`  ${product}: ${JSON.stringify(square)},`)
  await writeFile(new URL(`${product}.png`, EMAIL), png(square, 96))

  const app = new URL(`app/${product}/`, FAMILY)
  await mkdir(app, { recursive: true })
  await writeFile(new URL("favicon.svg", app), `${favicon(picto, await svg(`${product}-dark`))}\n`)
  await writeFile(new URL("favicon.ico", app), ico([16, 32, 48].map((px) => ({ px, data: png(bare(picto), px) }))))
  await writeFile(new URL("apple-touch-icon.png", app), png(full, 180))
  await writeFile(new URL("icon-192.png", app), png(square, 192))
  await writeFile(new URL("icon-512.png", app), png(square, 512))
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
 * SVG de l'icône de chaque produit sur son carré blanc arrondi, toujours le même en clair et en
 * sombre (\`family/tile/<mot>.svg\`).
 */
export const PRODUCT_BADGE_SVG: Readonly<Record<FamilyProduct, string>> = {
${badges.join("\n")}
}

/** SVG du H « Double », la marque de la H Collection, sans fond (\`family/hcollection-icon(-dark).svg\`). */
export const FAMILY_MARK_SVG: ThemedSvg = ${await pair("hcollection-icon")}
`
await writeFile(new URL("../packages/ui/src/family-svg.ts", import.meta.url), source)
console.log(`family-svg.ts, family/tile/, ${PRODUCTS.length} icônes d'e-mail et icônes d'application (family/app/)`)
