/**
 * Pont entre l'aperçu et la console qui l'encadre (ADR 0011). Injecté par `devServer` de
 * `integration.ts` dans l'aperçu seulement, jamais dans un site construit.
 *
 * - Mention « Aperçu, non publié » posée par-dessus la page, sans la décaler.
 * - La console choisit le thème ; l'aperçu lui dit quelle page est affichée.
 * - Seuls les messages de la console (`__HGDC_PREVIEW_PARENT__`) sont écoutés.
 */
import { isPreviewCommand, PREVIEW_MESSAGE, RENEW_PATH, type PreviewEvent } from "../core/preview.ts"

declare global {
  interface Window {
    __HGDC_PREVIEW_PARENT__?: string
  }
}

const parentOrigin = window.__HGDC_PREVIEW_PARENT__ ?? null
const framed = window.parent !== window

function badge() {
  if (document.querySelector("hgdc-preview-badge")) return
  const host = document.createElement("hgdc-preview-badge")
  const root = host.attachShadow({ mode: "open" })
  root.innerHTML = `<style>
    :host { position: fixed; z-index: 2147483000; left: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); pointer-events: none; }
    /* Téléphone : au-dessus de la barre « Pose une question… », collée au bas de l'écran. */
    @media (max-width: 799px) { :host { bottom: calc(88px + env(safe-area-inset-bottom, 0px)); } }
    span { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px;
      font: 500 12px/1.4 system-ui, sans-serif; color: #fff; background: rgb(24 24 27 / 0.88);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); }
    i { width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; }
  </style><span role="status"><i aria-hidden="true"></i>Aperçu, non publié</span>`
  document.body.append(host)
}

function setTheme(theme: "light" | "dark") {
  const radio = document.querySelector<HTMLButtonElement>(`[data-hd-theme-choice="${theme}"]`)
  if (radio) return radio.click()
  try {
    localStorage.setItem("starlight-theme", theme)
  } catch {
    // Stockage refusé : le thème vaut pour la page affichée.
  }
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.hdTheme = theme
}

function post(event: PreviewEvent) {
  if (framed && parentOrigin) window.parent.postMessage({ [PREVIEW_MESSAGE]: event }, parentOrigin)
}

window.addEventListener("message", (event) => {
  if (!parentOrigin || event.origin !== parentOrigin || event.source !== window.parent) return
  const command = (event.data as Record<string, unknown> | null)?.[PREVIEW_MESSAGE]
  if (!isPreviewCommand(command)) return
  if (command.type === "theme") setTheme(command.theme)
  // Jeton frais de la console : le cookie de l'aperçu est reposé pour une heure, sans recharger.
  else void fetch(RENEW_PATH, { method: "POST", body: command.token, credentials: "same-origin" }).catch(() => {})
})

badge()
post({ type: "location", path: location.pathname, hash: location.hash, title: document.title })
window.addEventListener("hashchange", () =>
  post({ type: "location", path: location.pathname, hash: location.hash, title: document.title }),
)
