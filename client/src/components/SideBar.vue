<template>
  <div class="sidebar">
    <div class="header">
      <h3>Map Layers</h3>
    </div>

    <div class="layer-list">
      <div
        v-for="(layer, index) in overlayLayers"
        :key="layer.id"
        class="layer-row"
        :class="{ active: layer.active }"
        @contextmenu.prevent="handleRightClick($event, layer)"
      >
        <label>
          <input
            type="checkbox"
            :checked="layer.active"
            @change="toggleLayer(layers.indexOf(layer))"
          />

          <span class="geom-icon" :style="{ color: layer.color || '#666' }">
            <svg
              v-if="getIconType(layer.geometryType) === 'point'"
              viewBox="0 0 24 24"
              width="16"
              height="16"
            >
              <circle cx="12" cy="12" r="6" fill="currentColor" />
            </svg>
            <svg
              v-else-if="getIconType(layer.geometryType) === 'line'"
              viewBox="0 0 24 24"
              width="16"
              height="16"
            >
              <path
                d="M3 17 L9 7 L15 17 L21 7"
                stroke="currentColor"
                stroke-width="2.5"
                fill="none"
              />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16">
              <rect x="4" y="4" width="16" height="16" rx="2" fill="#ccc" />
            </svg>
          </span>

          <span class="layer-name">{{ layer.name }}</span>
        </label>
      </div>

      <div v-if="overlayLayers.length === 0" class="empty-state">
        No overlay layers loaded.
      </div>
    </div>

    <ContextMenu
      ref="contextMenuRef"
      @action="handleMenuAction"
      @color-change="handleColorChange"
    />
  </div>
</template>

<script setup>
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useLayerStore } from "../stores/layerStore";
import { useMapStore } from "../stores/mapStore"; // Need map store for Zooming
import ContextMenu from "./ContextMenu.vue"; // Import the menu

const layerStore = useLayerStore();
const mapStore = useMapStore();

const { layers, overlayLayers } = storeToRefs(layerStore);
const { toggleLayer } = layerStore;

const contextMenuRef = ref(null);

// Helper for icons (Same as your code)
const getIconType = (layerType) => {
  const type = layerType?.toLowerCase() || "unknown";
  if (type.includes("point")) return "point";
  if (type.includes("line")) return "line";
  return "unknown";
};

// --- 1. OPEN MENU ---
const handleRightClick = (event, layer) => {
  // Only open if the layer is actually active/visible (optional UX choice)
  // if (!layer.active) return;

  contextMenuRef.value.open(event, layer);
};

// --- 2. HANDLE ACTIONS ---
const handleMenuAction = ({ type, layer }) => {
  if (!layer.layerInstance) {
    console.warn("Layer has no map instance");
    return;
  }

  // Action: Zoom
  if (type === "zoom") {
    const map = mapStore.getMap();
    if (map) {
      const bounds = layer.layerInstance.getBounds();
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [50, 50] });
      }
    }
  }

  // Action: Download
  if (type === "download") {
    // Convert Leaflet layer back to GeoJSON
    const geojson = layer.layerInstance.toGeoJSON();

    // Create download link
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(geojson));
    const el = document.createElement("a");
    el.setAttribute("href", dataStr);
    el.setAttribute("download", `${layer.name}.json`);
    document.body.appendChild(el);
    el.click();
    el.remove();
  }
};

// --- 3. HANDLE COLOR CHANGE ---
const handleColorChange = ({ color, layer }) => {
  if (layer.layerInstance) {
    // Update Leaflet Map Visuals
    layer.layerInstance.setStyle({ color: color });

    // Update Store (so the sidebar icon updates too!)
    layer.color = color;
  }
};
</script>

<style scoped>
.sidebar {
  width: 280px;
  height: 100%;
  background: #f8f9fa;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.1);
  font-family: "Segoe UI", sans-serif;
  z-index: 2000; /* High z-index to sit on top of map */
  pointer-events: auto; /* Ensure clicks work */
}

.header {
  padding: 15px;
  background: #343a40;
  color: white;
}

.header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.layer-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.layer-row {
  display: flex;
  align-items: center;
  padding: 8px;
  margin-bottom: 5px;
  background: white;
  border: 1px solid #eee;
  border-radius: 4px;
  transition: all 0.2s;
}

.layer-row:hover {
  background: #f1f1f1;
}

.layer-row.active {
  border-left: 4px solid #007bff;
}

label {
  display: flex;
  align-items: center;
  width: 100%;
  cursor: pointer;
}

.layer-name {
  margin-left: 10px;
  font-size: 14px;
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 13px;
}

.geom-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px; /* Space from checkbox */
  margin-right: 4px; /* Space from text */
  width: 20px;
}

/* Optional: Make the checkbox slightly smaller if the row feels crowded */
input[type="checkbox"] {
  cursor: pointer;
}
</style>