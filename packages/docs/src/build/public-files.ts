import { existsSync, readdirSync, statSync } from "node:fs"
import { extname, join, relative } from "node:path"

const IGNORED_DIRS = new Set(["node_modules", "dist", ".hgdc-docs", ".git", ".github", ".vercel"])

/** Dossiers d'images publiés tels quels ; `public/` est servi à la racine du site. */
export const ASSET_DIRS = ["images", "img", "logo", "assets", "static"]
const MEDIA = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg", ".ico", ".mp4", ".webm", ".woff2"])

/**
 * Fichiers statiques publiés, et seulement ceux-là : le logo et le favicon déclarés dans
 * docs.json, les médias des dossiers d'images (`images/`, `logo/`…), et tout `public/`.
 * Un `.txt` ou un `.pdf` oublié ailleurs dans le dépôt n'est jamais mis en ligne.
 */
export function publicFiles(contentDir: string, declared: ReadonlyArray<string>): Array<{ from: string; to: string }> {
  const files: Array<{ from: string; to: string }> = []
  const walk = (dir: string, onlyMedia: boolean, base: string) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || IGNORED_DIRS.has(name)) continue
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path, onlyMedia, base)
      else if (!onlyMedia || MEDIA.has(extname(name).toLowerCase()))
        files.push({ from: path, to: relative(base, path) })
    }
  }
  for (const folder of ASSET_DIRS) walk(join(contentDir, folder), true, contentDir)
  walk(join(contentDir, "public"), false, join(contentDir, "public"))
  for (const asset of declared) {
    const from = join(contentDir, asset.replace(/^\/+/, ""))
    if (relative(contentDir, from).startsWith("..") || !existsSync(from)) continue
    files.push({ from, to: relative(contentDir, from) })
  }
  return files
}

/** Fichier publié tel quel (chemin relatif à la doc) : média d'un dossier d'images, ou `public/`. */
export function isPublishedAsset(path: string): boolean {
  const [folder, ...rest] = path.split("/")
  if (!folder || !rest.length || rest.some((part) => part.startsWith(".") || IGNORED_DIRS.has(part))) return false
  if (folder === "public") return true
  return ASSET_DIRS.includes(folder) && MEDIA.has(extname(path).toLowerCase())
}
