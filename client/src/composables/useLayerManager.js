import L from "leaflet";
import { useLayerStore } from "../stores/layerStore";
import { useSelectionStore } from "../stores/selectionStore";
import { generateUUID } from "./utils";

// helper function for svg markers
export const createSvgPin = (color) => {
  const svgTemplate = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" style="filter: drop-shadow(1px 2px 2px rgba(0,0,0,0.3));">
      <path fill="${color}" stroke="${color}" stroke-width="1" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle cx="12" cy="9" r="3" fill="#fff"/>
    </svg>
  `;

  return L.divIcon({
    className: "custom-svg-marker",
    html: svgTemplate,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -34],
  });
};

export function useLayerManager(map) {
  const layerStore = useLayerStore();
  const selectionStore = useSelectionStore();
  const layerRegistry = {};

  const processLayer = async (layerConf, category) => {
    if (layerConf.type === "tile") {
      // Tile layers are already handled efficiently by Leaflet
      const leafletLayer = L.tileLayer(layerConf.url, {
        attribution: layerConf.attribution,
      });
      layerStore.addLayer(
        layerConf.name,
        leafletLayer,
        "tile",
        category,
        layerConf.visible,
      );
      return;
    }

    if (layerConf.type === "geojson") {
      // 1. Initial store entry for UI feedback
      layerStore.addLayer(
        layerConf.name,
        null,
        "geojson",
        category,
        layerConf.visible,
        "unknown",
        layerConf.color,
      );

      // 2. Initialize Worker
      // Note: If using Vite, use: new Worker(new URL('../workers/layerWorker.js', import.meta.url))
      const worker = new Worker(
        new URL("../workers/layerWorker.js", import.meta.url),
        { type: "module" },
      );

      worker.postMessage({ url: layerConf.url, layerName: layerConf.name });

      worker.onmessage = (e) => {
        const { type, progress, data, error } = e.data;

        if (type === "PROGRESS") {
          layerStore.setLayerProgress(layerConf.name, progress);
        } else if (type === "SUCCESS") {
          finalizeGeoJsonLayer(data, layerConf, category);
          worker.terminate(); // Clean up worker
        } else if (type === "ERROR") {
          console.error(`Worker error loading ${layerConf.name}:`, error);
          worker.terminate();
        }
      };
    }
  };

  // Logic to turn the raw data from the worker into a Leaflet layer
  const finalizeGeoJsonLayer = (data, layerConf, category) => {
    let geometryType =
      data.features?.length > 0 ? data.features[0].geometry.type : "unknown";

    const leafletLayer = L.geoJSON(data, {
      style: {
        color: layerConf.color || "#3388ff",
        fillColor: layerConf.color || "#3388ff",
        weight: 2,
        fillOpacity: 0.6,
      },
      pointToLayer: (feature, latlng) => {
        return L.marker(latlng, {
          icon: createSvgPin(layerConf.color || "#3388ff"),
        });
      },
      onEachFeature: (feature, layer) => {
        if (!feature.properties.id) feature.properties.id = generateUUID();
        layerRegistry[feature.properties.id] = layer;
        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          selectionStore.selectFeature(feature);
        });
      },
    });

    // Update Store
    const storeLayer = layerStore.layers.find((l) => l.id === layerConf.name);
    if (storeLayer) {
      storeLayer.layerInstance = leafletLayer;
      storeLayer.geometryType = geometryType;
      storeLayer.progress = 100;
      if (storeLayer.active) leafletLayer.addTo(map);
    }
  };

  return { processLayer, layerRegistry };
}
