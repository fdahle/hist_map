// client/src/composables/useLayerManager.js
import L from "leaflet";
import { watch, nextTick } from "vue";
import { useLayerStore } from "../stores/layerStore";
import { useSelectionStore } from "../stores/selectionStore";
import { createSvgPin, generateUUID } from "./utils";

export function useLayerManager(map) {
  const layerStore = useLayerStore();
  const selectionStore = useSelectionStore();
  const layerRegistry = {};
  const activeWorkers = new Map();

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
      console.group(`[LayerManager] 🔥 Start Loading: "${layer.name}"`);
      console.debug(`ID: ${layer.id}`);
      console.debug(`URL: ${layer.url}`);
    }

    // Cancel existing worker if layer is being reloaded
    if (activeWorkers.has(layer.id)) {
      activeWorkers.get(layer.id).terminate();
      activeWorkers.delete(layer.id);
    }

    layerStore.setLayerStatus(layer.id, "downloading");

    const worker = new Worker(
      new URL("../workers/layerWorker.js", import.meta.url),
      { type: "module" },
    );

    activeWorkers.set(layer.id, worker);

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
        
        console.error(`[LayerManager - ${layer.name}] Error loading layer:`, error);
        layerStore.setLayerError(layer.id, error || "Failed to fetch file");
        
        activeWorkers.delete(layer.id);
        worker.terminate();
        
        if (__APP_DEBUG__) console.groupEnd();
      }
    };

    worker.onerror = (err) => {
      console.error(`[LayerManager - ${layer.name}] Worker crashed:`, err);
      layerStore.setLayerError(layer.id, "Worker crashed");
      activeWorkers.delete(layer.id);
      worker.terminate();
      if (__APP_DEBUG__) console.groupEnd();
    };
  };

  const finalizeGeoJsonLayer = async (data, layer, worker) => {
    const geometryType = data.features?.[0]?.geometry?.type || "Unknown";
    const totalFeatures = Array.isArray(data.features) ? data.features.length : 1;

    if (__APP_DEBUG__) {
      console.debug(`[LayerManager - ${layer.name}] ⚙️ Processing ${totalFeatures} features for rendering...`);
    }

    // CRITICAL: Create layer but DON'T add to map yet
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
        feature.properties._layerId = layer._id;
        layerRegistry[feature.properties._id] = lLayer;
        lLayer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          selectionStore.selectFeature(feature);
        });
      },
    });

    // Store the layer instance immediately
    const storeLayer = layerStore.layers.find((l) => l.id === layer.id);
    if (storeLayer) {
      storeLayer.layerInstance = leafletLayer;
      storeLayer.geometryType = geometryType;
      // DON'T add to map yet - wait until all features are loaded
    }

    // --- TIME-BUDGETED BATCH PROCESSING ---
    const features = Array.isArray(data.features) ? data.features : [data];
    let index = 0;
    
    // Performance settings optimized for your glaciers
    const TIME_BUDGET_MS = 6;     // Even shorter for better responsiveness
    const UPDATE_THRESHOLD = 15;   // Update every 15% to reduce reactivity
    let lastProgressUpdate = 0;
    const globalStartTime = performance.now();

    // For very large datasets, show preview first
    const PREVIEW_THRESHOLD = 5000;
    if (features.length > PREVIEW_THRESHOLD) {
      if (__APP_DEBUG__) {
        console.debug(`[LayerManager - ${layer.name}] 📸 Large dataset detected (${totalFeatures} features). Showing preview...`);
      }
      
      const previewFeatures = features.filter((_, i) => i % 10 === 0);
      leafletLayer.addData(previewFeatures);
      layerStore.setLayerStatus(layer.id, "loading-details");
      
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const processBatch = () => {
      const startTime = performance.now();

      while (index < features.length) {
        // REDUCED: Even smaller batches for complex polygons
        const batchSize = 5;  // Your glaciers are complex, use smaller batches
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
        // CRITICAL FIX: Only add to map AFTER all features are loaded
        finishLayerRendering(leafletLayer, layer, storeLayer, worker, globalStartTime);
      }
    };

    requestAnimationFrame(processBatch);
  };

  // NEW: Separate function to add layer to map after all features loaded
  const finishLayerRendering = async (leafletLayer, layer, storeLayer, worker, startTime) => {
    if (__APP_DEBUG__) {
      const totalTime = (performance.now() - startTime).toFixed(0);
      console.debug(`[LayerManager - ${layer.name}] ✅ All features loaded in ${totalTime}ms`);
      console.debug(`[LayerManager - ${layer.name}] 🗺️ Adding to map...`);
    }

    // Update status to "ready" BEFORE adding to map
    if (storeLayer) {
      layerStore.setLayerStatus(layer.id, "ready");
      layerStore.setLayerProgress(layer.id, 100);
    }

    // Add to map in next frame to avoid blocking
    await nextTick();
    
    requestAnimationFrame(() => {
      // Only add if layer is still active
      if (storeLayer && storeLayer.active) {
        leafletLayer.addTo(map);
        
        if (__APP_DEBUG__) {
          const finalTime = (performance.now() - startTime).toFixed(0);
          console.debug(`[LayerManager - ${layer.name}] ✨ Fully rendered & visible in ${finalTime}ms`);
          console.groupEnd();
        }
      } else if (__APP_DEBUG__) {
        console.debug(`[LayerManager - ${layer.name}] ⏸️ Layer loaded but not visible (inactive)`);
        console.groupEnd();
      }
      
      // Cleanup worker
      activeWorkers.delete(layer.id);
      worker.terminate();
    });
  };

  // Cleanup function to terminate all workers
  const cleanup = () => {
    activeWorkers.forEach((worker, layerId) => {
      if (__APP_DEBUG__) {
        console.debug(`[LayerManager] 🧹 Terminating worker for layer: ${layerId}`);
      }
      worker.terminate();
    });
    activeWorkers.clear();
  };

  return { processLayer, layerRegistry, cleanup };
}