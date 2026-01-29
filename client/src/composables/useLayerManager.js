// client/src/composables/useLayerManager.js
import L from "leaflet";
import { watch } from "vue";
import { useLayerStore } from "../stores/layerStore";
import { useSelectionStore } from "../stores/selectionStore";
import { createSvgPin, generateUUID } from "./utils";

export function useLayerManager(map) {
  const layerStore = useLayerStore();
  const selectionStore = useSelectionStore();
  const layerRegistry = {};

  // Watcher for Lazy Loading
  watch(
    () => layerStore.layers,
    (layers) => {
      layers.forEach((layer) => {
        if (layer.active && layer.status === "idle" && layer.type === "geojson") {
          loadGeoJsonLayer(layer);
        }
      });
    },
    { deep: true }
  );

  const processLayer = async (layerConf, category) => {
    const layerId = layerConf._id || generateUUID();

    // TILE LAYERS
    if (layerConf.type === "tile") {
      const leafletLayer = L.tileLayer(layerConf.url, {
        attribution: layerConf.attribution,
        tileSize: layerConf.tileSize || 256,
      });

      layerStore.addLayer(
        layerId,
        layerConf.name,
        leafletLayer,
        "tile",
        category,
        layerConf.visible,
        "tile",
        null,
        layerConf.url
      );

      const storeLayer = layerStore.layers.find((l) => l.id === layerId);
      if (storeLayer && storeLayer.active) {
        leafletLayer.addTo(map);
      }
      return;
    }

    // GEOJSON LAYERS
    if (layerConf.type === "geojson") {
      layerStore.addLayer(
        layerId,
        layerConf.name,
        null, 
        "geojson",
        category,
        layerConf.visible,
        "unknown",
        layerConf.color,
        layerConf.url 
      );
    }
  };

  const loadGeoJsonLayer = (layer) => {
    if (__APP_DEBUG__) {
      console.group(`[LayerManager] 📥 Start Loading: "${layer.name}"`);
      console.debug(`ID: ${layer.id}`);
      console.debug(`URL: ${layer.url}`);
    }

    layerStore.setLayerStatus(layer.id, "downloading");

    const worker = new Worker(
      new URL("../workers/layerWorker.js", import.meta.url),
      { type: "module" },
    );

    // Pass the debug flag to the worker
    worker.postMessage({ 
      url: layer.url, 
      layerId: layer.id,
      layerName: layer.name,
      debug: __APP_DEBUG__ 
    });

    worker.onmessage = (e) => {
      const { type, progress, data, error } = e.data;

      if (type === "PROGRESS") {
        layerStore.setLayerProgress(layer.id, progress);

      } else if (type === "SUCCESS") {
        if (__APP_DEBUG__) console.debug(`[LayerManager - ${layer.name}] ✅ Worker finished downloading & parsing.`);
        
        layerStore.setLayerStatus(layer.id, "processing");
        layerStore.setLayerProgress(layer.id, 0);
        finalizeGeoJsonLayer(data, layer, worker);

      } else if (type === "ERROR") {
        if (__APP_DEBUG__) console.debug(`[LayerManager - ${layer.name}] ❌ Worker Error:`, error);
        
        console.error(`[LayerManager - ${layer.name}] Error loading layer}:`, error);
        layerStore.setLayerError(layer.id, error || "Failed to fetch file");
        worker.terminate();
        if (__APP_DEBUG__) console.groupEnd();
      }
    };
  };

  const finalizeGeoJsonLayer = async (data, layer, worker) => {
    const geometryType = data.features?.[0]?.geometry?.type || "Unknown";
    const totalFeatures = Array.isArray(data.features) ? data.features.length : 1;

    if (__APP_DEBUG__) {
      console.debug(`[LayerManager - ${layer.name}] ⚙️ Processing ${totalFeatures} features for rendering...`);
    }

    const leafletLayer = L.geoJSON(null, {
      coordsToLatLng: (coords) => {
        const crs = map.options.crs;
        if (crs.projection && typeof crs.unproject === "function") {
          return crs.unproject(L.point(coords[0], coords[1]));
        }
        return L.GeoJSON.coordsToLatLng(coords);
      },
      style: () => ({
        color: layer.color || "#3388ff",
        weight: 2,
        fillOpacity: 0.5,
      }),
      pointToLayer: (feature, latlng) => {
        return L.marker(latlng, {
          icon: createSvgPin(layer.color || "#3388ff"),
        });
      },
      onEachFeature: (feature, lLayer) => {
        if (!feature.properties._id) feature.properties._id = generateUUID();
        feature.properties.layerId = layer.id;
        layerRegistry[feature.properties._id] = lLayer;
        lLayer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          selectionStore.selectFeature(feature);
        });
      },
    });

    const storeLayer = layerStore.layers.find((l) => l.id === layer.id);
    if (storeLayer) {
      storeLayer.layerInstance = leafletLayer;
      storeLayer.geometryType = geometryType;
      if (storeLayer.active) leafletLayer.addTo(map);
    }

    // --- TIME-BUDGETED BATCH PROCESSING ---
    const features = Array.isArray(data.features) ? data.features : [data];
    let index = 0;
    
    // Performance Settings
    const TIME_BUDGET_MS = 12; 
    const UPDATE_THRESHOLD = 5; 
    let lastProgressUpdate = 0;
    const globalStartTime = performance.now(); // Track total render time

    const processBatch = () => {
      const startTime = performance.now();

      while (index < features.length) {
        const batchSize = 20; 
        const end = Math.min(index + batchSize, features.length);
        
        leafletLayer.addData(features.slice(index, end));
        index = end;

        if (performance.now() - startTime > TIME_BUDGET_MS) {
          break; 
        }
      }

      const currentProgress = Math.round((index / features.length) * 100);
      if (storeLayer && (currentProgress - lastProgressUpdate >= UPDATE_THRESHOLD || index === features.length)) {
        layerStore.setLayerProgress(layer.id, currentProgress, "processing");
        lastProgressUpdate = currentProgress;
      }

      if (index < features.length) {
        requestAnimationFrame(processBatch); 
      } else {
        // Done
        if (storeLayer) {
            layerStore.setLayerStatus(layer.id, "ready");
            layerStore.setLayerProgress(layer.id, 100);
        }
        worker.terminate();

        if (__APP_DEBUG__) {
          const totalTime = (performance.now() - globalStartTime).toFixed(0);
          console.debug(`[LayerManager - ${layer.name}] ✨ Render completed in ${totalTime}ms.`);
          console.groupEnd();
        }
      }
    };

    requestAnimationFrame(processBatch);
  };

  return { processLayer, layerRegistry };
}