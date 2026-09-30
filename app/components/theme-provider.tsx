import * as React from "react"

// A small theme provider (light / dark / system) with no dependencies:
// - an inline script applies the stored theme before hydration so the first
//   paint has no flash of the wrong theme
// - the preference is kept in localStorage and synced across tabs
// - "system" follows the OS `prefers-color-scheme` setting live
// - `useTheme()` exposes the preference, the resolved theme and a setter

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

const STORAGE_KEY = "theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"

// Runs before React hydrates. Keep it in sync with `resolveTheme` below.
const themeScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("${DARK_QUERY}").matches);var r=d?"dark":"light";var c=document.documentElement;c.classList.remove("light","dark");c.classList.add(r);c.style.colorScheme=r}catch(e){}})()`

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === "light" || value === "dark" ? value : "system"
  } catch {
    return "system"
  }
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light"
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved
}

// External store: localStorage + the OS media query. `useSyncExternalStore`
// keeps server and client renders consistent (the server snapshot is used
// during hydration, then the client value takes over).
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener("change", listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    media.removeEventListener("change", listener)
    window.removeEventListener("storage", listener)
  }
}

function getThemeSnapshot() {
  return readTheme()
}

function getResolvedSnapshot() {
  return resolveTheme(readTheme())
}

const getServerTheme = (): Theme => "system"
const getServerResolved = (): ResolvedTheme | undefined => undefined

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme | undefined
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(
  undefined
)

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = React.useSyncExternalStore(
    subscribe,
    getThemeSnapshot,
    getServerTheme
  )
  const resolvedTheme = React.useSyncExternalStore(
    subscribe,
    getResolvedSnapshot,
    getServerResolved
  )

  React.useEffect(() => {
    if (resolvedTheme) applyTheme(resolvedTheme)
  }, [resolvedTheme])

  const setTheme = React.useCallback((next: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage may be unavailable (private mode, blocked). Apply anyway.
    }
    applyTheme(resolveTheme(next))
    listeners.forEach((listener) => listener())
  }, [])

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  return (
    <ThemeContext.Provider value={value}>
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      <ThemeHotkey />
      {children}
    </ThemeContext.Provider>
  )
}

function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider.")
  }
  return context
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

// Press "d" anywhere outside a text field to toggle light / dark.
function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider, useTheme }
