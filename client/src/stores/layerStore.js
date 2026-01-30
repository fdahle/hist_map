// client/src/stores/layerStore.js
import { defineStore } from "pinia";
import { markRaw, ref, computed, nextTick } from "vue";
import { useMapStore } from "./mapStore";
// 1. Updated Import (OpenLayers Style Helper)
import { createPinStyle } from "../composables/utils"; 
// 2. OpenLayers Style Imports
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
    url = null,
  ) => {
    if (layers.value.some((l) => l._layerId === layerId)) return;

    let initialStatus = "ready";
    if (type === "geojson" && !layerInstance) {
      initialStatus = "idle";
    }

    layers.value.push({
      _layerId: layerId,
      name,
      type,
      category,
      active: isVisible,
      // OpenLayers layers are objects too, markRaw is still good practice
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

  const debouncedProgressUpdates = new Map();
  
  const setLayerProgress = (layerId, progress) => {
    const layer = layers.value.find((l) => l._layerId === layerId);
    if (!layer) return;

    if (progress === 100) {
      layer.progress = progress;
      return;
    }

    if (!debouncedProgressUpdates.has(layerId)) {
      debouncedProgressUpdates.set(
        layerId,
        debounce((prog) => {
          const l = layers.value.find((layer) => layer._layerId === layerId);
          if (l) l.progress = prog;
        }, 50)
      );
    }

    debouncedProgressUpdates.get(layerId)(progress);
  };

  const setLayerStatus = (layerId, status) => {
    const layer = layers.value.find((l) => l._layerId === layerId);
    if (layer) layer.status = status;
  };

  const setLayerError = (layerId, errorMessage) => {
    const layer = layers.value.find((l) => l._layerId === layerId);
    if (layer) {
      layer.error = errorMessage;
      layer.status = "error";
      layer.progress = 0;
    }
  };

  const retryLayer = (layerId) => {
    const layer = layers.value.find((l) => l._layerId === layerId);
    if (layer && layer.status === 'error') {
      layer.status = 'idle';
      layer.error = null;
      layer.progress = 0;
      layer.active = true;
    }
  };

  const cancelLayerLoad = (layerId) => {
    const layer = layers.value.find((l) => l._layerId === layerId);
    if (layer && ['downloading', 'processing', 'loading-details'].includes(layer.status)) {
      layer.status = 'idle';
      layer.progress = 0;
      layer.active = false;
    }
  };

  // 3. UPDATED: Toggle Logic using setVisible() instead of add/remove
  const toggleLayer = async (layerId) => {
    const layer = layers.value.find((l) => l._layerId === layerId);

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
          if (l.layerInstance) l.layerInstance.setVisible(false); // OL Method
        }
      });
      
      // Enable this one
      layer.active = true;
      if (layer.layerInstance) layer.layerInstance.setVisible(true); // OL Method
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

  // 4. UPDATED: Color Update Logic for OpenLayers
  const updateLayerColor = (layerId, newColor) => {
    const layerObj = layers.value.find((l) => l._layerId === layerId);
    if (!layerObj || !layerObj.layerInstance) return;

    layerObj.color = newColor;
    const olLayer = layerObj.layerInstance;

    // Define new styles with the new color
    const newVectorStyle = new Style({
        stroke: new Stroke({ color: newColor, width: 2 }),
        fill: new Fill({ color: newColor + "80" }) // Add transparency
    });
    
    const newPinStyle = createPinStyle(newColor);

    // Apply via Style Function (Standard OL way to handle dynamic styles)
    if (olLayer.setStyle) {
        olLayer.setStyle((feature) => {
            const type = feature.getGeometry().getType();
            if (type === "Point" || type === "MultiPoint") {
                return newPinStyle;
            }
            return newVectorStyle;
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