import { useCallback, useEffect, useSyncExternalStore } from "react"

const THEME_STORAGE_KEY = "mikroin-theme"
const THEME_EVENT = "mikroin-theme-change"

function getThemeSnapshot() {
  if (typeof window === "undefined") return false
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (saved) return saved === "dark"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function subscribeTheme(cb: () => void) {
  window.addEventListener("storage", cb)
  window.addEventListener(THEME_EVENT, cb)
  return () => {
    window.removeEventListener("storage", cb)
    window.removeEventListener(THEME_EVENT, cb)
  }
}

export function useTheme() {
  const darkMode = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => false)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode)
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light"
  }, [darkMode])

  const setDarkMode = useCallback((dark: boolean) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light")
    window.dispatchEvent(new Event(THEME_EVENT))
  }, [])

  const toggleTheme = useCallback(() => {
    setDarkMode(!getThemeSnapshot())
  }, [setDarkMode])

  return { darkMode, setDarkMode, toggleTheme }
}
