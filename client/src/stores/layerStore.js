// client/src/stores/layerStore.js
import { defineStore } from "pinia";
import { markRaw, ref, computed } from "vue";
import { useMapStore } from "./mapStore";
import { createSvgPin } from "../composables/utils";

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
    url = null, // 1. Added URL parameter for lazy loading
  ) => {
    // skip if layer with same ID already exists
    if (layers.value.some((l) => l.id === id)) return;

    // 2. Determine initial status
    let initialStatus = "ready";
    if (type === "geojson" && !layerInstance) {
      initialStatus = "idle"; // Default to idle for GeoJSON without data
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
      status: initialStatus, // 3. Added status field
      error: null,
    });
  };

  const reset = () => {
    layers.value = [];
  };

  const setLayerProgress = (layerId, progress) => {
    const layer = layers.value.find((l) => l.id === layerId);
    if (layer) layer.progress = progress;
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

  // 5. Fixed toggleLayer to handle IDs and Lazy Loading
  const toggleLayer = (layerId) => {
    const layer = layers.value.find((l) => l.id === layerId);

    // Allow toggling if it's idle (to trigger load) or ready. Block if error/loading.
    if (
      !layer ||
      layer.status === "error" ||
      layer.status === "downloading" ||
      layer.status === "processing"
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
      layer.active = !layer.active;

      // Only toggle on map if the instance exists.
      // If status is 'idle', the Watcher in useLayerManager will see 'active=true' and start loading.
      if (layer.layerInstance) {
        layer.active
          ? map.addLayer(layer.layerInstance)
          : map.removeLayer(layer.layerInstance);
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
  };
});
