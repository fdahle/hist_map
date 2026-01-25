import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useMapStore } from "./mapStore";
import { createSvgPin } from "../composables/useLayerManager"; //

export const useLayerStore = defineStore("layers", () => {
  const layers = ref([]);

  // --- ACTIONS ---

  // UPDATED: Added geometryType and color to the arguments
  const addLayer = (
    name,
    layerInstance,
    type,
    category,
    isVisible,
    geometryType,
    color,
  ) => {
    layers.value.push({
      id: name,
      name,
      type,
      category,
      active: isVisible,
      layerInstance,
      geometryType: geometryType || "unknown",
      color: color || "#3388ff",
      progess: 100,
      loading: false,
    });
  };

  const setLayerProgress = (layerId, progress) => {
    const layer = layers.value.find((l) => l.id === layerId);
    if (layer) {
      layer.progress = progress;
    }
  };

  const toggleLayer = (index) => {
    const layer = layers.value[index];
    if (!layer) return;

    // GUARD: If the layer is still downloading (instance is null),
    // don't try to add it to the map yet.
    if (!layer || !layer.layerInstance) {
      console.warn(`Layer "${layer?.name}" is still loading...`);
      return;
    }

    const mapStore = useMapStore();
    const map = mapStore.getMap();

    if (!map) {
      console.error("Map not initialized yet!");
      return;
    }

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
      if (layer.active) {
        map.addLayer(layer.layerInstance);
      } else {
        map.removeLayer(layer.layerInstance);
      }
    }
  };

  const updateLayerColor = (layerId, newColor) => {
    const layerObj = layers.value.find((l) => l.id === layerId);
    if (!layerObj || !layerObj.layerInstance) return;

    // 1. Update the Store State
    layerObj.color = newColor;

    // 2. Update the Leaflet Instance
    const leafletLayer = layerObj.layerInstance;

    // If it's a GeoJSON layer, we need to iterate its internal features
    if (layerObj.type === "geojson" && leafletLayer.eachLayer) {
      leafletLayer.eachLayer((featureLayer) => {
        // Handle Polygons/Lines/CircleMarkers (Vector layers)
        if (featureLayer.setStyle) {
          featureLayer.setStyle({
            color: newColor,
            fillColor: newColor,
            // Update the original colors so selection highlighting still works
            originalColor: newColor,
            originalFillColor: newColor,
          });
        }

        // Handle Markers (Pins with SVG Icons)
        if (featureLayer instanceof L.Marker && featureLayer.setIcon) {
          // Note: You should move createSvgPin to a shared utils.js file
          featureLayer.setIcon(createSvgPin(newColor));
        }
      });
    }

    // Update the layer instance options for persistence
    if (leafletLayer.options) {
      leafletLayer.options.color = newColor;
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
    toggleLayer,
    setLayerProgress,
    updateLayerColor,
  };
});
