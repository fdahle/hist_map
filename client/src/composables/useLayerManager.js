import L from "leaflet";
import { useLayerStore } from "../stores/layerStore";
import { useSelectionStore } from "../stores/selectionStore";
import { createSvgPin, generateUUID } from "./utils";

export function useLayerManager(map) {
  const layerStore = useLayerStore();
  const selectionStore = useSelectionStore();
  const layerRegistry = {};

  const processLayer = async (layerConf, category) => {
    if (__APP_DEBUG__)
      console.debug(
        `[LayerManager] Processing ${category} layer:`,
        layerConf.name,
      );

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
    } else if (layerConf.type === "geojson") {
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
      if (__APP_DEBUG__) {
        console.debug(
          `[LayerManager] Starting worker for layer: ${layerConf.name}`,
        );
      }
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
    } else {
      console.warn(
        `Unsupported layer type: ${layerConf.type} for layer ${layerConf.name}`,
      );
    }
  };

  const finalizeGeoJsonLayer = async (data, layerConf, category) => {
    const geometryType = data.features?.[0]?.geometry?.type || "Unknown";

    // 1. Create an empty GeoJSON layer container
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
        if (!feature.properties.id) feature.properties.id = generateUUID();
        // Tag the feature with its parent layer ID for the selection watcher
        feature.properties.layerId = layerConf.name;
        layerRegistry[feature.properties.id] = layer;
        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          selectionStore.selectFeature(feature);
        });
      },
    });

    // 2. Add the empty container to the map immediately
    const storeLayer = layerStore.layers.find((l) => l.id === layerConf.name);
    if (storeLayer) {
      storeLayer.layerInstance = leafletLayer;
      storeLayer.geometryType = geometryType;
      if (storeLayer.active) leafletLayer.addTo(map);
    }

    // 3. Batch processing logic
    const features = data.features;
    const batchSize = 100; // Adjust this: smaller = smoother but slower load
    let index = 0;

    const processBatch = () => {
      const end = Math.min(index + batchSize, features.length);
      const chunk = features.slice(index, end);

      leafletLayer.addData(chunk); // Add the chunk to the existing layer
      index = end;

      // Update progress in the store based on processing, not just downloading
      const currentProgress = Math.round((index / features.length) * 100);
      layerStore.setLayerProgress(layerConf.name, currentProgress);

      if (index < features.length) {
        // Small timeout allows the UI to remain responsive
        setTimeout(processBatch, 0);
      } else {
        if (storeLayer) storeLayer.progress = 100;
        if (__APP_DEBUG__)
          console.log(
            `[LayerManager] Finished batch loading: ${layerConf.name}`,
          );
      }
    };

    // Start the first batch
    processBatch();
  };

  return { processLayer, layerRegistry };
}
