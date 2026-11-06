/**
 * La place de l'organisation tant que le produit ne l'a pas (ses données arrivent) : la marque de
 * la dernière organisation affichée sous cette origine, au pixel près de celle d'`OrgSwitcher`
 * (initiales ou logo, posés sur `<html>` par `sidebarInitScript` avant la première peinture),
 * sinon un carré de squelette de la même taille. Rien ne bouge quand la vraie arrive.
 */
export function OrgPlaceholder(): React.JSX.Element {
  return (
    <div data-slot="org-placeholder" aria-hidden className="flex h-10 min-w-0 flex-1 items-center px-1.5 coarse:h-11">
      <span
        data-slot="org-placeholder-mark"
        className="grid size-8 shrink-0 place-items-center rounded-lg text-xs font-semibold uppercase"
      />
    </div>
  )
}
