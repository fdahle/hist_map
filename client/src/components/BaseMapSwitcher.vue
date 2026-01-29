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
      <div 
        class="preview-box" 
        :style="{ backgroundImage: `url(${getTileUrl(layer)})` }"
      >
        <div class="overlay-gradient"></div>
      </div>
      
      <span class="label">{{ layer.name }}</span>
      
      <div v-if="layer.active" class="active-indicator"></div>
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

const shouldShowSwitcher = computed(() => baseLayers.value.length > 1);
const isStackMode = computed(() => baseLayers.value.length > 2);

const layersToDisplay = computed(() => {
  // Case 1: Simple Toggle (2 layers) -> Show the one we are NOT viewing
  // This acts as a "Switch to Satellite" button
  if (baseLayers.value.length === 2) {
    return baseLayers.value.filter(l => !l.active);
  }
  
  // Case 2: Multi-select Stack (>2 layers) -> Return ALL. 
  // CSS handles hiding the inactive ones until hover.
  return baseLayers.value;
});

function handleLayerClick(layer) {
  toggleLayer(layers.value.indexOf(layer));
  isHovered.value = false;
}

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
  return urlTemplate.replace('{s}', 'a').replace('{z}', z).replace('{x}', x).replace('{y}', y);
}
</script>

<style scoped>
/* --- Main Container --- */
.base-switcher {
  display: flex;
  gap: 8px;
  background: white;
  padding: 6px;
  border-radius: 12px;
  /* Deep shadow for "floating" effect */
  box-shadow: 0 4px 12px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1);
  pointer-events: auto;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  border: 1px solid rgba(0,0,0,0.05);
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
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.base-thumb:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  z-index: 10;
}

/* Active State Styling */
.base-thumb.active {
  /* Creates a border outside the image */
  box-shadow: 0 0 0 2px #3b82f6; /* Modern Blue Ring */
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

/* Gradient to make text readable */
.overlay-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 50%;
  background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%);
  border-bottom-left-radius: 8px;
  border-bottom-right-radius: 8px;
}

/* --- Label Typography --- */
.label {
  position: absolute;
  bottom: 4px;
  left: 4px;
  right: 4px;
  color: white;
  font-size: 10px;
  font-weight: 600;
  text-transform: capitalize;
  line-height: 1.1;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none; /* Let clicks pass through to container */
}

/* --- STACK MODE (3+ Layers) --- */

/* 1. Default State: Collapsed (Column reverse ensures Active is on top visually if we stacked vertically, 
   but for horizontal strip, we just hide inactive) */
.stack-mode {
  /* If you prefer vertical stack, change to column-reverse */
  flex-direction: row-reverse; 
}

/* Hide inactive layers by default in stack mode */
.stack-mode .base-thumb {
  width: 0;
  padding: 0;
  margin: 0;
  opacity: 0;
  pointer-events: none;
  transition: all 0.3s ease; /* Smooth slide out */
}

/* Always show the active layer */
.stack-mode .base-thumb.active {
  width: 64px;
  opacity: 1;
  pointer-events: auto;
  order: 1; /* Keep it visible */
}

/* 2. Hover State: Expanded */
.base-switcher.stack-mode.is-expanded {
  flex-direction: row; /* Expand normally left-to-right */
  padding-right: 8px;
}

.base-switcher.stack-mode.is-expanded .base-thumb {
  width: 64px;
  opacity: 1;
  pointer-events: auto;
  margin-right: 0;
}
</style>