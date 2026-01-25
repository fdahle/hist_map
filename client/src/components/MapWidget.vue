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
import { CRS_MAP } from "../constants/crs";
import { useMapStore } from "../stores/mapStore";
import { useSelectionStore } from "../stores/selectionStore";
import { useLayerStore } from "../stores/layerStore";
import { useLayerManager, createSvgPin } from "../composables/useLayerManager"; // Import createSvgPin

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
  layerStore.updateLayerColor(layer.id, color);

  // 2. Update Map Visuals immediately
  applyColorToLeafletLayer(layer.layerInstance, color);
};

onMounted(async () => {
  if (!mapContainer.value) return;

  // Look up the CRS from our constants using the string from config
  const selectedCrs = CRS_MAP[config.crs] || L.CRS.EPSG3857;

  map = L.map(mapContainer.value, {
    crs: selectedCrs, // Apply the constant here
    center: config.view.center || [0, 0],
    zoom: config.view.zoom || 2,
    minZoom: config.view.minZoom || 1,
    maxZoom: config.view.maxZoom || 18,
    zoomControl: false,
  });

  mapStore.setMap(map);

  const manager = useLayerManager(map);
  layerRegistry = manager.layerRegistry;

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

    if (oldFeature?.properties?.id) {
      const oldLayer = layerRegistry[oldFeature.properties.id];
      if (oldLayer && oldLayer.setStyle) {
        // Reset to the current layer color (not just hardcoded blue)
        const parentLayer = layerStore.layers.find(
          (l) => l.id === oldFeature.properties.layerId
        );
        const baseColor = parentLayer?.color || "#3388ff";

        oldLayer.setStyle({
          weight: 2,
          color: baseColor,
        });
      }
    }

    if (newFeature?.properties?.id) {
      const newLayer = layerRegistry[newFeature.properties.id];
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
  if (resizeObserver) resizeObserver.disconnect();
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