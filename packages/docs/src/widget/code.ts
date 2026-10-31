/**
 * Blocs de code : onglets de `<CodeGroup>`, et trois actions sur chaque bloc (signaler un
 * code faux, copier, demander à l'assistant). Les boutons sont ajoutés par script : sans
 * JavaScript, le code reste lisible et sélectionnable.
 */

import { ICON_PATHS } from "../core/icons.ts"

type IconName = "flag" | "copy" | "check" | "sparkles" | "chevron-down"

function svg(name: IconName): string {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON_PATHS[name]}"/></svg>`
}

function button(label: string, icon: IconName): HTMLButtonElement {
  const node = document.createElement("button")
  node.type = "button"
  node.className = "hd-code-action"
  node.setAttribute("aria-label", label)
  node.title = label
  node.innerHTML = svg(icon)
  return node
}

const codeOf = (frame: Element) =>
  (frame.querySelector("pre") as HTMLElement | null)?.innerText.replace(/\n$/, "") ?? ""

type Feedback = { endpoint: string; project: string } | null

function feedbackTarget(): Feedback {
  const host = document.querySelector<HTMLElement>("hgdc-feedback")
  return host?.dataset.endpoint && host.dataset.project
    ? { endpoint: host.dataset.endpoint, project: host.dataset.project }
    : null
}

/** Boîte « Signaler un code faux » : une seule à la fois, sous le bloc concerné. */
function openReport(frame: HTMLElement, trigger: HTMLButtonElement, target: NonNullable<Feedback>): void {
  document.querySelector(".hd-report")?.remove()
  document.querySelector(".hd-code-active")?.classList.remove("hd-code-active")
  frame.classList.add("hd-code-active")
  const box = document.createElement("form")
  box.className = "hd-report"
  box.setAttribute("aria-label", "Signaler un code faux")
  box.innerHTML = `
    <p class="hd-report__title">Signaler un code faux</p>
    <p class="hd-report__hint">Dis ce qui ne marche pas : la commande, la valeur, le message d'erreur.</p>
    <label class="sr-only" for="hd-report-text">Ce qui ne va pas dans ce code</label>
    <textarea id="hd-report-text" rows="3" maxlength="1000" required placeholder="Qu'est-ce qui ne va pas ?"></textarea>
    <div class="hd-report__actions">
      <button type="button" class="hd-pill hd-pill--ghost" data-cancel>Annuler</button>
      <button type="submit" class="hd-pill hd-pill--primary">Envoyer</button>
    </div>`
  const close = (focus = true) => {
    box.remove()
    frame.classList.remove("hd-code-active")
    if (focus) trigger.focus()
  }
  box.querySelector("[data-cancel]")!.addEventListener("click", () => close())
  box.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation()
      close()
    }
  })
  box.addEventListener("submit", (event) => {
    event.preventDefault()
    const comment = box.querySelector("textarea")!.value.trim()
    if (!comment) return
    void fetch(target.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        project: target.project,
        page: location.pathname,
        helpful: false,
        kind: "code",
        comment,
        code: codeOf(frame).slice(0, 2000),
      }),
      keepalive: true,
    }).catch(() => undefined)
    box.innerHTML = '<p class="hd-report__title" role="status">Merci, c\'est noté.</p>'
    setTimeout(() => close(false), 1800)
  })
  frame.after(box)
  box.querySelector("textarea")!.focus()
}

function decorate(frame: HTMLElement): void {
  if (frame.querySelector(".hd-code-actions")) return
  const bar = document.createElement("div")
  bar.className = "hd-code-actions"
  const target = feedbackTarget()
  if (target) {
    const report = button("Signaler un code faux", "flag")
    report.addEventListener("click", () => openReport(frame, report, target))
    bar.append(report)
  }
  // `nocopy` (Mintlify) : pas de bouton Copier sur ce bloc.
  const block = frame.closest<HTMLElement>("[data-hd-nocopy]")
  const copy = button("Copier le code", "copy")
  if (block) copy.hidden = true
  copy.addEventListener("click", () => {
    navigator.clipboard.writeText(codeOf(frame)).then(
      () => {
        copy.innerHTML = svg("check")
        copy.setAttribute("aria-label", "Code copié")
        setTimeout(() => {
          copy.innerHTML = svg("copy")
          copy.setAttribute("aria-label", "Copier le code")
        }, 1600)
      },
      () => copy.setAttribute("aria-label", "Copie impossible"),
    )
  })
  bar.append(copy)
  if (document.querySelector("hgdc-assistant")) {
    const ask = button("Demander à l'assistant", "sparkles")
    ask.addEventListener("click", () => {
      const question = `Explique ce code de la page « ${document.title.split(" | ")[0]} » :\n${codeOf(frame).slice(0, 800)}`
      document.dispatchEvent(new CustomEvent("hgdc:assistant-open", { detail: { question } }))
    })
    bar.append(ask)
  }
  frame.append(bar)
  if (frame.matches("[data-hd-expandable]")) expandable(frame)
}

