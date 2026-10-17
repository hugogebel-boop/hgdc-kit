// Identité H Collection : écrit packages/ui/src/family-svg.ts (SVG des icônes et du H, en chaînes,
// variantes claire et sombre) et les PNG des e-mails (packages/ui/email-icons/<mot>.png, 96 × 96,
// variante claire : Gmail et Outlook n'affichent pas le SVG) depuis packages/ui/family/, copie des
// originaux du site hgdc.ch (public/family/). Ne jamais redessiner une icône ici : changer
// l'original, le recopier dans family/, puis :
//
//   bun scripts/family.ts && bun run format
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { Resvg } from "@resvg/resvg-js"

const FAMILY = new URL("../packages/ui/family/", import.meta.url)
const EMAIL = new URL("../packages/ui/email-icons/", import.meta.url)
const PRODUCTS = ["account", "host", "mail", "portal", "status", "analytics", "docs"] as const

const svg = async (name: string) =>
  (await readFile(new URL(`${name}.svg`, FAMILY), "utf8")).replace(/\r\n/g, "\n").trim()

const pair = async (name: string) =>
  `{ light: ${JSON.stringify(await svg(name))}, dark: ${JSON.stringify(await svg(`${name}-dark`))} }`

const badges: Array<string> = []
for (const product of PRODUCTS) {
  badges.push(`  ${product}: ${await pair(product)},`)
  const png = new Resvg(await svg(product), { fitTo: { mode: "width", value: 96 } }).render().asPng()
  await writeFile(new URL(`${product}.png`, EMAIL), png)
}

const source = `// Généré par \`bun scripts/family.ts\` depuis \`packages/ui/family/\`. Ne pas modifier à la main.

/** Les produits de la H Collection qui ont une icône, par leur mot en minuscules. */
export const FAMILY_PRODUCTS = ${JSON.stringify(PRODUCTS)} as const

export type FamilyProduct = (typeof FAMILY_PRODUCTS)[number]

/** Vrai si le mot en minuscules (« host ») désigne un produit qui a une icône. */
export function isFamilyProduct(word: string): word is FamilyProduct {
  return (FAMILY_PRODUCTS as ReadonlyArray<string>).includes(word)
}

/** Un dessin en deux variantes : sur fond clair (\`<mot>.svg\`) et sur fond sombre (\`<mot>-dark.svg\`). */
export type ThemedSvg = Readonly<{ light: string; dark: string }>

/** SVG de l'icône de chaque produit (\`family/<mot>.svg\`, \`family/<mot>-dark.svg\`). */
export const PRODUCT_BADGE_SVG: Readonly<Record<FamilyProduct, ThemedSvg>> = {
${badges.join("\n")}
}

/** SVG du H « Double », la marque de la H Collection (\`family/hcollection-icon(-dark).svg\`). */
export const FAMILY_MARK_SVG: ThemedSvg = ${await pair("hcollection-icon")}
`
await writeFile(new URL("../packages/ui/src/family-svg.ts", import.meta.url), source)

// Icônes d'application de chaque produit, à recopier telles quelles dans son `public/` :
// packages/ui/family/app/<mot>/{favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png,
// icon-512.png, icon-maskable-512.png}. favicon.svg porte les deux dessins et suit le thème du
// système ; les PNG et l'ICO sont en clair. Fond blanc pour apple-touch (iOS remplit la
// transparence de noir) et pour l'icône maskable, dont le pictogramme tient dans la zone sûre
// (cercle de 80 %).
const inner = (text: string) => text.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")
const viewBox = (text: string) => /viewBox="([^"]+)"/.exec(text)?.[1] ?? "0 0 64 64"
const prefixIds = (text: string, prefix: string) =>
  text
    .replace(/id="([^"]+)"/g, `id="${prefix}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${prefix}$1"`)
const png = (text: string, px: number) => new Resvg(text, { fitTo: { mode: "width", value: px } }).render().asPng()
/** Le dessin centré sur un carré de `px`, à `scale` du côté, sur fond `background`. */
const tile = (text: string, px: number, scale: number, background: string) => {
  const box = px * scale
  const at = (px - box) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}"><rect width="${px}" height="${px}" fill="${background}"/><svg x="${at}" y="${at}" width="${box}" height="${box}" viewBox="${viewBox(text)}">${inner(text)}</svg></svg>`
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

for (const product of PRODUCTS) {
  const [light, dark] = [await svg(product), await svg(`${product}-dark`)]
  const dir = new URL(`app/${product}/`, FAMILY)
  await mkdir(dir, { recursive: true })
  const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox(light)}"><style>.d{display:none}@media (prefers-color-scheme:dark){.l{display:none}.d{display:inline}}</style><g class="l">${inner(light)}</g><g class="d">${prefixIds(inner(dark), "d")}</g></svg>\n`
  await writeFile(new URL("favicon.svg", dir), favicon)
  await writeFile(new URL("favicon.ico", dir), ico([16, 32, 48].map((px) => ({ px, data: png(light, px) }))))
  await writeFile(new URL("apple-touch-icon.png", dir), png(tile(light, 180, 0.7, "#ffffff"), 180))
  await writeFile(new URL("icon-192.png", dir), png(light, 192))
  await writeFile(new URL("icon-512.png", dir), png(light, 512))
  await writeFile(new URL("icon-maskable-512.png", dir), png(tile(light, 512, 0.64, "#ffffff"), 512))
}
console.log(`family-svg.ts + ${PRODUCTS.length} icônes d'e-mail + icônes d'application (family/app/)`)
