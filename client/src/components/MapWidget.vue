<template>
  <div class="map-container">
    <div id="map" ref="mapContainer"></div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, inject, ref, watch } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// --- IMPORTS ---
import { getProjectedCRS } from "../constants/crs";
import { useMapStore } from "../stores/mapStore";
import { useSelectionStore } from "../stores/selectionStore";
import { useLayerStore } from "../stores/layerStore";
import { useLayerManager } from "../composables/useLayerManager"; // Import createSvgPin
import { createSvgPin } from "../composables/utils";

// --- CONFIG & STORES ---
const configRef = inject("config");
const config = configRef.value;
const mapStore = useMapStore();
const selectionStore = useSelectionStore();
const layerStore = useLayerStore();

// --- STATE ---
const mapContainer = ref(null);
let map = null;
let resizeObserver = null;
let layerRegistry = null;
let layerManagerCleanup = null; // ADDED: Store cleanup function

/**
 * Updates the visual style of a Leaflet layer group.
 * Handles both Vector layers (setStyle) and Markers (setIcon).
 */
const applyColorToLeafletLayer = (leafletLayer, newColor) => {
  if (!leafletLayer || typeof leafletLayer.eachLayer !== "function") return;

  leafletLayer.eachLayer((subLayer) => {
    // 1. Handle Polygons / Lines / CircleMarkers
    if (subLayer.setStyle) {
      subLayer.setStyle({
        color: newColor,
        fillColor: newColor,
        originalColor: newColor,
        originalFillColor: newColor,
      });
    }

    // 2. Handle Markers (Pins) - THIS WAS THE MISSING PART
    if (subLayer instanceof L.Marker && subLayer.setIcon) {
      subLayer.setIcon(createSvgPin(newColor));
    }
  });
};

// This function bridges the Sidebar's event to the Store and Map
const handleColorChange = ({ color, layer }) => {
  // 1. Update Pinia Store state (persistence)
  layerStore.updateLayerColor(layer._layerId, color);

  // 2. Update Map Visuals immediately
  applyColorToLeafletLayer(layer.layerInstance, color);
};

onMounted(async () => {
  if (!mapContainer.value) return;

  // The code is now projection-agnostic
  const selectedCrs = getProjectedCRS(config);

  map = L.map(mapContainer.value, {
    crs: selectedCrs,
    renderer: L.canvas({ tolerance: 5 }),
    center: config.view.center,
    zoom: config.view.zoom,
    maxBounds: selectedCrs.options.bounds || null, // Only bounds the map if defined
    zoomControl: false,
  });
  mapStore.setMap(map);

  const manager = useLayerManager(map);
  layerRegistry = manager.layerRegistry;
  layerManagerCleanup = manager.cleanup; // ADDED: Store cleanup function

  const promises = [];
  if (config.base_layers) {
    promises.push(
      ...config.base_layers.map((l) => manager.processLayer(l, "base"))
    );
  }
  if (config.overlay_layers) {
    promises.push(
      ...config.overlay_layers.map((l) => manager.processLayer(l, "overlay"))
    );
  }
  await Promise.all(promises);

  resizeObserver = new ResizeObserver(() => map.invalidateSize());
  resizeObserver.observe(mapContainer.value);
});

// --- WATCHER (Selection Highlighting) ---
watch(
  () => selectionStore.selectedFeature,
  (newFeature, oldFeature) => {
    if (!layerRegistry) return;

    // FIXED: Use _featureId instead of id
    if (oldFeature?.properties?._featureId) {
      const oldLayer = layerRegistry[oldFeature.properties._featureId];
      if (oldLayer && oldLayer.setStyle) {
        // Reset to the current layer color (not just hardcoded blue)
        const parentLayer = layerStore.layers.find(
          (l) => l._layerId === oldFeature.properties._layerId
        );
        const baseColor = parentLayer?.color || "#3388ff";

        oldLayer.setStyle({
          weight: 2,
          color: baseColor,
        });
      }
    }

    // FIXED: Use _id instead of id
    if (newFeature?.properties?._featureId) {
      const newLayer = layerRegistry[newFeature.properties._featureId];
      if (newLayer && newLayer.setStyle) {
        newLayer.setStyle({
          weight: 5,
          color: "#FFFF00", // Selection Highlight
        });
        newLayer.bringToFront();
      }
    }
  }
);

onUnmounted(() => {
  // ADDED: Cleanup workers first
  if (layerManagerCleanup) {
    layerManagerCleanup();
  }

  // disconnect resize observer
  if (resizeObserver) resizeObserver.disconnect();

  // reset layers
  layerStore.reset();

  // remove map
  if (map) map.remove();
});
</script>

<style scoped>
.map-container {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 100%;
}

#map {
  height: 100%;
  width: 100%;
  z-index: 1;
  background: #ddd;
}
</style>