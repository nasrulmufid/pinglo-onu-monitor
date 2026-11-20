import { useCallback, useEffect, useRef, useState } from "react"
import { useMap } from "react-leaflet"
import { Globe, Layers, Maximize2, Minimize2 } from "lucide-react"

import type { MapLayerMode } from "@/components/map-tile-layers"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type WebkitFullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

type WebkitFullscreenEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

function getNativeFullscreenElement() {
  const doc = document as WebkitFullscreenDoc
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

/**
 * Manages fullscreen state for a map container using the native Fullscreen API
 * with an automatic CSS fixed-overlay fallback for browsers such as iOS Safari.
 */
export function useMapFullscreen<T extends HTMLElement>(options?: { handleWindowEscape?: boolean }) {
  const handleWindowEscape = options?.handleWindowEscape ?? true
  const containerRef = useRef<T | null>(null)
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
  const [isCssFullscreen, setIsCssFullscreen] = useState(false)
  const isFullscreen = isNativeFullscreen || isCssFullscreen

  useEffect(() => {
    const syncNative = () => {
      const el = containerRef.current
      setIsNativeFullscreen(Boolean(el && getNativeFullscreenElement() === el))
    }
    document.addEventListener("fullscreenchange", syncNative)
    document.addEventListener("webkitfullscreenchange", syncNative)
    return () => {
      document.removeEventListener("fullscreenchange", syncNative)
      document.removeEventListener("webkitfullscreenchange", syncNative)
    }
  }, [])

  const enterFullscreen = useCallback(async () => {
    const el = containerRef.current as WebkitFullscreenEl | null
    if (!el) {
      setIsCssFullscreen(true)
      return
    }
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen()
        return
      }
      if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen()
        return
      }
    } catch {
      // Fallback to CSS fullscreen when native API is blocked or unsupported.
    }
    setIsCssFullscreen(true)
  }, [])

  const exitFullscreen = useCallback(async () => {
    const doc = document as WebkitFullscreenDoc
    if (getNativeFullscreenElement()) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen()
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen()
      } catch {
        // Ignore native exit errors and clear local state.
      }
    }
    setIsCssFullscreen(false)
    setIsNativeFullscreen(false)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) void exitFullscreen()
    else void enterFullscreen()
  }, [isFullscreen, enterFullscreen, exitFullscreen])

  useEffect(() => {
    if (!isCssFullscreen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    if (!handleWindowEscape) {
      return () => {
        document.body.style.overflow = previousOverflow
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") void exitFullscreen()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [isCssFullscreen, handleWindowEscape, exitFullscreen])

  return {
    containerRef,
    isNativeFullscreen,
    isCssFullscreen,
    isFullscreen,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  }
}

/**
 * Invalidates Leaflet's map size on container resizes and layout state changes
 * so tiles redraw cleanly after entering or exiting fullscreen.
 */
export function MapResizeSync({ trigger }: { trigger?: unknown }) {
  const map = useMap()

  useEffect(() => {
    const sync = () => map.invalidateSize({ animate: false })
    sync()
    const t1 = window.setTimeout(sync, 60)
    const t2 = window.setTimeout(sync, 220)

    const container = map.getContainer()
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => sync())
      observer.observe(container)
    }

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      observer?.disconnect()
    }
  }, [map, trigger])

  return null
}

const layerOptions: { value: MapLayerMode; label: string; icon: typeof Layers }[] = [
  { value: "satellite", label: "Satelit", icon: Layers },
  { value: "esri", label: "Esri", icon: Layers },
  { value: "osm", label: "OSM", icon: Globe },
]

function stopMapEventPropagation(e: React.SyntheticEvent) {
  e.stopPropagation()
}

/**
 * Floating top-right overlay bar for fullscreen toggling, custom actions, and
 * fullscreen layer switching without leaking clicks/drags into Leaflet.
 */
export function MapOverlayControls({
  isFullscreen,
  onToggleFullscreen,
  layer,
  onLayerChange,
  extraActions,
  className,
}: {
  isFullscreen: boolean
  onToggleFullscreen: () => void
  layer?: MapLayerMode
  onLayerChange?: (layer: MapLayerMode) => void
  extraActions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("pointer-events-none absolute right-2.5 top-2.5 z-20 flex flex-wrap items-center justify-end gap-1.5", className)}>
      {isFullscreen && layer && onLayerChange && (
        <div
          className="pointer-events-auto inline-flex items-center rounded-lg border border-border/80 bg-background/90 p-0.5 shadow-md backdrop-blur-md"
          onClick={stopMapEventPropagation}
          onMouseDown={stopMapEventPropagation}
          onPointerDown={stopMapEventPropagation}
          onTouchStart={stopMapEventPropagation}
          onDoubleClick={stopMapEventPropagation}
        >
          {layerOptions.map((opt) => {
            const Icon = opt.icon
            const active = layer === opt.value
            return (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={active ? "default" : "ghost"}
                className="h-7 px-2 text-[11px]"
                onClick={() => onLayerChange(opt.value)}
              >
                <Icon className="h-3 w-3" />
                <span>{opt.label}</span>
              </Button>
            )
          })}
        </div>
      )}

      {extraActions && (
        <div
          className="pointer-events-auto flex items-center gap-1.5"
          onClick={stopMapEventPropagation}
          onMouseDown={stopMapEventPropagation}
          onPointerDown={stopMapEventPropagation}
          onTouchStart={stopMapEventPropagation}
          onDoubleClick={stopMapEventPropagation}
        >
          {extraActions}
        </div>
      )}

      <div
        className="pointer-events-auto"
        onClick={stopMapEventPropagation}
        onMouseDown={stopMapEventPropagation}
        onPointerDown={stopMapEventPropagation}
        onTouchStart={stopMapEventPropagation}
        onDoubleClick={stopMapEventPropagation}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? "Keluar Full Screen" : "Tampilkan Full Screen"}
          title={isFullscreen ? "Keluar Full Screen" : "Full Screen Peta"}
          className="h-8 border-border/80 bg-background/90 px-2.5 text-foreground shadow-md backdrop-blur-md hover:bg-background"
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          <span className="hidden text-xs sm:inline">{isFullscreen ? "Keluar" : "Full Screen"}</span>
        </Button>
      </div>
    </div>
  )
}
