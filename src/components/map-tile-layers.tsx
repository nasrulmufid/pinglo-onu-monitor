import { TileLayer } from "react-leaflet"

export type MapLayerMode = "satellite" | "esri" | "osm"

export function MapTileLayers({ layer }: { layer: MapLayerMode }) {
  if (layer === "satellite") {
    return (
      <TileLayer
        key="google-hybrid"
        attribution="&copy; Google Maps"
        url="https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
        subdomains={["mt0", "mt1", "mt2", "mt3"]}
        maxNativeZoom={20}
        maxZoom={21}
      />
    )
  }

  if (layer === "esri") {
    return (
      <>
        <TileLayer
          key="esri-imagery"
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxNativeZoom={19}
          maxZoom={21}
        />
        <TileLayer
          key="esri-roads"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
          maxNativeZoom={19}
          maxZoom={21}
        />
        <TileLayer
          key="esri-places"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          maxNativeZoom={19}
          maxZoom={21}
        />
      </>
    )
  }

  return (
    <TileLayer
      key="osm"
      attribution="&copy; OpenStreetMap contributors"
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      maxNativeZoom={19}
      maxZoom={21}
    />
  )
}
