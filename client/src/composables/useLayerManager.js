// client/src/composables/useLayerManager.js
import L from "leaflet";
import { useLayerStore } from "../stores/layerStore";
import { useSelectionStore } from "../stores/selectionStore";
import { createSvgPin, generateUUID } from "./utils";

export function useLayerManager(map) {
  const layerStore = useLayerStore();
  const selectionStore = useSelectionStore();
  const layerRegistry = {};

  const processLayer = async (layerConf, category) => {
    // Prioritize config ID, otherwise generate one (fallback)
    const layerId = layerConf._id || generateUUID();

    if (layerConf.type === "tile") {
      const leafletLayer = L.tileLayer(layerConf.url, {
        attribution: layerConf.attribution,
      });
      layerStore.addLayer(
        layerId,
        layerConf.name,
        leafletLayer,
        "tile",
        category,
        layerConf.visible,
      );
      return;
    }

    if (layerConf.type === "geojson") {
      // 1. Initial store entry (shows up in Sidebar immediately)
      layerStore.addLayer(
        layerId,
        layerConf.name,
        null,
        "geojson",
        category,
        layerConf.visible,
        "unknown",
        layerConf.color,
      );

      // 2. Start Worker
      const worker = new Worker(
        new URL("../workers/layerWorker.js", import.meta.url),
        { type: "module" },
      );
      worker.postMessage({ url: layerConf.url, _id: layerId });

      worker.onmessage = (e) => {
        const { type, progress, data, error } = e.data;

        if (type === "PROGRESS") {
          layerStore.setLayerProgress(layerId, progress);
        } else if (type === "SUCCESS") {
          finalizeGeoJsonLayer(data, layerConf, category, layerId);
          worker.terminate();
        } else if (type === "ERROR") {
          console.error(
            `[LayerManager] Error loading ${layerConf.name}:`,
            error,
          );
          layerStore.setLayerError(layerId, error || "Failed to fetch file");
          worker.terminate();
        }
      };
    }
  };

  const finalizeGeoJsonLayer = async (data, layerConf, category, layerId) => {
    const geometryType = data.features?.[0]?.geometry?.type || "Unknown";

    const leafletLayer = L.geoJSON(null, {
      coordsToLatLng: (coords) => {
        const crs = map.options.crs;
        if (crs.projection && typeof crs.unproject === "function") {
          return crs.unproject(L.point(coords[0], coords[1]));
        }
        return L.GeoJSON.coordsToLatLng(coords);
      },
      style: () => ({
        color: layerConf.color || "#3388ff",
        weight: 2,
        fillOpacity: 0.5,
      }),
      pointToLayer: (feature, latlng) => {
        return L.marker(latlng, {
          icon: createSvgPin(layerConf.color || "#3388ff"),
        });
      },
      onEachFeature: (feature, layer) => {
        if (!feature.properties._id) feature.properties._id = generateUUID();

        feature.properties.layerId = layerId; // Use stable layerId
        layerRegistry[feature.properties.id] = layer;
        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          selectionStore.selectFeature(feature);
        });
      },
    });

    // Link leaflet instance back to store
    const storeLayer = layerStore.layers.find((l) => l.id === layerId);
    if (storeLayer) {
      storeLayer.layerInstance = leafletLayer;
      storeLayer.geometryType = geometryType;
      if (storeLayer.active) leafletLayer.addTo(map);
    }

    // Batch processing
    const features = data.features;
    const batchSize = 100;
    let index = 0;

    const processBatch = () => {
      const end = Math.min(index + batchSize, features.length);
      leafletLayer.addData(features.slice(index, end));
      index = end;

      layerStore.setLayerProgress(
        layerId,
        Math.round((index / features.length) * 100),
      );

      if (index < features.length) {
        setTimeout(processBatch, 0);
      } else {
        if (storeLayer) storeLayer.progress = 100;
      }
    };

    processBatch();
  };

  return { processLayer, layerRegistry };
}
