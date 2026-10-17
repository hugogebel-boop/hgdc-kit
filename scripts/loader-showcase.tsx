// Maquette du chargeur H (ADR 0015) : la page qui attend hors de la coque (cadre de la coque, H au
// centre de la zone de contenu) et le H en ligne aux trois tailles. Lancé seul, écrit une page HTML
// à ouvrir dans un navigateur ; `?t=<ms>` fige la boucle à cet instant, pour des captures par image.
//
//   bun scripts/loader-showcase.tsx [dossier]     (.loader-showcase/ par défaut)
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { transform } from "lightningcss"
import { renderToString } from "react-dom/server"

import { FamilyLoader, FamilyLoaderRoot } from "../packages/ui/src/family-loader.tsx"
import { PagePending } from "../packages/ui/src/page-pending.tsx"

/** Jetons que Tailwind sort de `@theme` dans un produit : la maquette n'a pas Tailwind. */
const THEME_SHIM = `:root{--ease-out:cubic-bezier(0.23,1,0.32,1);--ease-in-out:cubic-bezier(0.77,0,0.175,1)}
body{margin:0;font:14px/1.4 system-ui,sans-serif;background:var(--background);color:var(--foreground)}
.inline{position:fixed;z-index:30;left:50%;bottom:24px;transform:translateX(-50%);display:flex;gap:24px;align-items:center;padding:12px 20px;border-radius:16px;background:var(--background);box-shadow:0 1px 3px #0002}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}`

/** `?t=<ms>` : chaque animation du H figée à cet instant de la boucle (captures par image). */
const FREEZE = `(function(){var t=new URLSearchParams(location.search).get("t");if(t===null)return;
function f(){document.getAnimations().forEach(function(a){a.pause();a.currentTime=Number(t)})}
addEventListener("load",function(){setTimeout(function(){f();document.documentElement.dataset.frozen=""},100)})})()`

export async function renderLoaderShowcase(): Promise<string> {
  const source = await readFile(join(import.meta.dir, "..", "packages", "ui", "styles.css"), "utf8")
  const css = transform({ filename: "styles.css", code: Buffer.from(source), errorRecovery: true }).code.toString()
  const body = renderToString(
    <FamilyLoaderRoot>
      <PagePending label="Ouverture de Mail" />
      <div className="inline" aria-label="H en ligne">
        <FamilyLoader size="sm" />
        <FamilyLoader size="md" />
        <FamilyLoader size="lg" />
      </div>
    </FamilyLoaderRoot>,
  )
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Chargeur H</title><script>if(new URLSearchParams(location.search).has("dark"))document.documentElement.classList.add("dark");${FREEZE}</script>
<style>${css}</style><style>${THEME_SHIM}</style></head><body>${body}</body></html>`
}

if (import.meta.main) {
  const dir = process.argv[2] ?? ".loader-showcase"
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, "index.html"), await renderLoaderShowcase())
  console.log(join(dir, "index.html"))
}
