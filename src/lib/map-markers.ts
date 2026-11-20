import L from "leaflet"

const wifiOnlineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/></svg>`

const wifiOfflineSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/></svg>`

function createWifiMarkerIcon(options: {
  bg: string
  glow: string
  svg: string
  size?: number
  borderWidth?: number
  shadow?: string
}) {
  const size = options.size ?? 30
  const border = options.borderWidth ?? 2.5
  const anchor = size / 2
  const shadow = options.shadow ?? `0 0 0 4px ${options.glow}, 0 3px 8px rgba(0,0,0,0.45)`

  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${options.bg};border:${border}px solid #ffffff;box-shadow:${shadow};display:flex;align-items:center;justify-content:center;">${options.svg}</div>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    popupAnchor: [0, -(anchor + 2)],
  })
}

export const onlineOnuIcon = createWifiMarkerIcon({
  bg: "#10b981",
  glow: "rgba(16,185,129,0.35)",
  svg: wifiOnlineSvg,
  size: 30,
  borderWidth: 2.5,
})

export const offlineOnuIcon = createWifiMarkerIcon({
  bg: "#ef4444",
  glow: "rgba(239,68,68,0.42)",
  svg: wifiOfflineSvg,
  size: 30,
  borderWidth: 2.5,
})

export const draftOnuIcon = createWifiMarkerIcon({
  bg: "#0891b2",
  glow: "rgba(8,145,178,0.35)",
  svg: wifiOnlineSvg,
  size: 32,
  borderWidth: 3,
  shadow: "0 0 0 6px rgba(8,145,178,0.35), 0 3px 10px rgba(0,0,0,0.45)",
})
