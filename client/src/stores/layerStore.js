// client/src/stores/layerStore.js
import { defineStore } from "pinia";
import { markRaw, ref, computed, nextTick } from "vue";
import { useMapStore } from "./mapStore";
import { createSvgPin } from "../composables/utils";

// Simple debounce implementation
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export const useLayerStore = defineStore("layers", () => {
  const layers = ref([]);

  // --- ACTIONS ---
  const addLayer = (
    id,
    name,
    layerInstance,
    type,
    category,
    isVisible,
    geometryType,
    color,
    url = null,
  ) => {
    // skip if layer with same ID already exists
    if (layers.value.some((l) => l.id === id)) return;

    // Determine initial status
    let initialStatus = "ready";
    if (type === "geojson" && !layerInstance) {
      initialStatus = "idle";
    }

    layers.value.push({
      id,
      name,
      type,
      category,
      active: isVisible,
      layerInstance: layerInstance ? markRaw(layerInstance) : null,
      geometryType: geometryType || "unknown",
      color: color || "#3388ff",
      url,
      progress: 0,
      status: initialStatus,
      error: null,
    });
  };

  const reset = () => {
    layers.value = [];
  };

  // Debounced progress update to reduce reactivity overhead
  const debouncedProgressUpdates = new Map();
  
  const setLayerProgress = (layerId, progress) => {
    const layer = layers.value.find((l) => l.id === layerId);
    if (!layer) return;

    // For 100% progress, update immediately (no debounce)
    if (progress === 100) {
      layer.progress = progress;
      return;
    }

    // For other values, debounce to reduce reactivity triggers
    if (!debouncedProgressUpdates.has(layerId)) {
      debouncedProgressUpdates.set(
        layerId,
        debounce((prog) => {
          const l = layers.value.find((layer) => layer.id === layerId);
          if (l) l.progress = prog;
        }, 50)
      );
    }

    debouncedProgressUpdates.get(layerId)(progress);
  };

  const setLayerStatus = (layerId, status) => {
    const layer = layers.value.find((l) => l.id === layerId);
    if (layer) layer.status = status;
  };

  const setLayerError = (layerId, errorMessage) => {
    const layer = layers.value.find((l) => l.id === layerId);
    if (layer) {
      layer.error = errorMessage;
      layer.status = "error";
      layer.progress = 0;
    }
  };

  const retryLayer = (layerId) => {
    const layer = layers.value.find((l) => l.id === layerId);
    if (layer && layer.status === 'error') {
      layer.status = 'idle';
      layer.error = null;
      layer.progress = 0;
      layer.active = true;
    }
  };

  const cancelLayerLoad = (layerId) => {
    const layer = layers.value.find((l) => l.id === layerId);
    if (layer && ['downloading', 'processing', 'loading-details'].includes(layer.status)) {
      layer.status = 'idle';
      layer.progress = 0;
      layer.active = false;
    }
  };

  // IMPROVED: Async toggle that doesn't block the UI
  const toggleLayer = async (layerId) => {
    const layer = layers.value.find((l) => l.id === layerId);

    if (
      !layer ||
      layer.status === "error" ||
      layer.status === "downloading" ||
      layer.status === "processing" ||
      layer.status === "loading-details"
    )
      return;

    const mapStore = useMapStore();
    const map = mapStore.getMap();
    if (!map) return;

    if (layer.category === "base") {
      if (layer.active) return;
      layers.value.forEach((l) => {
        if (l.category === "base" && l.active) {
          l.active = false;
          if (l.layerInstance) map.removeLayer(l.layerInstance);
        }
      });
      layer.active = true;
      if (layer.layerInstance) map.addLayer(layer.layerInstance);
    } else {
      // CRITICAL FIX: Don't block UI on toggle
      const targetState = !layer.active;
      
      // Update state immediately for UI responsiveness
      layer.active = targetState;
      
      // Defer the actual map operation to next tick
      await nextTick();
      
      if (layer.layerInstance) {
        // Use requestAnimationFrame to ensure smooth transition
        requestAnimationFrame(() => {
          if (targetState) {
            map.addLayer(layer.layerInstance);
          } else {
            map.removeLayer(layer.layerInstance);
          }
        });
      }
    }
  };

  const updateLayerColor = (layerId, newColor) => {
    const layerObj = layers.value.find((l) => l.id === layerId);
    if (!layerObj || !layerObj.layerInstance) return;

    layerObj.color = newColor;
    const leafletLayer = layerObj.layerInstance;

    if (layerObj.type === "geojson" && leafletLayer.eachLayer) {
      leafletLayer.eachLayer((featureLayer) => {
        if (featureLayer.setStyle) {
          featureLayer.setStyle({
            color: newColor,
            fillColor: newColor,
            originalColor: newColor,
            originalFillColor: newColor,
          });
        }
        if (featureLayer instanceof L.Marker && featureLayer.setIcon) {
          featureLayer.setIcon(createSvgPin(newColor));
        }
      });
    }
  };

  // --- GETTERS ---
  const baseLayers = computed(() =>
    layers.value.filter((l) => l.category === "base"),
  );
  const overlayLayers = computed(() =>
    layers.value.filter((l) => l.category === "overlay"),
  );

  return {
    layers,
    baseLayers,
    overlayLayers,
    addLayer,
    reset,
    toggleLayer,
    setLayerProgress,
    setLayerStatus,
    setLayerError,
    updateLayerColor,
    retryLayer,
    cancelLayerLoad,
  };
});