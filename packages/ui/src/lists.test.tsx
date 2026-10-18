// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CursorPager, rangeLabel } from "./cursor-pager.tsx"
import { FIRST_PAGE, PAGE_SIZE, nextPage, previousPage, useCursorPages, type CursorPageResult } from "./cursor-pages.ts"
import { ProjectMark, ProjectSwitcher } from "./project-switcher.tsx"

afterEach(cleanup)

/** Le `Link` d'un routeur : il reçoit les props du menu et rend un vrai lien. */
function RouterLink({ to, ...props }: React.ComponentProps<"a"> & { to: string }): React.JSX.Element {
  // oxlint-disable-next-line jsx-a11y/anchor-has-content -- le contenu vient du menu, par les props
  return <a {...props} href={to} data-router="oui" />
}

const rows = (n: number): Array<number> => Array.from({ length: n }, (_, i) => i)
const result = (n: number, continueCursor: string, isDone = false): CursorPageResult => ({
  page: rows(n),
  isDone,
  continueCursor,
})

describe("pile de curseurs", () => {
  it("empile le curseur suivant et le décompte des lignes", () => {
    const two = nextPage(FIRST_PAGE, 0, result(200, "c1"))
    expect(two).toEqual({ index: 1, cursors: [null, "c1"], offsets: [0, 200] })
    const three = nextPage(two, 1, result(200, "c2"))
    expect(three).toEqual({ index: 2, cursors: [null, "c1", "c2"], offsets: [0, 200, 400] })
  })

  it("revient en arrière puis repart sur les mêmes curseurs, sans rien réempiler", () => {
    const three = nextPage(nextPage(FIRST_PAGE, 0, result(200, "c1")), 1, result(200, "c2"))
    const back = previousPage(previousPage(three, 2), 1)
    expect(back.index).toBe(0)
    // Un résultat différent (la liste a bougé) ne remplace pas la borne déjà connue.
    const again = nextPage(back, 0, result(203, "autre"))
    expect(again).toEqual({ index: 1, cursors: [null, "c1", "c2"], offsets: [0, 200, 400] })
  })

  it("ignore un double clic et les bords", () => {
    const two = nextPage(FIRST_PAGE, 0, result(200, "c1"))
    expect(nextPage(two, 0, result(200, "c1"))).toBe(two)
    expect(previousPage(FIRST_PAGE, 0)).toBe(FIRST_PAGE)
    expect(nextPage(FIRST_PAGE, 0, result(12, "fin", true))).toBe(FIRST_PAGE)
  })
})

describe("useCursorPages", () => {
  it("donne les options de paginate, avec la fin de page une fois la suivante connue", () => {
    const { result: hook } = renderHook(() => useCursorPages("tous"))
    expect(hook.current.paginationOpts).toEqual({ numItems: PAGE_SIZE, cursor: null })
    act(() => hook.current.next(result(200, "c1")))
    expect(hook.current.pageIndex).toBe(1)
    expect(hook.current.offset).toBe(200)
    expect(hook.current.paginationOpts).toEqual({ numItems: 200, cursor: "c1" })
    act(() => hook.current.previous())
    expect(hook.current.paginationOpts).toEqual({ numItems: 200, cursor: null, endCursor: "c1" })
    expect(hook.current.hasPrevious).toBe(false)
  })

  it("revient à la première page quand les filtres changent", () => {
    const { result: hook, rerender } = renderHook(({ key }) => useCursorPages(key, { pageSize: 50 }), {
      initialProps: { key: "statut=ok" },
    })
    act(() => hook.current.next(result(50, "c1")))
    act(() => hook.current.next(result(50, "c2")))
    expect(hook.current.pageIndex).toBe(2)
    rerender({ key: "statut=erreur" })
    expect(hook.current.pageIndex).toBe(0)
    expect(hook.current.paginationOpts).toEqual({ numItems: 50, cursor: null })
    // Et la nouvelle liste repart de sa première page.
    act(() => hook.current.next(result(50, "x")))
    expect(hook.current.paginationOpts.cursor).toBe("x")
  })
})

