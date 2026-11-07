// @vitest-environment happy-dom
import { runInNewContext } from "node:vm"
import { afterEach, describe, expect, it } from "vitest"

import {
  forgetShellOrganization,
  lastOrganization,
  rememberLastOrganization,
  rememberLastProduct,
  rememberShellNavHeight,
  rememberShellOrganization,
  SHELL_BOOT_CONFIG,
  SHELL_LAST_PRODUCT_KEY,
  SHELL_NAV_KEY_PREFIX,
  SHELL_ORG_KEY,
  shellBoot,
  shellBootScript,
  shellOrganization,
  type ShellBootConfig,
} from "./shell-memory.ts"
import { orgTone } from "./initials.ts"

const CONFIG: ShellBootConfig = {
  ...SHELL_BOOT_CONFIG,
  origins: [
    ["mail", "https://app.hgdc.ch", "/mail"],
    ["host", "https://app.hgdc.ch", "/host"],
  ],
}

/** Une fenêtre de test : `<html>` neuf, adresse et stockage choisis. */
function fakeWindow(href: string, stored: Record<string, string> = {}) {
  const url = new URL(href)
  const root = document.createElement("html")
  return {
    root,
    win: {
      document: { documentElement: root },
      location: { origin: url.origin, hostname: url.hostname, pathname: url.pathname },
      localStorage: { getItem: (key: string) => stored[key] ?? null },
    },
  }
}

afterEach(() => {
  localStorage.clear()
  const root = document.documentElement
  for (const key of ["sidebar", "hgdcProduct", "hgdcOrg"]) delete root.dataset[key]
  root.removeAttribute("style")
})

describe("shellBoot : la mémoire de la coque sur <html>, avant la première peinture", () => {
  it("le produit de l'adresse : sa base sous app.hgdc.ch, ou son sous-domaine", () => {
    for (const [href, product] of [
      ["https://app.hgdc.ch/mail/o/acme", "mail"],
      ["https://app.hgdc.ch/mail", "mail"],
      ["https://app.hgdc.ch/host/", "host"],
      ["https://status.hgdc.ch/o/acme", "status"],
    ] as const) {
      const { root, win } = fakeWindow(href)
      shellBoot(CONFIG, win)
      expect(root.dataset.hgdcProduct, href).toBe(product)
    }
    for (const href of [
      "https://app.hgdc.ch/mailbox",
      "https://app.hgdc.ch/",
      "http://localhost:3000/o",
      "https://evil.ch/mail",
    ]) {
      const { root, win } = fakeWindow(href)
      shellBoot(CONFIG, win)
      expect(root.dataset.hgdcProduct, href).toBeUndefined()
    }
  })

  it("le rail de la barre latérale, comme avant", () => {
    const { root, win } = fakeWindow("https://app.hgdc.ch/mail/", { sidebar: "rail" })
    shellBoot(CONFIG, win)
    expect(root.dataset.sidebar).toBe("rail")
  })

  it("l'organisation retenue : ses initiales en chaîne CSS, ou son logo", () => {
    const initials = fakeWindow("https://app.hgdc.ch/mail/", { [SHELL_ORG_KEY]: JSON.stringify({ initials: "AG" }) })
    shellBoot(CONFIG, initials.win)
    expect(initials.root.dataset.hgdcOrg).toBe("")
    expect(initials.root.style.getPropertyValue("--hgdc-org-initials")).toBe('"AG"')
    expect(initials.root.style.getPropertyValue("--hgdc-org-logo")).toBe("")

    const logo = fakeWindow("https://app.hgdc.ch/mail/", {
      [SHELL_ORG_KEY]: JSON.stringify({ initials: "AG", logo: "https://cdn.hgdc.ch/acme.png" }),
    })
    shellBoot(CONFIG, logo.win)
    expect(logo.root.style.getPropertyValue("--hgdc-org-logo")).toBe('url("https://cdn.hgdc.ch/acme.png")')
    expect(logo.root.style.getPropertyValue("--hgdc-org-initials")).toBe('""')
  })

  it("la teinte retenue de l'organisation, un entier de 1 à 7 seulement", () => {
    const toned = fakeWindow("https://app.hgdc.ch/mail/", {
      [SHELL_ORG_KEY]: JSON.stringify({ initials: "OD", tone: 3 }),
    })
    shellBoot(CONFIG, toned.win)
    expect(toned.root.style.getPropertyValue("--hgdc-org-bg")).toBe("var(--avatar-3)")
    expect(toned.root.style.getPropertyValue("--hgdc-org-ink")).toBe("var(--avatar-3-ink)")

    for (const tone of [0, 8, 2.5, "3", "1);x:url(y"]) {
      const odd = fakeWindow("https://app.hgdc.ch/mail/", { [SHELL_ORG_KEY]: JSON.stringify({ initials: "OD", tone }) })
      shellBoot(CONFIG, odd.win)
      expect(odd.root.style.getPropertyValue("--hgdc-org-bg")).toBe("")
    }
  })

  it("rien d'injectable : guillemets, parenthèses et adresses non https sont écartés", () => {
    const { root, win } = fakeWindow("https://app.hgdc.ch/mail/", {
      [SHELL_ORG_KEY]: JSON.stringify({
        initials: 'A"}; x',
        logo: 'https://a.ch/x.png") ; background: url("https://b.ch',
      }),
    })
    shellBoot(CONFIG, win)
    expect(root.style.getPropertyValue("--hgdc-org-initials")).toBe('"Ax"')
    expect(root.style.getPropertyValue("--hgdc-org-logo")).toBe("")
    for (const logo of ["javascript:alert(1)", "http://a.ch/x.png", "data:image/png;base64,AAAA"]) {
      const other = fakeWindow("https://app.hgdc.ch/mail/", {
        [SHELL_ORG_KEY]: JSON.stringify({ initials: "A", logo }),
      })
      shellBoot(CONFIG, other.win)
      expect(other.root.style.getPropertyValue("--hgdc-org-logo"), logo).toBe("")
    }
  })

  it("une mémoire illisible ou un stockage bloqué : un squelette, sans erreur", () => {
    const broken = fakeWindow("https://app.hgdc.ch/mail/", { [SHELL_ORG_KEY]: "{pas du json" })
    shellBoot(CONFIG, broken.win)
    expect(broken.root.dataset.hgdcOrg).toBeUndefined()
    const blocked = fakeWindow("https://app.hgdc.ch/mail/")
    blocked.win.localStorage.getItem = () => {
      throw new Error("bloqué")
    }
    expect(() => shellBoot(CONFIG, blocked.win)).not.toThrow()
    expect(blocked.root.dataset.hgdcProduct).toBe("mail")
  })

  it("la hauteur de la navigation du produit, pour le squelette de la barre latérale", () => {
    const { root, win } = fakeWindow("https://app.hgdc.ch/mail/", { [`${SHELL_NAV_KEY_PREFIX}mail`]: "228" })
    shellBoot(CONFIG, win)
    expect(root.style.getPropertyValue("--hgdc-nav-height")).toBe("228px")
    const other = fakeWindow("https://app.hgdc.ch/host/", { [`${SHELL_NAV_KEY_PREFIX}mail`]: "228" })
    shellBoot(CONFIG, other.win)
    expect(other.root.style.getPropertyValue("--hgdc-nav-height")).toBe("")
  })

  it("le script en ligne est autonome : sa source seule fait le même travail", () => {
    const script = shellBootScript(CONFIG)
    expect(script.startsWith("try{(")).toBe(true)
    const { root, win } = fakeWindow("https://app.hgdc.ch/host/o/acme", {
      sidebar: "rail",
      [SHELL_ORG_KEY]: JSON.stringify({ initials: "HG" }),
    })
    // Exécuté dans un contexte vide, sans rien de ce module dans sa portée : la source seule.
    runInNewContext(script, { window: win })
    expect(root.dataset.sidebar).toBe("rail")
    expect(root.dataset.hgdcProduct).toBe("host")
    expect(root.style.getPropertyValue("--hgdc-org-initials")).toBe('"HG"')
  })
})

