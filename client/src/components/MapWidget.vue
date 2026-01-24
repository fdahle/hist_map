<template>
  <div class="map-container">
    <div id="map" ref="mapContainer"></div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, inject, ref, watch } from "vue"; // <--- Added 'watch'
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// --- IMPORTS ---
import { useLayerStore } from "../stores/layerStore";
import { useMapStore } from "../stores/mapStore";
import { useSelectionStore } from "../stores/selectionStore";
import { generateUUID } from "../composables/utils"; 

// --- STATE ---
const mapContainer = ref(null);
let map = null;
let resizeObserver = null;

// --- REGISTRY (The missing piece!) ---
// This acts as a database: "ID -> Leaflet Layer"
const layerRegistry = {}; 

// --- CONFIG & STORES ---
const configRef = inject("config");
const config = configRef.value;

const layerStore = useLayerStore();
const mapStore = useMapStore();
const selectionStore = useSelectionStore();

onMounted(async () => {
  if (!mapContainer.value) return;

  map = L.map(mapContainer.value, {
    center: config.view.center || [0, 0],
    zoom: config.view.zoom || 2,
    minZoom: config.view.minZoom || 1,
    maxZoom: config.view.maxZoom || 18,
    zoomControl: false,
  });

  mapStore.setMap(map);

  const processLayer = async (layerConf, category) => {
    let leafletLayer = null;
    let geometryType = "unknown";

    if (layerConf.type === "tile") {
      leafletLayer = L.tileLayer(layerConf.url, {
        attribution: layerConf.attribution,
        _url: layerConf.url,
      });
    }

    else if (layerConf.type === "geojson") {
      try {
        const res = await fetch(layerConf.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.features && data.features.length > 0) {
          geometryType = data.features[0].geometry.type;
        }

        leafletLayer = L.geoJSON(data, {
          style: {
            color: layerConf.color || "#3388ff",
            weight: 2,
            originalColor: layerConf.color || "#3388ff" // <--- Important: Save original color
          },
          onEachFeature: (feature, layer) => {
            // 1. ENSURE ID
            if (!feature.properties.id) {
              feature.properties.id = generateUUID();
            }

            // 2. REGISTER (Now this works because layerRegistry exists)
            layerRegistry[feature.properties.id] = layer;

            // 3. TOOLTIP
            if (feature.properties && feature.properties.name) {
              layer.bindTooltip(feature.properties.name, {
                direction: "top",
                offset: [0, -10],
                opacity: 0.9,
                sticky: true,
              });
            }

            // 4. CLICK (Cleaned up)
            layer.on("click", (e) => {
              L.DomEvent.stopPropagation(e);
              // We ONLY update the store. The watcher below handles the visual changes.
              selectionStore.selectFeature(feature);
            });
          },
        });
      } catch (err) {
        console.error(`Failed to load GeoJSON: ${layerConf.name}`, err);
      }
    }

    if (leafletLayer) {
      if (layerConf.visible) leafletLayer.addTo(map);
      layerStore.addLayer(
        layerConf.name,
        leafletLayer,
        layerConf.type,
        category,
        layerConf.visible,
        geometryType,
        layerConf.color
      );
    }
  };

  if (config.base_layers) {
    for (const layer of config.base_layers) await processLayer(layer, "base");
  }
  if (config.overlay_layers) {
    for (const layer of config.overlay_layers) await processLayer(layer, "overlay");
  }

  resizeObserver = new ResizeObserver(() => {
    map.invalidateSize();
  });
  resizeObserver.observe(mapContainer.value);
});

// --- THE WATCHER (Handles Exclusive Selection) ---
watch(
  () => selectionStore.selectedFeature,
  (newFeature, oldFeature) => {
    
    // 1. Un-highlight Old
    if (oldFeature && oldFeature.properties.id) {
      const oldLayer = layerRegistry[oldFeature.properties.id];
      if (oldLayer) {
        oldLayer.setStyle({
          weight: 2,
          color: oldLayer.options.originalColor // Restore Blue/Red/Green
        });
      }
    }

    // 2. Highlight New
    if (newFeature && newFeature.properties.id) {
      const newLayer = layerRegistry[newFeature.properties.id];
      if (newLayer) {
        newLayer.setStyle({
          weight: 5,
          color: '#FFFF00' // Highlight Yellow
        });
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