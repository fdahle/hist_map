<template>
  <div
    v-if="shouldShowSwitcher"
    class="base-switcher"
    :class="{ 'is-expanded': isHovered, 'stack-mode': isStackMode }"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <div
      v-for="layer in layersToDisplay"
      :key="layer._layerId"
      class="base-thumb"
      :class="{ active: layer.active }"
      @click="handleLayerClick(layer)"
    >
      <div class="preview-box" :style="getPreviewStyle(layer)">
        <div class="overlay-gradient"></div>
      </div>

      <span class="label">{{ layer.name }}</span>

      <div v-if="layer.active" class="active-indicator"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { useLayerStore } from "../stores/layerStore";
import { useMapStore } from "../stores/mapStore";

// --- STATE & STORES ---
const layerStore = useLayerStore();
const mapStore = useMapStore();

const { baseLayers } = storeToRefs(layerStore);
const { map } = storeToRefs(mapStore);
const { toggleLayer } = layerStore;

const isHovered = ref(false);
const previewUrls = ref({}); // Stores the calculated live URLs

// --- COMPUTED PROPS ---
const shouldShowSwitcher = computed(() => baseLayers.value.length > 1);
const isStackMode = computed(() => baseLayers.value.length > 2);

const layersToDisplay = computed(() => {
  // 1. Always sort by config order for stability
  const sorted = [...baseLayers.value].sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  );

  // 2. If COLLAPSED: Show exactly one alternative
  if (!isHovered.value) {
    // Find the first inactive layer to act as the "Switch to..." button
    const inactive = sorted.find((l) => !l.active);
    return inactive ? [inactive] : [sorted[0]];
  }

  // 3. If EXPANDED: Show all layers in order
  return sorted;
});

// --- HELPER: Simple Debounce (to avoid too many calculations while dragging) ---
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// --- CORE LOGIC: Update Previews ---
const updatePreviews = () => {
  if (!map.value) return;

  baseLayers.value.forEach((layer) => {
    // Only calculate dynamic URL if we don't have a static image
    // and the layer is ready
    if (
      !layer.preview_image &&
      layer.status === "ready" &&
      layer.layerInstance
    ) {
      previewUrls.value[layer._layerId] = getDynamicTileUrl(layer);
    }
  });
};

const debouncedUpdate = debounce(updatePreviews, 500);

// --- WATCHER: Setup Live Map Listeners ---
watch(
  map,
  (newMap) => {
    if (newMap) {
      const view = newMap.getView();

      // 1. Initial Calculation
      updatePreviews();

      // 2. Bind to View changes for "Live" effect
      view.on("change:center", debouncedUpdate);
      view.on("change:resolution", debouncedUpdate);
    }
  },
  { immediate: true }
);

// --- GENERIC OPENLAYERS TILE URL FUNCTION ---
function getDynamicTileUrl(layer) {
  if (!layer.layerInstance || !map.value) return "";

  const source = layer.layerInstance.getSource();
  const view = map.value.getView();

  if (!source || !view) return "";

  // Check if source handles tiles
  if (typeof source.getTileGrid !== "function") return "";

  const tileGrid = source.getTileGrid();
  const tileUrlFunc = source.getTileUrlFunction();

  if (!tileGrid || !tileUrlFunc) return "";

  // Get tile coordinate for the Map Center
  const tileCoord = tileGrid.getTileCoordForCoordAndResolution(
    view.getCenter(),
    view.getResolution()
  );

  // Generate URL (pixelRatio = 1)
  return tileUrlFunc(tileCoord, 1, view.getProjection()) || "";
}

// --- STYLE HANDLER ---
function getPreviewStyle(layer) {
  // Priority 1: Static Image from Config (Best for Antarctica)
  if (layer.preview_image) {
    return { backgroundImage: `url(${layer.preview_image})` };
  }

  // Priority 2: Calculated Live URL
  const liveUrl = previewUrls.value[layer._layerId];
  if (liveUrl) {
    return { backgroundImage: `url(${liveUrl})` };
  }

  // Fallback: Grey background
  return { backgroundColor: "#e0e0e0" };
}

function handleLayerClick(layer) {
  toggleLayer(layer._layerId);
  isHovered.value = false;
}

// --- CLEANUP ---
onUnmounted(() => {
  if (map.value) {
    const view = map.value.getView();
    view.un("change:center", debouncedUpdate);
    view.un("change:resolution", debouncedUpdate);
  }
});
</script>

<style scoped>
/* --- Main Container --- */
.base-switcher {
  display: flex;
  gap: 8px;
  background: white;
  padding: 6px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
  pointer-events: auto;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  border: 1px solid rgba(0, 0, 0, 0.05);
  min-width: 64px;
}

/* --- Thumbnails --- */
.base-thumb {
  position: relative;
  cursor: pointer;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  /* Smoother transition for expanding/collapsing */
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.3s ease;
}

/* Hover effect for individual thumbs */
.base-thumb:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  z-index: 10;
}

/* Highlight the layer that is currently on the map */
.base-thumb.active {
  box-shadow: 0 0 0 2px #3b82f6;
}

/* --- Preview Image Box --- */
.preview-box {
  width: 100%;
  height: 100%;
  background-color: #eee;
  background-size: cover;
  background-position: center;
  position: relative;
}

/* Gradient and Labels */
.overlay-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 50%;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, transparent 100%);
}

.label {
  position: absolute;
  bottom: 4px;
  left: 4px;
  right: 4px;
  color: white;
  font-size: 10px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>