describe("mémoire de l'organisation", () => {
  it("retient les initiales et le logo, pas le nom ; l'applique à la page ; l'oublie à la déconnexion", () => {
    expect(shellOrganization({ name: "Atelier Gebel" })).toEqual({
      initials: "AG",
      tone: orgTone({ name: "Atelier Gebel" }),
    })
    // La teinte suit l'identifiant, comme OrgMark : deux homonymes ne se confondent pas.
    expect(shellOrganization({ id: "org_1", name: "Atelier Gebel" }).tone).toBe(orgTone({ id: "org_1", name: "x" }))
    rememberShellOrganization({ name: "Atelier Gebel", logo: "https://cdn.hgdc.ch/a.png" })
    expect(JSON.parse(localStorage.getItem(SHELL_ORG_KEY) ?? "")).toEqual({
      initials: "AG",
      logo: "https://cdn.hgdc.ch/a.png",
    })
    expect(localStorage.getItem(SHELL_ORG_KEY)).not.toContain("Atelier")
    expect(document.documentElement.dataset.hgdcOrg).toBe("")
    forgetShellOrganization()
    expect(localStorage.getItem(SHELL_ORG_KEY)).toBeNull()
    expect(document.documentElement.dataset.hgdcOrg).toBeUndefined()
  })

  it("hauteur de navigation : seulement une vraie hauteur", () => {
    rememberShellNavHeight("mail", 0)
    expect(localStorage.getItem(`${SHELL_NAV_KEY_PREFIX}mail`)).toBeNull()
    rememberShellNavHeight("mail", 151.6)
    expect(localStorage.getItem(`${SHELL_NAV_KEY_PREFIX}mail`)).toBe("152")
  })

  it("retient le dernier produit ouvert, pour l'accueil d'app.hgdc.ch", () => {
    rememberLastProduct("mail")
    rememberLastProduct("host")
    expect(localStorage.getItem(SHELL_LAST_PRODUCT_KEY)).toBe("host")
  })
})

describe("dernière organisation ouverte", () => {
  afterEach(() => window.localStorage.clear())

  it("est la même pour tous les modules et part à la déconnexion", () => {
    expect(lastOrganization()).toBeNull()
    rememberLastOrganization("atelier")
    expect(lastOrganization()).toBe("atelier")
    forgetShellOrganization()
    expect(lastOrganization()).toBeNull()
  })
})
