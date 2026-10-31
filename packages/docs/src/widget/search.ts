/** Palette de recherche : Pagefind en lecture seule, chargé à la demande. */

import { safeExcerpt } from "./excerpt.ts"

type SubResult = { title: string; url: string; excerpt: string }
type ResultData = {
  url: string
  excerpt: string
  meta: { title?: string; section?: string }
  sub_results?: Array<SubResult>
}
type Pagefind = {
  options: (options: Record<string, unknown>) => Promise<void>
  debouncedSearch: (
    query: string,
    options?: unknown,
    ms?: number,
  ) => Promise<{ results: Array<{ data: () => Promise<ResultData> }> } | null>
}

type Option = { href?: string; title: string; context: string; excerpt: string; kind: "page" | "heading" | "ask" }

const MAX_PAGES = 8

function toOptions(results: Array<ResultData>): Array<Option> {
  return results.flatMap((result) => {
    const title = result.meta.title ?? result.url
    const page: Option = {
      href: result.url,
      title,
      context: result.meta.section ?? "",
      excerpt: result.excerpt,
      kind: "page",
    }
    const headings = (result.sub_results ?? [])
      .filter((sub) => sub.url !== result.url && sub.title !== title)
      .slice(0, 3)
      .map((sub): Option => ({
        href: sub.url,
        title: sub.title,
        context: title,
        excerpt: sub.excerpt,
        kind: "heading",
      }))
    return [page, ...headings]
  })
}

class Search extends HTMLElement {
  private pagefind: Promise<Pagefind | null> | null = null
  private active = 0

  private get dialog() {
    return this.querySelector("dialog")!
  }
  private get input() {
    return this.querySelector<HTMLInputElement>("[data-input]")!
  }
  private get list() {
    return this.querySelector<HTMLElement>("[data-results]")!
  }
  private get status() {
    return this.querySelector<HTMLElement>("[data-status]")!
  }

  connectedCallback(): void {
    const mac = /Mac|iPhone|iPad/.test(navigator.platform)
    const shortcut = this.querySelector("[data-shortcut]")
    if (shortcut) shortcut.textContent = mac ? "⌘ K" : "Ctrl K"
    this.querySelector("[data-open]")!.addEventListener("click", () => this.open())
    this.querySelector("[data-close]")!.addEventListener("click", () => this.dialog.close())
    // Un clic sur le voile ferme la palette, un clic dans la boîte non.
    this.dialog.addEventListener("click", (event) => {
      if (event.target === this.dialog) this.dialog.close()
    })
    this.input.addEventListener("input", () => void this.search(this.input.value))
    this.input.addEventListener("keydown", (event) => this.keydown(event))
    document.addEventListener("keydown", (event) => {
      const typing = event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable]")
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        if (this.dialog.open) this.dialog.close()
        else this.open()
      } else if (event.key === "/" && !typing && !this.dialog.open) {
        event.preventDefault()
        this.open()
      }
    })
  }

  private open(): void {
    this.dialog.showModal()
    this.input.select()
    void this.load()
  }

  private load(): Promise<Pagefind | null> {
    this.pagefind ??= (async () => {
      try {
        const url = `${this.dataset.base ?? ""}/pagefind/pagefind.js`
        const module = (await import(/* @vite-ignore */ url)) as Pagefind
        await module.options({ excerptLength: 18 })
        return module
      } catch {
        return null
      }
    })()
    return this.pagefind
  }

  private async search(query: string): Promise<void> {
    const text = query.trim()
    if (!text) {
      this.render([], "Tape un mot pour chercher dans les pages.")
      return
    }
    const pagefind = await this.load()
    if (!pagefind) {
      this.render(this.askOption(text), "La recherche fonctionne sur le site publié.")
      return
    }
    const response = await pagefind.debouncedSearch(text, {}, 120)
    // `null` : une frappe plus récente a remplacé celle-ci.
    if (!response || this.input.value.trim() !== text) return
    const data = await Promise.all(response.results.slice(0, MAX_PAGES).map((result) => result.data()))
    const options = [...toOptions(data), ...this.askOption(text)]
    this.render(
      options,
      data.length
        ? `${data.length} page${data.length > 1 ? "s" : ""} trouvée${data.length > 1 ? "s" : ""}.`
        : `Aucune page ne parle de « ${text} ».`,
    )
  }

  private askOption(text: string): Array<Option> {
    return this.dataset.assistant === undefined
      ? []
      : [{ title: `Demander à l'assistant : « ${text} »`, context: "", excerpt: "", kind: "ask" }]
  }

  private render(options: Array<Option>, status: string): void {
    this.active = 0
    this.status.textContent = status
    this.list.replaceChildren(
      ...options.map((option, index) => {
        const item = document.createElement(option.href ? "a" : "button")
        item.className = `hd-result hd-result--${option.kind}`
        item.id = `hd-result-${index}`
        item.setAttribute("role", "option")
        item.tabIndex = -1
        if (item instanceof HTMLAnchorElement) item.href = option.href!
        else item.type = "button"
        const icon = document.createElement("span")
        icon.className = "hd-result__icon"
        icon.setAttribute("aria-hidden", "true")
        icon.textContent = option.kind === "heading" ? "#" : option.kind === "ask" ? "✦" : ""
        const body = document.createElement("span")
        body.className = "hd-result__body"
        const title = document.createElement("span")
        title.className = "hd-result__title"
        title.textContent = option.title
        body.append(title)
        if (option.context) {
          const context = document.createElement("span")
          context.className = "hd-result__context"
          context.textContent = option.context
          body.append(context)
        }
        if (option.excerpt) {
          const excerpt = document.createElement("span")
          excerpt.className = "hd-result__excerpt"
          excerpt.innerHTML = safeExcerpt(option.excerpt)
          body.append(excerpt)
        }
        item.append(icon, body)
        item.addEventListener("click", (event) => {
          if (option.kind === "ask") {
            event.preventDefault()
            this.ask()
          } else this.dialog.close()
        })
        item.addEventListener("mousemove", () => this.highlight(index))
        return item
      }),
    )
    this.input.setAttribute("aria-expanded", String(options.length > 0))
    this.highlight(0)
  }

  private highlight(index: number): void {
    const items = [...this.list.children] as Array<HTMLElement>
    this.active = Math.max(0, Math.min(index, items.length - 1))
    items.forEach((item, i) => item.setAttribute("aria-selected", String(i === this.active)))
    const current = items[this.active]
    if (current) {
      this.input.setAttribute("aria-activedescendant", current.id)
      current.scrollIntoView({ block: "nearest" })
    } else this.input.removeAttribute("aria-activedescendant")
  }

  private keydown(event: KeyboardEvent): void {
    // Échap ferme d'un coup, même avec du texte dans le champ.
    if (event.key === "Escape") {
      event.preventDefault()
      this.dialog.close()
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      this.highlight(this.active + (event.key === "ArrowDown" ? 1 : -1))
    } else if (event.key === "Enter") {
      const current = this.list.children[this.active] as HTMLElement | undefined
      if (!current) return
      event.preventDefault()
      current.click()
    }
  }

  private ask(): void {
    const question = this.input.value.trim()
    this.dialog.close()
    document.dispatchEvent(new CustomEvent("hgdc:assistant-open", { detail: { question } }))
  }
}

export function defineSearch(): void {
  if (!customElements.get("hd-search")) customElements.define("hd-search", Search)
}
