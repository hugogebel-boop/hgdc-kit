import type { AnswerSource, AskResponse } from "../core/assistant-api.ts"
import { parseMarkdown, type Block, type Inline } from "../core/answer-markdown.ts"

const FALLBACK_ERROR = "L'assistant ne répond pas pour l'instant. Réessaie dans un moment."

function isAnswer(value: unknown): value is AskResponse {
  const v = value as Partial<AskResponse> | null
  return Boolean(v && typeof v.answer === "string" && Array.isArray(v.sources) && typeof v.status === "string")
}

function errorMessage(value: unknown): string | null {
  const message = (value as { error?: { message?: unknown } } | null)?.error?.message
  return typeof message === "string" ? message : null
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function renderInline(parent: HTMLElement, nodes: Array<Inline>, sources: Map<number, AnswerSource>): void {
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        parent.append(node.value)
        break
      case "code":
        parent.append(el("code", undefined, node.value))
        break
      case "strong":
      case "em": {
        const child = el(node.type)
        renderInline(child, node.children, sources)
        parent.append(child)
        break
      }
      case "link": {
        const link = el("a")
        link.href = node.href
        link.rel = "noopener noreferrer"
        renderInline(link, node.children, sources)
        parent.append(link)
        break
      }
      case "ref": {
        const source = sources.get(node.n)
        if (!source) break
        const ref = el("a", "hgdc-ref", String(node.n))
        ref.href = source.url
        ref.title = source.section ? `${source.title} › ${source.section}` : source.title
        ref.setAttribute("aria-label", `Source ${node.n} : ${ref.title}`)
        parent.append(ref)
      }
    }
  }
}

function renderBlocks(blocks: Array<Block>, sources: Map<number, AnswerSource>): DocumentFragment {
  const fragment = document.createDocumentFragment()
  for (const block of blocks) {
    if (block.type === "code") {
      const pre = el("pre")
      pre.append(el("code", undefined, block.value))
      fragment.append(pre)
    } else if (block.type === "list") {
      const list = el(block.ordered ? "ol" : "ul")
      for (const item of block.items) {
        const li = el("li")
        renderInline(li, item, sources)
        list.append(li)
      }
      fragment.append(list)
    } else {
      const node = el(block.type === "heading" ? "h3" : "p")
      renderInline(node, block.children, sources)
      fragment.append(node)
    }
  }
  return fragment
}

class Assistant extends HTMLElement {
  /** Identifiants des réponses précédentes : le serveur relit lui-même la conversation. */
  private previous: Array<string> = []
  private pending = false
  private opener: HTMLElement | null = null

  private get askbar() {
    return document.querySelector<HTMLFormElement>("[data-askbar]")
  }
  private get askbarInput() {
    return document.querySelector<HTMLInputElement>("[data-askbar-input]")
  }
  private get input() {
    return this.querySelector<HTMLTextAreaElement>("[data-input]")!
  }
  private get log() {
    return this.querySelector<HTMLElement>("[data-log]")!
  }
  private get isOpen() {
    return document.documentElement.hasAttribute("data-hgdc-assistant")
  }

  connectedCallback(): void {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform)
    const shortcut = document.querySelector("[data-askbar] [data-shortcut]")
    if (shortcut) shortcut.textContent = mac ? "⌘ I" : "Ctrl I"

