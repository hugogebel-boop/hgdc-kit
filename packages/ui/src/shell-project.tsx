import { useEffect, useSyncExternalStore } from "react"

import type { ModuleWord } from "./modules.ts"
import { ProjectSwitcher, type SwitcherProject } from "./project-switcher.tsx"

/**
 * Le projet choisi en haut de page, le même dans toutes les consoles de Basalte : sous `app.hgdc.ch`,
 * elles partagent l'origine, donc ce réglage. Une valeur par organisation : changer d'organisation
 * ne garde pas le projet d'une autre. Propre à chaque personne et à chaque navigateur.
 */
const keyOf = (organizationId: string) => `hgdc-shell:project:${organizationId}`
const EVENT = "hgdc-shell-project"

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

export function saveShellProject(organizationId: string, projectId: string | null): void {
  try {
    if (projectId === null) window.localStorage.removeItem(keyOf(organizationId))
    else window.localStorage.setItem(keyOf(organizationId), projectId)
  } catch {
    // Stockage bloqué : le choix vaut seulement pour cette page.
  }
  window.dispatchEvent(new Event(EVENT))
}

/** L'identifiant du projet choisi ; `null` : tous les projets, et toujours au rendu serveur. */
export function useShellProject(organizationId: string | null | undefined): string | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (!organizationId) return null
      try {
        return window.localStorage.getItem(keyOf(organizationId))
      } catch {
        return null
      }
    },
    () => null,
  )
}

/** Un projet commun, tel que le rend `listCoreProjects` de `@hgdc/auth/core`. */
export type ShellCoreProject = { id: string; name: string; modules: ReadonlyArray<string> }

/** Le projet choisi, s'il existe encore et si le module y est activé. Sinon : tous les projets. */
export function activeCoreProject<Project extends ShellCoreProject>(
  projects: ReadonlyArray<Project> | undefined,
  activeId: string | null,
): Project | null {
  return projects?.find((project) => project.id === activeId) ?? null
}

/** Ce que `project` d'`AppShell` attend pour le projet choisi. */
export function shellProjectFrom(
  project: ShellCoreProject | null,
  settingsHref: string,
): { name: string; modules: ReadonlyArray<ModuleWord>; settingsHref: string } | undefined {
  if (!project) return undefined
  return { name: project.name, modules: project.modules as ReadonlyArray<ModuleWord>, settingsHref }
}

/**
 * Un module montre un seul sélecteur en haut de page : celui de Basalte dès que l'organisation a des
 * projets, ou le sien sinon (démo, espace pas encore relié). Pendant le chargement, celui de Basalte.
 */
export function coreSwitcherShown(
  organizationId: string | null | undefined,
  projects: ReadonlyArray<ShellCoreProject> | undefined,
): boolean {
  return Boolean(organizationId) && projects?.length !== 0
}

/** Ce qu'un module a pour un projet : un site, une doc, un assistant, une page de statut. */
export type ProjectResource = { coreProjectId?: string | null | undefined }

/**
 * Où mène un projet choisi dans le sélecteur : sa ressource s'il n'y en a qu'une, sinon la liste du
 * module, déjà filtrée. `null` : on ne bouge pas (liste en chargement, ou déjà sur la liste).
 */
export function projectDestination<Resource extends ProjectResource>(
  resources: ReadonlyArray<Resource> | undefined,
  projectId: string | null,
  resourceOpen: boolean,
): { to: "resource"; resource: Resource } | { to: "list" } | null {
  if (resources === undefined) return null
  if (projectId !== null) {
    const matching = resources.filter((resource) => resource.coreProjectId === projectId)
    if (matching.length === 1 && matching[0]) return { to: "resource", resource: matching[0] }
  }
  return resourceOpen ? { to: "list" } : null
}

/**
 * Une ressource ouverte par son adresse (lien, palette, liste) : le sélecteur montre son projet. Écrit
 * à l'ouverture seulement : revenir sur « Tous les projets » n'est pas annulé avant de quitter la page.
 */
export function useShellProjectOfResource(
  organizationId: string | null | undefined,
  coreProjectId: string | null | undefined,
): void {
  useEffect(() => {
    if (organizationId && coreProjectId) saveShellProject(organizationId, coreProjectId)
  }, [organizationId, coreProjectId])
}

/**
 * Le sélecteur de projet de Basalte, dans `header` d'`AppShell`. Le choix vaut pour toutes les consoles.
 * `onChange` : ce que le module fait en plus, par exemple ouvrir la page du projet. Rien à montrer
 * tant que l'organisation n'a aucun projet.
 */
export function CoreProjectSwitcher({
  organizationId,
  projects,
  createHref,
  onChange,
}: {
  organizationId: string
  projects: ReadonlyArray<ShellCoreProject> | undefined
  /** « Nouveau projet » : la page Projets de Manager. */
  createHref?: string
  onChange?: (projectId: string | null) => void
}): React.JSX.Element | null {
  const activeId = useShellProject(organizationId)
  if (projects !== undefined && projects.length === 0) return null
  const known = activeCoreProject(projects, activeId)
  const entries: Array<SwitcherProject> | undefined = projects?.map(({ id, name }) => ({ id, name }))
  return (
    <ProjectSwitcher
      projects={entries}
      activeId={known?.id ?? null}
      {...(createHref ? { createHref } : {})}
      onSelect={(id) => {
        saveShellProject(organizationId, id)
        onChange?.(id)
      }}
    />
  )
}