/** Lignes montrées d'un bloc `expandable` replié ; au-delà, « Afficher tout le code ». */
const FOLDED_LINES = 10

function expandable(frame: HTMLElement): void {
  const count = frame.querySelectorAll(".ec-line").length
  if (count <= FOLDED_LINES + 2) return
  frame.dataset.hdFolded = ""
  const toggle = document.createElement("button")
  toggle.type = "button"
  toggle.className = "hd-code-expand"
  const label = () => {
    const folded = "hdFolded" in frame.dataset
    toggle.setAttribute("aria-expanded", String(!folded))
    toggle.innerHTML = `${svg("chevron-down")}<span>${folded ? `Afficher tout le code (${count} lignes)` : "Replier le code"}</span>`
  }
  toggle.addEventListener("click", () => {
    if ("hdFolded" in frame.dataset) delete frame.dataset.hdFolded
    else frame.dataset.hdFolded = ""
    label()
  })
  label()
  frame.append(toggle)
}

class CodeGroup extends HTMLElement {
  connectedCallback(): void {
    const blocks = [...this.querySelectorAll<HTMLElement>(":scope > .expressive-code, :scope > * > .expressive-code")]
    if (blocks.length < 2) return
    const list = document.createElement("div")
    list.className = "hd-code-tabs"
    list.setAttribute("role", "tablist")
    const tabs = blocks.map((block, index) => {
      const title =
        block.querySelector(".title")?.textContent?.trim() ||
        block.querySelector("pre")?.dataset.language ||
        `Code ${index + 1}`
      const tab = document.createElement("button")
      tab.type = "button"
      tab.setAttribute("role", "tab")
      tab.textContent = title
      tab.id = `${this.id || "hd-cg"}-${Math.random().toString(36).slice(2, 8)}`
      block.setAttribute("role", "tabpanel")
      block.setAttribute("aria-labelledby", tab.id)
      tab.addEventListener("click", () => select(index))
      return tab
    })
    const select = (index: number, focus = false) => {
      tabs.forEach((tab, i) => {
        tab.setAttribute("aria-selected", String(i === index))
        tab.tabIndex = i === index ? 0 : -1
        blocks[i]!.hidden = i !== index
      })
      if (focus) tabs[index]!.focus()
    }
    list.addEventListener("keydown", (event) => {
      const current = tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true")
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
      if (!step) return
      event.preventDefault()
      select((current + step + tabs.length) % tabs.length, true)
    })
    list.append(...tabs)
    if ("dropdown" in this.dataset) {
      // `dropdown` (Mintlify) : les mêmes panneaux, choisis dans une liste plutôt qu'en onglets.
      const picker = document.createElement("select")
      picker.className = "hd-code-select"
      picker.setAttribute("aria-label", "Variante du code")
      tabs.forEach((tab, index) => picker.append(new Option(tab.textContent ?? "", String(index))))
      picker.addEventListener("change", () => select(Number(picker.value)))
      list.replaceChildren(picker)
      list.removeAttribute("role")
    }
    this.prepend(list)
    this.dataset.ready = ""
    select(0)
  }
}

/** Zoom des images du contenu : un clic ouvre l'image en grand, Échap ou un clic la referme. */
function enableZoom(): void {
  const images = document.querySelectorAll<HTMLImageElement>(".sl-markdown-content img:not(a img):not(.hgdc-card img)")
  if (!images.length) return
  let dialog: HTMLDialogElement | null = null
  for (const image of images) {
    if (image.naturalWidth && image.naturalWidth < 120) continue
    image.classList.add("hd-zoomable")
    image.tabIndex = 0
    image.setAttribute("role", "button")
    image.setAttribute("aria-label", image.alt ? `Agrandir : ${image.alt}` : "Agrandir l'image")
    const open = () => {
      if (!dialog) {
        dialog = document.createElement("dialog")
        dialog.className = "hd-zoom"
        dialog.setAttribute("aria-label", "Image agrandie")
        dialog.addEventListener("click", () => dialog!.close())
        document.body.append(dialog)
      }
      const copy = image.cloneNode() as HTMLImageElement
      copy.removeAttribute("role")
      copy.removeAttribute("tabindex")
      copy.className = ""
      dialog.replaceChildren(copy)
      dialog.showModal()
    }
    image.addEventListener("click", open)
    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        open()
      }
    })
  }
}

export function defineCodeGroup(): void {
  if (!customElements.get("hd-code-group")) customElements.define("hd-code-group", CodeGroup)
}

export function enhanceContent(): void {
  for (const frame of document.querySelectorAll<HTMLElement>(".sl-markdown-content .expressive-code figure.frame"))
    decorate(frame)
  enableZoom()
}