    // La barre du bas ouvre le panneau ; une question tapée y part tout de suite.
    this.askbar?.addEventListener("submit", (event) => {
      event.preventDefault()
      const input = this.askbarInput!
      const question = input.value.trim()
      input.value = ""
      this.toggle(true, input)
      if (question) void this.ask(question)
    })
    // Le voile de la feuille (téléphone) est dessiné par cet élément : un clic dessus ferme.
    this.addEventListener("click", (event) => {
      if (event.target === this) this.toggle(false)
    })
    this.querySelector("[data-close]")!.addEventListener("click", () => this.toggle(false))
    this.querySelector("[data-reset]")!.addEventListener("click", () => this.reset())
    this.querySelector("[data-form]")!.addEventListener("submit", (event) => {
      event.preventDefault()
      void this.ask()
    })
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault()
        void this.ask()
      }
    })
    this.input.addEventListener("input", () => this.autosize())
    document.addEventListener("click", (event) => {
      const trigger = (event.target as HTMLElement).closest<HTMLElement>("[data-hgdc-ask]")
      if (trigger) this.toggle(!this.isOpen, trigger)
    })
    document.addEventListener("hgdc:assistant-open", (event) => {
      const question = (event as CustomEvent<{ question?: string } | null>).detail?.question?.trim()
      this.toggle(true, document.activeElement as HTMLElement)
      if (question) void this.ask(question)
    })
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
        event.preventDefault()
        this.toggle(!this.isOpen, document.activeElement as HTMLElement)
      } else if (event.key === "Escape" && this.isOpen && !document.querySelector("dialog[open]")) this.toggle(false)
    })
    // Passage du téléphone à l'ordinateur panneau ouvert : la page redevient lisible ou inerte.
    matchMedia("(max-width: 50em)").addEventListener("change", () => {
      if (this.isOpen) this.toggle(true)
    })
  }

  private toggle(open: boolean, opener?: HTMLElement | null): void {
    const panel = this.querySelector<HTMLElement>("[data-panel]")!
    panel.inert = !open
    document.documentElement.toggleAttribute("data-hgdc-assistant", open)
    // Feuille du bas sur téléphone : modale, le reste de la page inerte. Sur ordinateur, le
    // panneau pousse la page, qui reste lisible et cliquable.
    const sheet = open && matchMedia("(max-width: 50em)").matches
    panel.setAttribute("aria-modal", String(sheet))
    for (const element of document.querySelectorAll<HTMLElement>(".hd-main-frame, .hd-topbar, .hd-sidebar"))
      element.toggleAttribute("inert", sheet)
    if (open) {
      if (opener && opener !== this.input) this.opener = opener
      this.input.focus({ preventScroll: true })
    } else {
      const back = this.opener?.isConnected ? this.opener : this.askbarInput
      this.opener = null
      back?.focus({ preventScroll: true })
    }
  }

  private autosize(): void {
    this.input.style.height = "auto"
    this.input.style.height = `${Math.min(this.input.scrollHeight, 160)}px`
  }

  private reset(): void {
    this.previous = []
    this.log.replaceChildren(this.querySelector("[data-empty]") ?? "")
    this.querySelector<HTMLElement>("[data-empty]")!.hidden = false
    this.querySelector<HTMLElement>("[data-reset]")!.hidden = true
    this.input.focus()
  }

  private bubble(role: "user" | "assistant", className = ""): HTMLElement {
    const node = el("div", `hgdc-msg hgdc-msg--${role} ${className}`.trim())
    this.log.append(node)
    node.scrollIntoView({
      block: "end",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    })
    return node
  }

  private async ask(retry?: string): Promise<void> {
    const question = (retry ?? this.input.value).trim()
    if (this.pending || question.length < 2) return
    this.pending = true
    this.querySelector<HTMLElement>("[data-empty]")!.hidden = true
    this.querySelector<HTMLElement>("[data-reset]")!.hidden = false
    this.querySelector<HTMLButtonElement>("[data-send]")!.disabled = true
    if (!retry) {
      this.bubble("user").textContent = question
      this.input.value = ""
      this.autosize()
    }
    const thinking = this.bubble("assistant", "hgdc-msg--pending")
    thinking.textContent = "Je cherche dans la documentation…"
    thinking.setAttribute("aria-busy", "true")

    try {
      const response = await fetch(this.dataset.endpoint!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project: this.dataset.project,
          question,
          page: location.pathname,
          previous: this.previous.slice(-3),
        }),
      })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok || !isAnswer(body)) throw new Error(errorMessage(body) ?? FALLBACK_ERROR)
      thinking.remove()
      this.showAnswer(body)
      if (body.status === "answered") this.previous.push(body.id)
    } catch (error) {
      thinking.remove()
      this.showError(
        error instanceof Error && error.message !== "Failed to fetch" ? error.message : FALLBACK_ERROR,
        question,
      )
    } finally {
      this.pending = false
      this.querySelector<HTMLButtonElement>("[data-send]")!.disabled = false
    }
  }

  private showAnswer(answer: AskResponse): void {
    const node = this.bubble("assistant", answer.status === "no_answer" ? "hgdc-msg--empty" : "")
    const sources = new Map(answer.sources.map((source) => [source.n, source]))
    node.append(renderBlocks(parseMarkdown(answer.answer, [location.origin]), sources))
    if (answer.sources.length) {
      const list = el("ol", "hgdc-sources")
      list.setAttribute("aria-label", "Sources")
      for (const source of answer.sources) {
        const item = el("li")
        const link = el("a")
        link.href = source.url
        link.append(el("span", "hgdc-sources__n", String(source.n)), el("span", undefined, source.title))
        if (source.section) link.append(el("span", "hgdc-sources__section", source.section))
        item.append(link)
        list.append(item)
      }
      node.append(el("p", "hgdc-sources__label", "Sources"), list)
    }
  }

  private showError(message: string, question: string): void {
    const node = this.bubble("assistant", "hgdc-msg--error")
    node.append(el("p", undefined, message))
    const retry = el("button", "hgdc-retry", "Réessayer")
    retry.type = "button"
    retry.addEventListener("click", () => {
      node.remove()
      void this.ask(question)
    })
    node.append(retry)
  }
}

export function defineAssistant(): void {
  if (!customElements.get("hgdc-assistant")) customElements.define("hgdc-assistant", Assistant)
}
