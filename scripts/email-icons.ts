// Icônes des e-mails : une bulle violette (celle de HGDC Mail et Host) portant l'icône du catalogue,
// en PNG 96 × 96 : Gmail et Outlook n'affichent pas le SVG. Écrites dans packages/ui/email-icons/,
// publiées avec @hgdc/ui et servies par hgdc.ch sous /email/<mot>.png (EMAIL_ICON_BASE).
//
//   bun scripts/email-icons.ts
import { mkdir, writeFile } from "node:fs/promises"
import { Resvg } from "@resvg/resvg-js"

import { HGDC_ACCOUNT, HGDC_PRODUCTS } from "../packages/ui/src/products.ts"

const OUT = new URL("../packages/ui/email-icons/", import.meta.url)
const SIZE = 96
const GLYPH_SCALE = 12
const GLYPH_OFFSET = (512 - 24 * GLYPH_SCALE) / 2

type Node = readonly [string, Readonly<Record<string, string | number>>]

function attribute(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

function glyph(nodes: ReadonlyArray<Node>): string {
  return nodes
    .map(([tag, attrs]) => {
      const rendered = Object.entries(attrs)
        .filter(([name]) => name !== "key")
        .map(([name, value]) => {
          const v = name === "strokeWidth" ? "2" : String(value).replace("currentColor", "#fff")
          return `${attribute(name)}="${v}"`
        })
        .join(" ")
      return `<${tag} ${rendered}/>`
    })
    .join("")
}

function bubble(nodes: ReadonlyArray<Node>): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
<linearGradient id="sky" x1="0" y1="66" x2="0" y2="446" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3433b7"/><stop offset=".5" stop-color="#633cd6"/><stop offset="1" stop-color="#a357d3"/></linearGradient>
<radialGradient id="shine" cx="256" cy="430" r="230" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#d9a6f0" stop-opacity=".55"/><stop offset="1" stop-color="#d9a6f0" stop-opacity="0"/></radialGradient>
</defs>
<circle cx="256" cy="256" r="250" fill="url(#sky)"/><circle cx="256" cy="256" r="250" fill="url(#shine)"/>
<g fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(${GLYPH_OFFSET} ${GLYPH_OFFSET}) scale(${GLYPH_SCALE})">${glyph(nodes)}</g>
</svg>`
}

await mkdir(OUT, { recursive: true })
for (const product of [HGDC_ACCOUNT, ...HGDC_PRODUCTS]) {
  const svg = bubble(product.icon as unknown as ReadonlyArray<Node>)
  const png = new Resvg(svg, { fitTo: { mode: "width", value: SIZE } }).render().asPng()
  const file = new URL(`${product.word.toLowerCase()}.png`, OUT)
  await writeFile(file, png)
  console.log(`${product.word} : ${file.pathname} (${png.length} octets)`)
}
