<template>
  <div class="map-container">
    <div id="map" ref="mapContainer"></div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, inject, ref } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// --- IMPORTS: Stores ---
import { useLayerStore } from "../stores/layerStore";
import { useMapStore } from "../stores/mapStore";
import { useSelectionStore } from "../stores/selectionStore"; // <--- 1. Import Selection Store

// --- IMPORTS: Utils ---
import { generateUUID } from "../composables/utils"; // <--- Import it here

// --- STATE ---
const mapContainer = ref(null);
let map = null;
let resizeObserver = null;

// --- CONFIG & STORES ---
const configRef = inject("config");
const config = configRef.value;

const layerStore = useLayerStore();
const mapStore = useMapStore();
const selectionStore = useSelectionStore(); // <--- 2. Initialize Selection Store

onMounted(async () => {
  if (!mapContainer.value) return;

  // Initialize Leaflet
  map = L.map(mapContainer.value, {
    center: config.view.center || [0, 0],
    zoom: config.view.zoom || 2,
    minZoom: config.view.minZoom || 1,
    maxZoom: config.view.maxZoom || 18,
    zoomControl: false,
  });

  mapStore.setMap(map);

  // --- Process Layer Helper ---
  const processLayer = async (layerConf, category) => {
    let leafletLayer = null;
    let geometryType = "unknown"; // Default type for icons

    // A. Tile Layers
    if (layerConf.type === "tile") {
      leafletLayer = L.tileLayer(layerConf.url, {
        attribution: layerConf.attribution,
        _url: layerConf.url,
      });
    }

    // B. GeoJSON Layers
    else if (layerConf.type === "geojson") {
      try {
        const res = await fetch(layerConf.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Detect Geometry Type for Sidebar Icons
        if (data.features && data.features.length > 0) {
          geometryType = data.features[0].geometry.type;
        }

        leafletLayer = L.geoJSON(data, {
          style: {
            color: layerConf.color || "#3388ff",
            weight: 2,
          },
          onEachFeature: (feature, layer) => {
            // 1. ENSURE ID
            if (!feature.properties.id) {
              // Now you have a real, permanent-looking ID
              feature.properties.id = generateUUID();
            }

            layerRegistry[feature.properties.id] = layer;

            // 1. Hover (Tooltip)
            // Shows a small label with the name when hovering
            if (feature.properties && feature.properties.name) {
              layer.bindTooltip(feature.properties.name, {
                direction: "top",
                offset: [0, -10], // Shift slightly up
                opacity: 0.9,
                sticky: true, // Follows mouse slightly (optional)
              });
            }

            // 2. Click (Sidebar Selection)
            layer.on("click", (e) => {
              L.DomEvent.stopPropagation(e); // Stop map click events

              // Send the full feature to the selection store
              // This triggers the sidebar attribute panel to open
              selectionStore.selectFeature(feature);

              // Optional: You can also visually highlight the layer here if you want
              e.target.setStyle({ weight: 5, color: "#ff0000" });
            });
          },
        });
      } catch (err) {
        console.error(`Failed to load GeoJSON: ${layerConf.name}`, err);
      }
    }

    // C. Add to Map & Store
    if (leafletLayer) {
      if (layerConf.visible) {
        leafletLayer.addTo(map);
      }

      layerStore.addLayer(
        layerConf.name,
        leafletLayer,
        layerConf.type,
        category,
        layerConf.visible,
        geometryType, // <--- Pass the detected geometry type to the store!
        layerConf.color // Pass color for the icon
      );
    }
  };

  // --- Load Layers ---
  if (config.base_layers) {
    for (const layer of config.base_layers) await processLayer(layer, "base");
  }
  if (config.overlay_layers) {
    for (const layer of config.overlay_layers)
      await processLayer(layer, "overlay");
  }

  // --- Resize Handler ---
  resizeObserver = new ResizeObserver(() => {
    map.invalidateSize();
  });
  resizeObserver.observe(mapContainer.value);
});

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