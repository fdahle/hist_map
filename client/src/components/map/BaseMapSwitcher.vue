<template>
  <div v-if="shouldShowSwitcher" ref="rootEl" class="base-switcher">

    <!-- Toggle button: shows the active layer thumbnail + name -->
    <button class="switcher-toggle" @click="isOpen = !isOpen" :title="isOpen ? 'Close layer picker' : 'Switch base map'">
      <div class="toggle-thumb" :style="getPreviewStyle(activeLayer)"></div>
      <span class="toggle-label">{{ activeLayer?.name ?? 'Base map' }}</span>
      <svg class="toggle-chevron" :class="{ open: isOpen }" viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
        <path d="M8 5l5 5H3l5-5z"/>
      </svg>
    </button>

    <!-- Dropdown: vertical list of all layers -->
    <Transition name="dropdown">
      <div v-if="isOpen" class="layer-list">
        <div
          v-for="layer in sortedLayers"
          :key="layer._layerId"
          class="layer-row"
          :class="{
            'is-active': layer.active,
            'crs-incompatible': layer.crsCompatible === false,
          }"
          :title="layer.crsCompatible === false
            ? 'This layer does not support the current map projection (' + mapCrs + ')'
            : undefined"
          @click="handleLayerClick(layer)"
        >
          <!-- Thumbnail -->
          <div class="row-thumb" :style="getPreviewStyle(layer)">
            <div v-if="layer.crsCompatible === false" class="crs-warning-badge">
              <svg viewBox="0 0 16 16" width="9" height="9" fill="currentColor">
                <path d="M8 1L0 15h16L8 1zm0 3l5.5 10H2.5L8 4zm-.75 3v3.5h1.5V7H7.25zm0 4.5V13h1.5v-1.5H7.25z"/>
              </svg>
            </div>
          </div>

          <!-- Name -->
          <span class="row-name">{{ layer.name }}</span>

          <!-- Active checkmark -->
          <svg v-if="layer.active" class="row-check" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M13 3L6 11 3 8l-1 1 4 4 8-9z"/>
          </svg>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { useLayerStore } from "../../stores/map/layerStore";
import { useMapStore } from "../../stores/map/mapStore";

// --- STATE & STORES ---
const layerStore = useLayerStore();
const mapStore = useMapStore();

const { baseLayers } = storeToRefs(layerStore);
const { map } = storeToRefs(mapStore);
const { toggleLayer } = layerStore;

const mapCrs = computed(() => map.value?.getView().getProjection().getCode() ?? "");

const isOpen = ref(false);
const rootEl = ref(null);
const previewUrls = ref({});

// --- COMPUTED ---
const shouldShowSwitcher = computed(() => baseLayers.value.length > 1);

const sortedLayers = computed(() =>
  [...baseLayers.value].sort((a, b) => (a.order || 0) - (b.order || 0))
);

const activeLayer = computed(() => sortedLayers.value.find((l) => l.active) ?? sortedLayers.value[0]);

// --- CLICK OUTSIDE TO CLOSE ---
function onDocClick(e) {
  if (rootEl.value && !rootEl.value.contains(e.target)) {
    isOpen.value = false;
  }
}

onMounted(() => document.addEventListener("click", onDocClick, true));
onUnmounted(() => {
  document.removeEventListener("click", onDocClick, true);
  if (map.value) {
    const view = map.value.getView();
    view.un("change:center", debouncedUpdate);
    view.un("change:resolution", debouncedUpdate);
  }
});

// --- PREVIEW URL LOGIC ---
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

const updatePreviews = () => {
  if (!map.value) return;
  baseLayers.value.forEach((layer) => {
    if (!layer.preview_image && layer.status === "ready" && layer.layerInstance) {
      previewUrls.value[layer._layerId] = getDynamicTileUrl(layer);
    }
  });
};

const debouncedUpdate = debounce(updatePreviews, 500);

