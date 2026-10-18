// Copie des icônes du kit dans un produit ou un site, au build et au démarrage du dev (`hgdc-brand`).
// Les produits ne versionnent plus ces fichiers : les icônes suivent la version de `@hgdc/ui`
// installée (ADR 0017, runbook `docs/runbooks/changer-une-icone.md`).
import { copyFile, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { FAMILY_PRODUCTS, isFamilyProduct, type FamilyProduct } from "./family-svg.ts"

const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url))

/** Fichiers de `family/app/<mot>/`, servis à la racine du produit (favicon, icônes d'application). */
export const APP_ICON_FILES = [
  "favicon.svg",
  "favicon.ico",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
] as const

export type Copy = Readonly<{ from: string; to: string }>

function assertProduct(word: string): FamilyProduct {
  if (!isFamilyProduct(word)) throw new Error(`produit inconnu « ${word} » (attendu : ${FAMILY_PRODUCTS.join(", ")})`)
  return word
}

/** Nom de fichier simple, sans dossier : une copie ne sort jamais du dossier cible. */
function assertFileName(name: string): string {
  if (!/^[\w.-]+$/.test(name) || name.startsWith(".")) throw new Error(`nom de fichier invalide « ${name} »`)
  return name
}

/**
 * Copies qui posent les icônes d'un produit dans `publicDir` : `family/app/<mot>/*`, plus l'icône
 * d'e-mail du produit sous chaque nom de `emailAs` (adresses déjà parties dans des e-mails).
 */
export function appIconCopies(word: string, publicDir: string, emailAs: ReadonlyArray<string> = []): Array<Copy> {
  const product = assertProduct(word)
  return [
    ...APP_ICON_FILES.map((file) => ({
      from: join(PACKAGE_ROOT, "family", "app", product, file),
      to: join(publicDir, file),
    })),
    ...emailAs.map((name) => ({
      from: join(PACKAGE_ROOT, "email-icons", `${product}.png`),
      to: join(publicDir, assertFileName(name)),
    })),
  ]
}

/** Copies des icônes d'e-mail de tous les produits (`<mot>.png`) dans `dir`, pour le site qui les sert. */
export function emailIconCopies(dir: string): Array<Copy> {
  return FAMILY_PRODUCTS.map((product) => ({
    from: join(PACKAGE_ROOT, "email-icons", `${product}.png`),
    to: join(dir, `${product}.png`),
  }))
}

export async function runCopies(copies: ReadonlyArray<Copy>): Promise<void> {
  for (const { from, to } of copies) {
    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
  }
}
