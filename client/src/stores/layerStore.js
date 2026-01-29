// client/src/stores/layerStore.js
import { defineStore } from "pinia";
import { ref, computed } from "vue";
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
  ) => {
    // skip if layer with same ID already exists (safeguard against refresh duplicates)
    if (layers.value.some((l) => l.id === id)) return;

    // loading is dependent on type and instance
    let isLoading = false;
    if (type === "geojson" && !layerInstance) {
      isLoading = true;
    } 

    layers.value.push({
      id,
      name,
      type,
      category,
      active: isVisible,
      layerInstance,
      geometryType: geometryType || "unknown",
      color: color || "#3388ff",
      progress: 0,
      loading: isLoading,
      error: null,
    });
  };

  // reset store (e.g. on map removal)
  const reset = () => {
    layers.value = [];
  };

  const setLayerProgress = (layerId, progress) => {
    const layer = layers.value.find((l) => l.id === layerId);
    if (layer) layer.progress = progress;
  };

  const setLayerError = (layerId, errorMessage) => {
    const layer = layers.value.find((l) => l.id === layerId);
    if (layer) {
      layer.error = errorMessage;
      layer.loading = false;
      layer.progress = 0;
    }
  };

  const toggleLayer = (index) => {
    const layer = layers.value[index];
if (!layer || layer.error || layer.loading || !layer.layerInstance) return;
    const mapStore = useMapStore();
    const map = mapStore.getMap();
    if (!map) return;

    if (layer.category === "base") {
      if (layer.active) return;
      layers.value.forEach((l) => {
        if (l.category === "base" && l.active) {
          l.active = false;
          map.removeLayer(l.layerInstance);
        }
      });
      layer.active = true;
      map.addLayer(layer.layerInstance);
    } else {
      layer.active = !layer.active;
      layer.active
        ? map.addLayer(layer.layerInstance)
        : map.removeLayer(layer.layerInstance);
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
    setLayerError,
    updateLayerColor,
  };
});
