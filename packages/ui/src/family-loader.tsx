import { createContext, useContext, useEffect, useLayoutEffect, useRef } from "react"

import { cn } from "./cn.ts"

const SIZES = { sm: 24, md: 40, lg: 64 } as const

/** Durée de la boucle du H (`styles.css`, `.family-loader [data-fill]`). */
export const FAMILY_LOADER_PERIOD_MS = 2000

/**
 * Début des animations du H sur la ligne de temps du document, pour que la boucle soit à la même
 * phase partout au même instant : `(performance.timeOrigin + now) % période`. Deux pages, deux
 * produits, un rendu serveur et son hydratation tombent en phase sans se parler.
 */
export function familyLoaderStartTime(timeOrigin: number, period: number = FAMILY_LOADER_PERIOD_MS): number {
  return -(((timeOrigin % period) + period) % period)
}

/** Phase de la boucle (0 à la période) à l'instant `epochMs` (ms depuis 1970). */
export function familyLoaderPhase(epochMs: number, period: number = FAMILY_LOADER_PERIOD_MS): number {
  return ((epochMs % period) + period) % period
}

function isLoaderAnimation(animation: Animation): boolean {
  const name = (animation as Animation & { animationName?: string }).animationName
  return typeof name === "string" && name.startsWith("family-loader")
}

/** Cale toutes les animations du H sous `root` sur l'horloge (voir `familyLoaderStartTime`). */
export function syncFamilyLoader(root: Element | null): void {
  if (!root || typeof root.getAnimations !== "function") return
  const start = familyLoaderStartTime(performance.timeOrigin)
  for (const animation of root.getAnimations({ subtree: true })) {
    // Les animations du H seulement : une transition (fondu du chargeur) garde son propre départ.
    if (!isLoaderAnimation(animation)) continue
    if (animation.startTime !== start) animation.startTime = start
  }
}

/**
 * Même calage, en ligne dans le HTML rendu par le serveur, juste après l'élément : il s'exécute
 * avant l'hydratation, une fois la feuille de style chargée (un script attend les feuilles de
 * style qui le précèdent). Une animation recréée (mouvement réduit basculé) se recale aussi.
 */
const SYNC_SCRIPT = `(function(e){if(!e||!e.getAnimations)return;var p=${FAMILY_LOADER_PERIOD_MS};function s(){var t=-(((performance.timeOrigin%p)+p)%p);e.getAnimations({subtree:true}).forEach(function(a){if(String(a.animationName).indexOf("family-loader")===0&&a.startTime!==t)a.startTime=t})}s();e.addEventListener("animationstart",s)})(document.currentScript&&document.currentScript.previousElementSibling)`

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/** Cale le H sur l'horloge au montage et à chaque animation recréée. */
function useClockSync(ref: React.RefObject<Element | null>): void {
  useIsomorphicLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    syncFamilyLoader(element)
    const onStart = () => syncFamilyLoader(element)
    element.addEventListener("animationstart", onStart)
    return () => element.removeEventListener("animationstart", onStart)
  }, [ref])
}

function Mark(): React.JSX.Element[] {
  return (["left", "bar", "right"] as const).map((piece) => (
    <span key={piece} data-piece={piece} aria-hidden>
      <span data-fill />
    </span>
  ))
}

/**
 * Vrai sous `FamilyLoaderRoot` : le document a son chargeur, `PagePending` et la coque s'y
 * signalent au lieu de dessiner leur propre H.
 */
export const FamilyLoaderRootContext: React.Context<boolean> = createContext<boolean>(false)

/**
 * Le H du chargement : la silhouette grise du H de la famille, toujours visible, dont les trois
 * pièces se remplissent de leurs dégradés en une seule boucle de 2 s (gauche, barre, droite, H
 * complet, fondu), calée sur l'horloge. CSS seul (`styles.css`), `transform` et `opacity`
 * seulement. Mouvement réduit : le H plein respire doucement.
 *
 * Un chargement de page ne dessine pas ce H lui-même : c'est `PagePending`, qui passe par le H du
 * document (`FamilyLoaderRoot`), au même pixel dans tous les états. Ce composant sert au H en
 * ligne (une carte, un panneau) ; dans un bouton ou une ligne, `Spinner` reste la règle.
 */
export function FamilyLoader({
  size,
  label = "Chargement…",
  page = false,
  className,
}: {
  /** `sm` 24 px, `md` 40 px, `lg` 64 px. Par défaut `lg` en page, `md` sinon. */
  size?: keyof typeof SIZES
  label?: string
  /** Chargement de toute la page : passe par le H du document, comme `PagePending`. */
  page?: boolean
  className?: string
}): React.JSX.Element {
  const hasRoot = useContext(FamilyLoaderRootContext)
  if (page) return <PageLoadingPlaceholder label={label} hasRoot={hasRoot} className={className} />
  return <FamilyMark px={SIZES[size ?? "md"]} label={label} className={className} />
}

function FamilyMark({
  px,
  label,
  className,
}: {
  px: number
  label?: string | undefined
  className?: string | undefined
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  useClockSync(ref)
  return (
    <span
      ref={ref}
      {...(label ? { role: "status", "aria-label": label } : { "aria-hidden": true })}
      data-slot="family-loader"
      className={cn("family-loader", className)}
      style={{ ["--family-loader-size" as string]: `${px}px` }}
    >
      <Mark />
    </span>
  )
}

/**
 * Le H du document : un seul élément, en position fixe sur la scène (la zone de contenu de la
 * coque), toujours monté, que le CSS montre quand une page attend ou que la coque charge. Monté par
 * `FamilyLoaderRoot`, ou, à défaut, par la coque ou par `PagePending` eux-mêmes.
 */
export function FamilyLoaderHost(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useClockSync(ref)
  return (
    <>
      <div ref={ref} data-slot="family-loader-root" aria-hidden>
        <div data-frame />
        <div data-stage>
          <span
            data-slot="family-loader"
            className="family-loader"
            style={{ ["--family-loader-size" as string]: "64px" }}
          >
            <Mark />
          </span>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SYNC_SCRIPT }} />
    </>
  )
}

/**
 * Le chargeur du document, à poser une fois dans le `body` de la route racine, autour de l'app :
 *
 * ```tsx
 * <body>
 *   <FamilyLoaderRoot>{children}</FamilyLoaderRoot>
 *   <Scripts />
 * </body>
 * ```
 *
 * Il rend le H dans le HTML du serveur, avant l'hydratation, à la même place et à la même phase
 * que dans la coque et que dans le produit qu'on vient de quitter (ADR 0015).
 */
export function FamilyLoaderRoot({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <FamilyLoaderRootContext value={true}>
      {children}
      <FamilyLoaderHost />
    </FamilyLoaderRootContext>
  )
}

/**
 * La place d'une page qui attend, hors de la coque : sa seule présence montre le H du document
 * (CSS `:has`), dès le rendu serveur. Sans `FamilyLoaderRoot`, elle monte son propre H.
 */
export function PageLoadingPlaceholder({
  label,
  hasRoot,
  className,
}: {
  label: string
  hasRoot: boolean
  className?: string | undefined
}): React.JSX.Element {
  return (
    <div data-slot="page-pending" role="status" aria-label={label} className={cn("min-h-dvh w-full", className)}>
      {hasRoot ? null : <FamilyLoaderHost />}
    </div>
  )
}
