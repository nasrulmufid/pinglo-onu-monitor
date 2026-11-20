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

function createTargetPinMarkerIcon(options: { isOnline: boolean }) {
  const gradId = options.isOnline ? "pinglo-target-grad-online" : "pinglo-target-grad-offline"
  const svg = options.isOnline ? wifiOnlineSvg : wifiOfflineSvg
  const statusColor = options.isOnline ? "#10b981" : "#ef4444"

  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:44px;height:54px;">
      <span class="pinglo-target-pulse" style="position:absolute;left:22px;top:50px;width:24px;height:24px;border-radius:9999px;border:2.5px solid #f59e0b;background:rgba(245,158,11,0.28);box-shadow:0 0 0 2px rgba(245,158,11,0.55);pointer-events:none;"></span>
      <svg xmlns="http://www.w3.org/2000/svg" width="44" height="54" viewBox="0 0 44 54" style="display:block;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.45));">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#d97706"/>
          </linearGradient>
        </defs>
        <path d="M22 3C11.507 3 3 11.507 3 22c0 12.1 14.2 24.4 17.75 27.3a2 2 0 0 0 2.5 0C26.8 46.4 41 34.1 41 22 41 11.507 32.493 3 22 3Z" fill="url(#${gradId})" stroke="#ffffff" stroke-width="2.5"/>
      </svg>
      <div style="position:absolute;left:12px;top:11px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;pointer-events:none;">${svg}</div>
      <span style="position:absolute;right:3px;top:3px;width:12px;height:12px;border-radius:9999px;background:${statusColor};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);pointer-events:none;"></span>
    </div>`,
    iconSize: [44, 54],
    iconAnchor: [22, 50],
    popupAnchor: [0, -52],
  })
}

export const targetOnlineOnuIcon = createTargetPinMarkerIcon({ isOnline: true })
export const targetOfflineOnuIcon = createTargetPinMarkerIcon({ isOnline: false })
