// Identité H Collection : écrit packages/ui/src/family-svg.ts (SVG des icônes et du H, en chaînes,
// variantes claire et sombre) et les PNG des e-mails (packages/ui/email-icons/<mot>.png, 96 × 96,
// variante claire : Gmail et Outlook n'affichent pas le SVG) depuis packages/ui/family/, copie des
// originaux du site hgdc.ch (public/family/). Ne jamais redessiner une icône ici : changer
// l'original, le recopier dans family/, puis :
//
//   bun scripts/family.ts && bun run format
import { readFile, writeFile } from "node:fs/promises"
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
console.log(`family-svg.ts + ${PRODUCTS.length} icônes d'e-mail`)
