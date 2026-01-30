// client/src/stores/layerStore.js
import { defineStore } from "pinia";
import { markRaw, ref, computed } from "vue";
import { createPinStyle } from "../composables/utils"; 
import { Style, Stroke, Fill } from "ol/style"; 

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
  
  // Index for O(1) layer lookups by ID
  const layerIndex = new Map();

  // --- ACTIONS ---
  const addLayer = (
    layerId,
    name,
    layerInstance,
    type,
    category,
    isVisible,
    geometryType,
    color,
    order = 0,
    url = null,
  ) => {
    if (layers.value.some((l) => l._layerId === layerId)) return;

    let initialStatus = "ready";
    if (type === "geojson" && !layerInstance) {
      initialStatus = "idle";
    }

    // Set z-index based on category
    let zIndex = 0;
    if (category === "base") {
      zIndex = 0; // Base layers at bottom
    } else if (category === "overlay") {
      zIndex = 100; // Overlay layers on top
    }

    if (layerInstance) {
      layerInstance.setZIndex(zIndex);
    }

    const layerObj = {
      _layerId: layerId,
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
      zIndex: zIndex,
    };
    layers.value.push(layerObj);
    layerIndex.set(layerId, layerObj);
  };

  const reset = () => {
    layers.value = [];
    layerIndex.clear();
  };

  // O(1) lookup helper
  const getLayerById = (layerId) => layerIndex.get(layerId);

  const debouncedProgressUpdates = new Map();
  
  const setLayerProgress = (layerId, progress) => {
    const layer = layerIndex.get(layerId);
    if (!layer) return;

    if (progress === 100) {
      layer.progress = progress;
      return;
    }

    if (!debouncedProgressUpdates.has(layerId)) {
      debouncedProgressUpdates.set(
        layerId,
        debounce((prog) => {
          const l = layerIndex.get(layerId);
          if (l) l.progress = prog;
        }, 50)
      );
    }

    debouncedProgressUpdates.get(layerId)(progress);
  };

  const setLayerStatus = (layerId, status) => {
    const layer = layerIndex.get(layerId);
    if (layer) layer.status = status;
  };

  const setLayerError = (layerId, errorMessage) => {
    const layer = layerIndex.get(layerId);
    if (layer) {
      layer.error = errorMessage;
      layer.status = "error";
      layer.progress = 0;
    }
  };

  const retryLayer = (layerId) => {
    const layer = layerIndex.get(layerId);
    if (layer && layer.status === 'error') {
      layer.status = 'idle';
      layer.error = null;
      layer.progress = 0;
      layer.active = true;
    }
  };

  const cancelLayerLoad = (layerId) => {
    const layer = layerIndex.get(layerId);
    if (layer && ['downloading', 'processing', 'loading-details'].includes(layer.status)) {
      layer.status = 'idle';
      layer.progress = 0;
      layer.active = false;
    }
  };

  // UPDATED: Toggle Logic - ONLY changes visibility, doesn't add/remove from map
  const toggleLayer = async (layerId) => {
    const layer = layerIndex.get(layerId);

    if (
      !layer ||
      layer.status === "error" ||
      layer.status === "downloading" ||
      layer.status === "processing" ||
      layer.status === "loading-details"
    )
      return;

    // BASE LAYER LOGIC
    if (layer.category === "base") {
      if (layer.active) return;
      
      // Disable other base layers
      layers.value.forEach((l) => {
        if (l.category === "base" && l.active) {
          l.active = false;
          if (l.layerInstance) l.layerInstance.setVisible(false);
        }
      });
      
      // Enable this one
      layer.active = true;
      if (layer.layerInstance) layer.layerInstance.setVisible(true);
    } 
    // OVERLAY LAYER LOGIC
    else {
      layer.active = !layer.active;
      
      // Update OpenLayers Visibility
      if (layer.layerInstance) {
         layer.layerInstance.setVisible(layer.active);
      }
    }
  };

  // UPDATED: Color Update Logic for OpenLayers - applies style per feature for performance
  const updateLayerColor = (layerId, newColor) => {
    const layerObj = layerIndex.get(layerId);
    if (!layerObj || !layerObj.layerInstance) return;

    layerObj.color = newColor;
    const olLayer = layerObj.layerInstance;
    const source = olLayer.getSource();
    if (!source) return;

    // Create new styles
    const newVectorStyle = new Style({
        stroke: new Stroke({ color: newColor, width: 2 }),
        fill: new Fill({ color: newColor + "80" })
    });
    const newPinStyle = createPinStyle(newColor);

    // Apply style directly to each feature (better performance than style function)
    source.getFeatures().forEach(feature => {
      const type = feature.getGeometry().getType();
      if (type === "Point" || type === "MultiPoint") {
        feature.setStyle(newPinStyle);
      } else {
        feature.setStyle(newVectorStyle);
      }
    });
    
    // Clear layer style function to use per-feature styles
    olLayer.setStyle(null);
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
    getLayerById,
    toggleLayer,
    setLayerProgress,
    setLayerStatus,
    setLayerError,
    updateLayerColor,
    retryLayer,
    cancelLayerLoad,
  };
});