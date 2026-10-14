import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { useRender } from "@base-ui/react/use-render"
import { isValidElement } from "react"

import { Spinner } from "./spinner.tsx"
import { cn, type Variants } from "./cn.ts"

type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"
type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"

const buttonVariants: Variants<{ variant: ButtonVariant; size: ButtonSize }> = cva(
  // Appui : combine `:active` (CSS pseudo, marche sur tout élément pressable —
  // DropdownMenuTrigger, Link stylisés via buttonVariants, etc.) ET
  // `data-pressed` (attribut Base UI, fiable au doigt). Pas d'exclusion
  // `aria-haspopup` : les déclencheurs de menu répondent aussi.
  // `transition-property` explicite avec `scale` (Tailwind v4 sépare
  // `scale:` de `transform:`).
  //
  // Le bouton s'enfonce (0.97), il ne grossit pas. C'est la métaphore
  // physique : on appuie sur une touche, elle descend. Un bouton qui grandit
  // sous le doigt donne l'impression de venir vers soi, ce qu'aucun objet
  // pressé ne fait.
  //
  // Timing asymétrique : l'appui répond en 100 ms parce que la personne
  // regarde à cet instant précis ; la relâche revient en 300 ms avec un petit
  // rebond (`--ease-bounce`, révision du 2026-09-24).
  //
  // Au survol d'un vrai pointeur (`hover:` ne s'applique qu'aux pointeurs
  // fins en Tailwind v4), le bouton s'avance d'un rien (1.02), comme sur le
  // site ; aucune ombre, jamais : ce qui répond au survol est la couleur et
  // l'échelle.
  //
  // Ni bordure transparente ni `bg-clip-padding` (retirés le 2026-09-27) : le
  // fond s'arrêtait un pixel avant le bord, et dans une feuille du bas posée à
  // une coordonnée fractionnaire (hauteur en `svh`, glissement), iOS laissait
  // voir ce pixel comme un filet sombre en haut de la pilule, en thème sombre.
  // Le focus et l'erreur passent par l'anneau seul.
  "group/button touch-target inline-flex shrink-0 items-center justify-center rounded-full text-sm font-medium whitespace-nowrap [transition-property:color,background-color,opacity,scale,box-shadow] duration-(--duration-slow) ease-(--ease-bounce) outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] active:duration-(--duration-instant) active:ease-out disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-destructive/40 data-[pressed]:scale-[0.96] data-[pressed]:duration-(--duration-instant) data-[pressed]:ease-out motion-safe:hover:scale-[1.02] dark:aria-invalid:ring-destructive/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        // Un filet à 70 % plutôt qu'une bordure pleine : c'est le seul
        // contour de l'interface, et il est là pour dire « secondaire ».
        outline:
          "bg-background ring-1 ring-border/70 ring-inset hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-transparent dark:hover:bg-input/30",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/30 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      // L'échelle de la barre du haut (révision du 2026-09-25) : un bouton a
      // la hauteur de la maison et de la cloche, 44 px au doigt et 40 au-dessus
      // de `lg`, et un bouton-icône leur icône de 20 px. Avant, la page vivait
      // sur 36 et 32 px à côté de ronds de 44 : deux échelles sur un écran.
      // `sm` reste un cran plus bas, pour une carte ou une ligne de tableau.
      size: {
        default: "h-11 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 lg:h-10",
        xs: "h-7 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-10 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 lg:h-9",
        lg: "h-12 gap-2 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4 lg:h-11",
        icon: "size-11 lg:size-10 [&_svg:not([class*='size-'])]:size-5",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-10 lg:size-9 [&_svg:not([class*='size-'])]:size-4.5",
        "icon-lg": "size-12 lg:size-11 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    /**
     * When true, the button is disabled and its children are replaced with a
     * spinner. If `children` is a plain string, it is passed as the spinner
     * label so the action stays readable while in-flight.
     */
    isLoading?: boolean | undefined
  }

function Button({
  className,
  variant = "default",
  size = "default",
  isLoading,
  disabled,
  children,
  ...props
}: ButtonProps): React.JSX.Element {
  // Sur les variantes `icon*` le bouton n'a pas de padding horizontal pour
  // accueillir un label — on n'expose que le spinner pour éviter un overflow.
  const isIconSize = typeof size === "string" && size.startsWith("icon")
  const spinnerLabel = !isIconSize && typeof children === "string" ? children : undefined
  const classes = cn(
    buttonVariants({ variant, size, className: typeof className === "string" ? className : undefined }),
  )
  // Rendu en lien (`render={<Link />}` ou `<a>`) : le lien garde sa sémantique de lien. Passé par
  // `ButtonPrimitive`, même avec `nativeButton={false}`, il recevait `role="button"` (doc Base UI :
  // un lien ne se rend pas par Button, il en prend seulement le style).
  const { render, nativeButton: _nativeButton, focusableWhenDisabled: _focusable, ...linkProps } = props
  const linkElement = isValidElement(render) && render.type !== "button" ? render : undefined
  const link = useRender({
    render: linkElement,
    enabled: linkElement !== undefined,
    props: {
      ...linkProps,
      "data-slot": "button",
      className: classes,
      "aria-disabled": isLoading || disabled || undefined,
      children,
    },
  })
  if (link) return link

  return (
    <ButtonPrimitive data-slot="button" className={classes} disabled={isLoading || disabled} {...props}>
      {isLoading ? <Spinner {...(spinnerLabel !== undefined ? { label: spinnerLabel } : {})} /> : children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants, type ButtonProps }
