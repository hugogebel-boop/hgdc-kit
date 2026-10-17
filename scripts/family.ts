// Identité H Collection : écrit packages/ui/src/family-svg.ts (SVG des pastilles et du H, en chaînes) et les
// PNG des e-mails (packages/ui/email-icons/<mot>.png, 96 × 96 : Gmail et Outlook n'affichent pas le
// SVG) depuis packages/ui/family/, copie des originaux du site hgdc.ch. Ne jamais redessiner une
// pastille ici : changer l'original, le recopier dans family/, puis :
//
//   bun scripts/family.ts && bun run format
import { readFile, writeFile } from "node:fs/promises"
import { Resvg } from "@resvg/resvg-js"

const FAMILY = new URL("../packages/ui/family/", import.meta.url)
const EMAIL = new URL("../packages/ui/email-icons/", import.meta.url)
const PRODUCTS = ["account", "host", "mail", "portal", "status", "analytics", "docs"] as const

const svg = async (name: string) =>
  (await readFile(new URL(`${name}.svg`, FAMILY), "utf8")).replace(/\r\n/g, "\n").trim()

const badges: Array<string> = []
for (const product of PRODUCTS) {
  const text = await svg(product)
  badges.push(`  ${product}: ${JSON.stringify(text)},`)
  const png = new Resvg(text, { fitTo: { mode: "width", value: 96 } }).render().asPng()
  await writeFile(new URL(`${product}.png`, EMAIL), png)
}

const source = `// Généré par \`bun scripts/family.ts\` depuis \`packages/ui/family/\`. Ne pas modifier à la main.

/** Les produits de la H Collection qui ont une pastille, par leur mot en minuscules. */
export const FAMILY_PRODUCTS = ${JSON.stringify(PRODUCTS)} as const

export type FamilyProduct = (typeof FAMILY_PRODUCTS)[number]

/** Vrai si le mot en minuscules (« host ») désigne un produit qui a une pastille. */
export function isFamilyProduct(word: string): word is FamilyProduct {
  return (FAMILY_PRODUCTS as ReadonlyArray<string>).includes(word)
}

/** SVG de la pastille de chaque produit (\`family/<mot>.svg\`). */
export const PRODUCT_BADGE_SVG: Readonly<Record<FamilyProduct, string>> = {
${badges.join("\n")}
}

/** SVG du H tricolore, l'icône de la famille (\`family/hfamily-icon.svg\`). */
export const FAMILY_MARK_SVG = ${JSON.stringify(await svg("hfamily-icon"))}
`
await writeFile(new URL("../packages/ui/src/family-svg.ts", import.meta.url), source)
console.log(`family-svg.ts + ${PRODUCTS.length} icônes d'e-mail`)
