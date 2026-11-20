import type { ComponentProps } from "react"
import { Toaster as Sonner } from "sonner"

import { useTheme } from "@/hooks/use-theme"

type ToasterProps = ComponentProps<typeof Sonner>

export function Toaster({ ...props }: ToasterProps) {
  const { darkMode } = useTheme()

  return (
    <Sonner
      theme={darkMode ? "dark" : "light"}
      position="top-right"
      richColors
      closeButton
      className="toaster group"
      style={{ zIndex: 700 }}
      toastOptions={{
        classNames: {
          toast:
            "group toast cn-menu-translucent group-[.toaster]:text-foreground group-[.toaster]:ring-1 group-[.toaster]:ring-foreground/5 dark:group-[.toaster]:ring-foreground/10 group-[.toaster]:shadow-lg group-[.toaster]:rounded-2xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}
