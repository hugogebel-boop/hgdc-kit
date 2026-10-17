/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"

export type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

export type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const THEME_STORAGE_KEY = "theme"
// Clair par défaut, quel que soit le réglage du système : le sombre se choisit dans le menu.
const THEME_DEFAULT: Theme = "light"

/**
 * Couleur de la barre du navigateur, au fond de l'app dans chaque thème. Elle suit le thème de
 * l'app, pas celui du système : le script anti-flash et `ThemeProvider` réécrivent les balises
 * `<meta name="theme-color">` du document (à poser avec `content="#ffffff"`, sans `media`).
 */
export const THEME_COLOR: Readonly<Record<"dark" | "light", string>> = { light: "#ffffff", dark: "#0a0a0a" }

function buildThemeScript(storageKey: string, defaultTheme: Theme) {
  return `(function(){try{var k=${JSON.stringify(storageKey)};var d=${JSON.stringify(defaultTheme)};var t=localStorage.getItem(k);if(t!=='light'&&t!=='dark'&&t!=='system'){t=d}var m=matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(m?'dark':'light'):t;var e=document.documentElement;e.classList.add(r);e.style.colorScheme=r;document.querySelectorAll('meta[name="theme-color"]').forEach(function(x){x.removeAttribute('media');x.setAttribute('content',r==='dark'?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)})})}catch(e){}})();`
}

/**
 * Script anti-flash de thème. DOIT être placé dans le <head>, avant la feuille
 * de styles render-blocking : il pose la classe `.dark`/`.light` sur <html>
 * pendant le parsing du head, donc avant que le CSS ne peigne. Sans ça, le CSS
 * s'applique avec le thème clair par défaut (`:root --background` blanc) le
 * temps que le script tourne → flash blanc au lancement de la PWA.
 */
export const themeInitScript: string = buildThemeScript(THEME_STORAGE_KEY, THEME_DEFAULT)

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "light",
  setTheme: () => {},
})

function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme !== "system") return theme
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(resolved: "dark" | "light") {
  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.removeAttribute("media")
    meta.setAttribute("content", THEME_COLOR[resolved])
  }
}

function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system"
}

export function ThemeProvider({
  children,
  defaultTheme = THEME_DEFAULT,
  storageKey = THEME_STORAGE_KEY,
}: ThemeProviderProps): React.JSX.Element {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme
    const stored = localStorage.getItem(storageKey)
    return isTheme(stored) ? stored : defaultTheme
  })

  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    applyTheme(resolveTheme(theme))
  }, [theme])

  useEffect(() => {
    if (theme !== "system") return undefined
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyTheme(media.matches ? "dark" : "light")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [theme])

  const setTheme = useCallback(
    (next: Theme) => {
      localStorage.setItem(storageKey, next)
      setThemeState(next)
    },
    [storageKey],
  )

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])

  return <ThemeProviderContext value={value}>{children}</ThemeProviderContext>
}

export function useTheme(): ThemeProviderState {
  return useContext(ThemeProviderContext)
}