watch(
  map,
  (newMap, oldMap) => {
    if (oldMap) {
      const oldView = oldMap.getView();
      oldView.un("change:center", debouncedUpdate);
      oldView.un("change:resolution", debouncedUpdate);
    }
    if (newMap) {
      updatePreviews();
      const view = newMap.getView();
      view.on("change:center", debouncedUpdate);
      view.on("change:resolution", debouncedUpdate);
    }
  },
  { immediate: true }
);

function getDynamicTileUrl(layer) {
  if (!layer.layerInstance || !map.value) return "";
  const source = layer.layerInstance.getSource();
  const view = map.value.getView();
  if (!source || !view) return "";
  if (typeof source.getTileGrid !== "function") return "";
  const tileGrid = source.getTileGrid();
  const tileUrlFunc = source.getTileUrlFunction();
  if (!tileGrid || !tileUrlFunc) return "";
  const tileCoord = tileGrid.getTileCoordForCoordAndResolution(view.getCenter(), view.getResolution());
  return tileUrlFunc(tileCoord, 1, view.getProjection()) || "";
}

function getPreviewStyle(layer) {
  if (!layer) return { backgroundColor: "#e0e0e0" };
  if (layer.preview_image) return { backgroundImage: `url(${layer.preview_image})` };
  const liveUrl = previewUrls.value[layer._layerId];
  if (liveUrl) return { backgroundImage: `url(${liveUrl})` };
  return { backgroundColor: "#e0e0e0" };
}

function handleLayerClick(layer) {
  if (layer.crsCompatible === false) return;
  toggleLayer(layer._layerId);
  isOpen.value = false;
}
</script>

<style scoped>
/* --- Root wrapper (positioned so dropdown aligns above the button) --- */
.base-switcher {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  pointer-events: auto;
}

/* --- Toggle button --- */
.switcher-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px 5px 5px;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  user-select: none;
  transition: box-shadow 0.15s ease, background 0.15s ease;
  min-width: 130px;
}

.switcher-toggle:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

.theme-dark .switcher-toggle {
  background: #2a2a2a;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  color: #e0e0e0;
}

.toggle-thumb {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background-color: #ddd;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}

.theme-dark .toggle-thumb {
  background-color: #444;
}

.toggle-label {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: #333;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theme-dark .toggle-label {
  color: #e0e0e0;
}

.toggle-chevron {
  flex-shrink: 0;
  color: #888;
  transition: transform 0.2s ease;
  transform: rotate(0deg);
}

.toggle-chevron.open {
  transform: rotate(180deg);
}

/* --- Dropdown panel --- */
.layer-list {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  z-index: 1000;
}

.theme-dark .layer-list {
  background: #2a2a2a;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

/* --- Layer rows --- */
.layer-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px 6px 6px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.layer-row:not(:last-child) {
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.theme-dark .layer-row:not(:last-child) {
  border-bottom-color: rgba(255, 255, 255, 0.07);
}

.layer-row:hover:not(.crs-incompatible) {
  background: rgba(59, 130, 246, 0.07);
}

.theme-dark .layer-row:hover:not(.crs-incompatible) {
  background: rgba(59, 130, 246, 0.12);
}

.layer-row.is-active {
  background: rgba(59, 130, 246, 0.1);
}

.theme-dark .layer-row.is-active {
  background: rgba(59, 130, 246, 0.18);
}

.layer-row.crs-incompatible {
  cursor: not-allowed;
  opacity: 0.55;
}

/* --- Row thumbnail --- */
.row-thumb {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background-color: #ddd;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}

.theme-dark .row-thumb {
  background-color: #444;
}

/* --- Row label --- */
.row-name {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theme-dark .row-name {
  color: #e0e0e0;
}

/* --- Active checkmark --- */
.row-check {
  flex-shrink: 0;
  color: #3b82f6;
}

/* --- CRS warning badge (on thumbnail) --- */
.crs-warning-badge {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #f59e0b;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  pointer-events: none;
}

/* --- Dropdown transition --- */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>