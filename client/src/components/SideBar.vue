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
        :class="{ 
          active: layer.active,
          'is-loading': layer.progress < 100 
        }"
        @contextmenu.prevent="handleRightClick($event, layer)"
      >
        <div v-if="layer.progress < 100" class="progress-bg">
          <div 
            class="progress-fill" 
            :style="{ width: layer.progress + '%' }"
          ></div>
        </div>

        <label>
          <input
            type="checkbox"
            :checked="layer.active"
            :disabled="layer.progress < 100"
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

          <span class="layer-name">
            {{ layer.name }}
            <small v-if="layer.progress < 100" class="loading-text">
              ({{ layer.progress }}%)
            </small>
          </span>
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
import { useMapStore } from "../stores/mapStore";
import ContextMenu from "./ContextMenu.vue";

const layerStore = useLayerStore();
const mapStore = useMapStore();

const { layers, overlayLayers } = storeToRefs(layerStore);
const { toggleLayer } = layerStore;

const contextMenuRef = ref(null);

const getIconType = (layerType) => {
  const type = layerType?.toLowerCase() || "unknown";
  if (type.includes("point")) return "point";
  if (type.includes("line")) return "line";
  return "unknown";
};

const handleRightClick = (event, layer) => {
  // Prevent context menu while loading
  if (layer.progress < 100) return;
  contextMenuRef.value.open(event, layer);
};

const handleMenuAction = ({ type, layer }) => {
  if (!layer.layerInstance) return;

  if (type === "zoom") {
    const map = mapStore.getMap();
    if (map) {
      const bounds = layer.layerInstance.getBounds();
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [50, 50] });
      }
    }
  }

  if (type === "download") {
    const geojson = layer.layerInstance.toGeoJSON();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geojson));
    const el = document.createElement("a");
    el.setAttribute("href", dataStr);
    el.setAttribute("download", `${layer.name}.json`);
    document.body.appendChild(el);
    el.click();
    el.remove();
  }
};

const handleColorChange = ({ color, layer }) => {
  layerStore.updateLayerColor(layer.id, color);
};
</script>

<style scoped>
/* Main sidebar setup */
.sidebar {
  width: 280px;
  height: 100%;
  background: #f8f9fa;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.1);
  font-family: "Segoe UI", sans-serif;
  z-index: 2000;
  pointer-events: auto;
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
  position: relative; /* Needed for absolute progress bar */
  display: flex;
  align-items: center;
  padding: 8px;
  margin-bottom: 5px;
  background: white;
  border: 1px solid #eee;
  border-radius: 4px;
  transition: all 0.2s;
  overflow: hidden; /* Keep progress bar within rounded corners */
}

.layer-row:hover {
  background: #f1f1f1;
}

.layer-row.active {
  border-left: 4px solid #007bff;
}

/* Progress Bar Styling */
.progress-bg {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: #e9ecef;
}

.progress-fill {
  height: 100%;
  background: #28a745; /* Green for loading progress */
  transition: width 0.3s ease;
}

.loading-text {
  color: #6c757d;
  font-size: 11px;
  margin-left: 5px;
}

.is-loading {
  background: #fdfdfd;
  opacity: 0.8;
  cursor: wait;
}

label {
  display: flex;
  align-items: center;
  width: 100%;
  cursor: pointer;
  z-index: 1; /* Keep text above progress bar background */
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
  margin-left: 8px;
  margin-right: 4px;
  width: 20px;
}

input[type="checkbox"] {
  cursor: pointer;
}

input[type="checkbox"]:disabled {
  cursor: not-allowed;
}
</style>