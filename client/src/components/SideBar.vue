<template>
  <div class="sidebar">
    <div class="header">
      <h3>Map Layers</h3>
    </div>

    <div class="layer-list">
      <div
        v-for="layer in overlayLayers"
        :key="layer.id"
        class="layer-row"
        :class="{
          active: layer.active,
          'is-idle': layer.status === 'idle',
          'layer-error': layer.status === 'error',
        }"
        @contextmenu.prevent="handleRightClick($event, layer)"
      >
        <div
          v-if="['downloading', 'processing'].includes(layer.status)"
          class="progress-bg"
        >
          <div
            class="progress-fill"
            :class="layer.status"
            :style="{ width: layer.progress + '%' }"
          ></div>
        </div>

        <label :class="{ 'disabled-label': layer.status === 'error' }">
          <input
            type="checkbox"
            :checked="layer.active"
            :disabled="
              ['downloading', 'processing', 'error'].includes(layer.status)
            "
            @change="layerStore.toggleLayer(layer.id)"
          />

          <span class="icon-container">
            <div
              v-if="['downloading', 'processing'].includes(layer.status)"
              class="spinner"
            ></div>

            <span
              v-else
              class="geom-icon"
              :style="{
                color:
                  layer.status === 'error' ? '#ccc' : layer.color || '#666',
              }"
            >
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
                <rect
                  x="4"
                  y="4"
                  width="16"
                  height="16"
                  rx="2"
                  fill="currentColor"
                  opacity="0.5"
                />
              </svg>
            </span>
          </span>

          <div class="layer-title-content">
            <span
              class="layer-name-text"
              :style="{ color: layer.status === 'error' ? '#888' : 'inherit' }"
            >
              {{ layer.name }}

              <small v-if="layer.status === 'downloading'" class="loading-text">
                (DL {{ layer.progress }}%)
              </small>
              <small
                v-else-if="layer.status === 'processing'"
                class="loading-text"
              >
                (Proc {{ layer.progress }}%)
              </small>
            </span>
            <span
              v-if="layer.status === 'error'"
              class="error-icon"
              :title="layer.error"
            >
              ⚠️
            </span>
          </div>
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

const { overlayLayers } = storeToRefs(layerStore);
const contextMenuRef = ref(null);

const getIconType = (layerType) => {
  const type = layerType?.toLowerCase() || "unknown";
  if (type.includes("point")) return "point";
  if (type.includes("line")) return "line";
  return "unknown"; // Default icon for unknown or polygon
};

const handleRightClick = (event, layer) => {
  if (layer.status !== "ready") return;
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

const handleColorChange = ({ color, layer }) => {
  layerStore.updateLayerColor(layer.id, color);
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
  position: relative;
  display: flex;
  align-items: center;
  padding: 8px;
  margin-bottom: 5px;
  background: white;
  border: 1px solid #eee;
  border-radius: 4px;
  transition: all 0.2s;
  overflow: hidden;
}

.layer-row:hover:not(.layer-error) {
  background: #f1f1f1;
}

.layer-row.active {
  border-left: 4px solid #007bff;
}

/* Idle state styling */
.layer-row.is-idle .layer-name-text {
  color: #777;
}
.layer-row.is-idle .geom-icon {
  opacity: 0.5;
  filter: grayscale(100%);
}

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
  background: #17a2b8; /* Blue for downloading */
  transition: width 0.3s ease;
}

.progress-fill.processing {
  background: #28a745; /* Green for processing */
}

.loading-text {
  color: #6c757d;
  font-size: 11px;
  margin-left: 5px;
}

label {
  display: flex;
  align-items: center;
  width: 100%;
  cursor: pointer;
  z-index: 1;
}

.layer-title-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin-left: 10px;
}

.layer-name-text {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.layer-error {
  background: #fdf2f2 !important;
  border: 1px solid #fababa !important;
  cursor: not-allowed;
}

.disabled-label {
  cursor: not-allowed;
}

.error-icon {
  color: #ff4444;
  margin-left: 8px;
  cursor: help;
  flex-shrink: 0;
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 13px;
}

.icon-container {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  margin-right: 4px;
  flex-shrink: 0;
}

.geom-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

/* Spinner Animation */
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #ccc;
  border-top-color: #007bff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

input[type="checkbox"] {
  cursor: pointer;
  flex-shrink: 0;
}

input[type="checkbox"]:disabled {
  cursor: not-allowed;
}
</style>