describe("CursorPager", () => {
  it("affiche les lignes de la page et passe à la suivante", () => {
    const { result: hook } = renderHook(() => useCursorPages("k"))
    const page = result(200, "c1")
    const { rerender } = render(<CursorPager pages={hook.current} result={page} />)
    expect(screen.getByRole("navigation", { name: "Pagination" }).textContent).toContain("Lignes 1 à 200")
    expect((screen.getByRole("button", { name: /Précédent/ }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }))
    expect(hook.current.pageIndex).toBe(1)
    rerender(<CursorPager pages={hook.current} result={result(37, "fin", true)} />)
    expect(screen.getByRole("navigation").textContent).toContain("Lignes 201 à 237")
    expect((screen.getByRole("button", { name: /Suivant/ }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: /Précédent/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("garde sa place pendant le chargement, boutons désactivés", () => {
    const { result: hook } = renderHook(() => useCursorPages("k"))
    render(<CursorPager pages={hook.current} result={undefined} />)
    const nav = screen.getByRole("navigation")
    expect(nav.getAttribute("aria-busy")).toBe("true")
    expect(nav.textContent).toContain("Chargement…")
    for (const button of screen.getAllByRole("button")) expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it("montre le décompte seul sur une page unique, et rien sur une liste vide", () => {
    const { result: hook } = renderHook(() => useCursorPages("k"))
    const { container, rerender } = render(<CursorPager pages={hook.current} result={result(1, "", true)} />)
    expect(container.textContent).toBe("1 ligne")
    expect(screen.queryByRole("button")).toBeNull()
    rerender(<CursorPager pages={hook.current} result={result(0, "", true)} />)
    expect(container.innerHTML).toBe("")
  })

  it("formate les grands nombres comme le reste du kit (fr-CH)", () => {
    const n = new Intl.NumberFormat("fr-CH")
    expect(rangeLabel(1_000_000, 200, false)).toBe(`Lignes ${n.format(1_000_001)} à ${n.format(1_000_200)}`)
  })
})

describe("ProjectSwitcher", () => {
  const projects = [
    { id: "p1", name: "hgdc-docs", mark: "T", href: "/o/acme/hgdc-docs" },
    { id: "p2", name: "aide-mail", mark: "D", href: "/o/acme/aide-mail" },
  ]

  it("identifie le projet actif et mène aux autres par des liens", async () => {
    render(<ProjectSwitcher projects={projects} activeId="p2" allHref="/o/acme" createHref="/o/acme/new" />)
    const trigger = screen.getByRole("button", { name: "Projet aide-mail, changer de projet" })
    expect(trigger.textContent).toContain("D")
    fireEvent.click(trigger)
    const docs = await screen.findByRole("menuitem", { name: /hgdc-docs/ })
    expect(docs.getAttribute("href")).toBe("/o/acme/hgdc-docs")
    expect(
      screen.getByRole("menuitem", { name: /aide-mail/ }).querySelector("[aria-label='Projet actif']"),
    ).not.toBeNull()
    expect(screen.getByRole("menuitem", { name: /Tous les projets/ }).getAttribute("href")).toBe("/o/acme")
    expect(screen.getByRole("menuitem", { name: "Nouveau projet" }).getAttribute("href")).toBe("/o/acme/new")
  })

  it("passe le choix au produit sans lien, null pour « Tous les projets »", async () => {
    const onSelect = vi.fn<(id: string | null) => void>()
    const onCreate = vi.fn<() => void>()
    const bare = projects.map(({ href: _href, ...p }) => p)
    render(<ProjectSwitcher projects={bare} onSelect={onSelect} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole("button", { name: "Tous les projets, changer de projet" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: /hgdc-docs/ }))
    expect(onSelect).toHaveBeenCalledWith("p1")
  })

  it("rend les liens par le routeur du produit", async () => {
    render(<ProjectSwitcher projects={projects} activeId="p1" renderLink={(href) => <RouterLink to={href} />} />)
    fireEvent.click(screen.getByRole("button"))
    const item = await screen.findByRole("menuitem", { name: /aide-mail/ })
    expect(item.getAttribute("data-router")).toBe("oui")
    expect(screen.queryByRole("menuitem", { name: "Nouveau projet" })).toBeNull()
  })

  it("montre le nom de l'URL tant que la liste charge", () => {
    render(<ProjectSwitcher projects={undefined} activeId="p9" activeName="kfi-website" />)
    expect(screen.getByRole("button").textContent).toContain("kfi-website")
  })

  it("se rabat sur la marque quand l'image manque", () => {
    const { container } = render(<ProjectMark project={{ name: "kfi-website" }} />)
    expect(container.textContent).toBe("k")
    const { container: withImage } = render(<ProjectMark project={{ name: "hgdc", iconUrl: "/f.png" }} />)
    const img = withImage.querySelector("img") as HTMLImageElement
    fireEvent.error(img)
    expect(withImage.textContent).toBe("h")
  })
})
