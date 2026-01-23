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
      :key="layer.id" 
      class="base-thumb"
      :class="{ active: layer.active }"
      @click="handleLayerClick(layer)"
    >
      <div 
        class="preview-box" 
        :style="{ backgroundImage: `url(${getTileUrl(layer)})` }"
      ></div>
      <span class="label">{{ layer.name }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useLayerStore } from "../stores/layerStore";
import { useMapStore } from "../stores/mapStore";

const layerStore = useLayerStore();
const mapStore = useMapStore();

const { layers, baseLayers } = storeToRefs(layerStore);
const { toggleLayer } = layerStore;
const { center, zoom } = storeToRefs(mapStore); 

const isHovered = ref(false);

// --- Logic for Display Modes ---

// 1. Check if we should show the component at all
const shouldShowSwitcher = computed(() => baseLayers.value.length > 1);

// 2. Check if we are in "Stack Mode" (> 2 layers)
const isStackMode = computed(() => baseLayers.value.length > 2);

// 3. Determine which layers to loop through
const layersToDisplay = computed(() => {
  // Case: 2 Layers -> Return ONLY the inactive one (creates a simple toggle)
  if (baseLayers.value.length === 2) {
    return baseLayers.value.filter(l => !l.active);
  }
  
  // Case: >2 Layers -> Return ALL (CSS will hide the inactive ones until hover)
  return baseLayers.value;
});

function handleLayerClick(layer) {
  toggleLayer(layers.value.indexOf(layer));
  // Optional: Close the stack immediately after selection
  isHovered.value = false;
}

// --- Tile Generation (Unchanged) ---
function getTileUrl(layer) {
  if (!center.value || !zoom.value || !layer.layerInstance) return "";

  const lat = center.value.lat;
  const lon = center.value.lng;
  const z = Math.max(0, zoom.value - 1); 

  const n = Math.pow(2, z);
  const x = Math.floor(n * ((lon + 180) / 360));
  
  const latRad = lat * Math.PI / 180;
  const y = Math.floor(n * (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2);

  let urlTemplate = layer.layerInstance._url; 
  if (!urlTemplate) return ''; 

  return urlTemplate
    .replace('{s}', 'a')
    .replace('{z}', z)
    .replace('{x}', x)
    .replace('{y}', y);
}
</script>

<style scoped>
.base-switcher {
  display: flex;
  gap: 10px;
  background: white;
  padding: 8px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  pointer-events: auto;
  transition: all 0.3s ease;
  
  /* Ensure consistent width/height when collapsed to avoid jumping */
  min-width: 76px; 
}

/* --- Base Thumb Styles --- */
.base-thumb {
  cursor: pointer;
  width: 60px;
  text-align: center;
  opacity: 0.8;
  transition: opacity 0.2s, transform 0.2s;
  flex-shrink: 0; /* Prevent squishing */
}

.base-thumb:hover {
  opacity: 1;
}

.base-thumb.active {
  opacity: 1;
  font-weight: bold;
}

.base-thumb.active .preview-box {
  border: 2px solid #007bff;
}

.preview-box {
  width: 60px; /* Fixed width */
  height: 40px;
  background-color: #ccc; 
  background-size: cover; 
  background-position: center;
  border-radius: 6px;
  margin-bottom: 5px;
  border: 2px solid transparent;
  transition: border 0.3s ease;
}

.label {
  font-size: 10px;
  display: block;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* --- STACK MODE LOGIC (> 2 layers) --- */

/* By default in stack mode, sort layers so Active is first */
.stack-mode {
  flex-direction: column-reverse; /* Or row-reverse depending on preference */
}

/* Use flex order to force the active layer to the "front" of the list */
.stack-mode .base-thumb {
  display: none; /* Hide everyone by default */
  order: 2;      /* Default order */
}

.stack-mode .base-thumb.active {
  display: block; /* Always show active */
  order: 1;       /* Move to front */
}

/* WHEN HOVERED: Show everyone */
.base-switcher.stack-mode.is-expanded .base-thumb {
  display: block;
}

/* Optional: Layout adjustment when expanded */
.base-switcher.stack-mode.is-expanded {
  flex-direction: row; /* Expand horizontally */
  /* If you prefer a vertical dropdown list, use flex-direction: column; */
}
</style>